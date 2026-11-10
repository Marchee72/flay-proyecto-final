import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { POST as webhookRoute } from '@/app/api/pagos/webhook/route'
import {
  guardarCredencialesPago,
  verEstadoCredencialPago,
} from '@/aplicacion/administradoras/credenciales-pago'
import { confirmarPagoEnLinea } from '@/aplicacion/pagos/confirmar-pago-en-linea'
import {
  consultarDisponibilidadPagoEnLinea,
  ExpensaNoEsUltimaVigente,
  ExpensaSinSaldoPendiente,
  iniciarPagoEnLinea,
  PasarelaNoConfigurada,
} from '@/aplicacion/pagos/iniciar-pago-en-linea'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { PagoBloqueadoHastaLiquidar, registrarPago } from '@/aplicacion/pagos/registrar'
import { periodoPara } from '@/aplicacion/periodos/periodos'
import { procesadorDePrueba } from '@/infraestructura/pagos/procesador-de-prueba'
import { prismaBase } from '@/infraestructura/prisma'

import { relojFijo } from '../dominio/reloj-fijo'
import { crearAdministradora, crearConsorcio } from './ayudas'
import {
  administrador,
  consorcioId,
  emitirMes,
  inquilino,
  limpiarEscenario,
  prepararEscenario,
  RELOJ,
  repo,
  rubroId,
  unidadA,
} from './ayudas-pago-en-linea'

/**
 * Pruebas de integracion del flujo completo de pago en linea con Mercado Pago (`RF-28`).
 */

beforeEach(prepararEscenario)
afterEach(limpiarEscenario)

describe('pago en linea de expensas (RF-28)', () => {
  it('permite al administrador configurar credenciales y estas quedan resguardadas cifradas', async () => {
    const estadoInicial = await verEstadoCredencialPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
    })
    expect(estadoInicial.configurado).toBe(false)

    const guardado = await guardarCredencialesPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      accessToken: 'TEST-ACCESS-TOKEN-SECRET-1234',
      secretoWebhook: 'webhook_secret_9999',
    })

    expect(guardado.configurado).toBe(true)
    expect(guardado.ultimosCuatro).toBe('1234')

    // Verificar que en la base de datos no este en texto plano
    const enBase = await prismaBase.credencialPagoAdministradora.findFirstOrThrow()
    expect(enBase.accessTokenCifrado).not.toContain('TEST-ACCESS-TOKEN')
    expect(enBase.secretoWebhookCifrado).not.toContain('webhook_secret')
  })

  it('iniciarPagoEnLinea rechaza si la administradora no tiene credenciales configuradas', async () => {
    const liq = await emitirMes(1)
    const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: liq.liquidacionId, unidadId: unidadA },
    })

    await expect(
      iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
        usuarioId: inquilino,
        consorcioId,
        detalleLiquidacionId: detalle.id,
        urlBaseRetorno: 'https://consorcio.app/volver',
      }),
    ).rejects.toBeInstanceOf(PasarelaNoConfigurada)
  })

  it('iniciarPagoEnLinea rechaza si no es la ultima expensa vigente emitida', async () => {
    await guardarCredencialesPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      accessToken: 'TEST-TOKEN-1234',
      secretoWebhook: 'WEBHOOK-SECRET-1234',
    })

    const mes1 = await emitirMes(1)
    await emitirMes(2) // Emite mes 2: mes 1 ya no es la ultima

    const detalleMes1 = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: mes1.liquidacionId, unidadId: unidadA },
    })

    await expect(
      iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
        usuarioId: inquilino,
        consorcioId,
        detalleLiquidacionId: detalleMes1.id,
        urlBaseRetorno: 'https://consorcio.app/volver',
      }),
    ).rejects.toBeInstanceOf(ExpensaNoEsUltimaVigente)
  })

  it('iniciarPagoEnLinea crea preferencia con el saldo consolidado y permite pagar', async () => {
    await guardarCredencialesPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      accessToken: 'TEST-TOKEN-1234',
      secretoWebhook: 'WEBHOOK-SECRET-1234',
    })

    // Enero: 500 para la unidad A.
    await emitirMes(1, '1000.00')
    // Febrero: arrastra 500 + interes + 500 propio = 1000 + interes.
    const mes2 = await emitirMes(2, '1000.00')

    const detalleMes2 = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: mes2.liquidacionId, unidadId: unidadA },
    })

    const inicio = await iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
      usuarioId: inquilino,
      consorcioId,
      detalleLiquidacionId: detalleMes2.id,
      urlBaseRetorno: 'https://consorcio.app/volver',
    })

    expect(inicio.intentoId).toBeTruthy()
    expect(inicio.urlPago).toContain('preference_id=pref_')

    // Confirmar pago aprobado simulado
    const confirmacion = await confirmarPagoEnLinea(procesadorDePrueba, {
      consorcioId,
      pagoExternoId: `pago_simulado_${inicio.intentoId}`,
      intentoId: inicio.intentoId,
    })

    expect(confirmacion.estado).toBe('aprobado')
    expect(confirmacion.pagoId).toBeTruthy()

    // Verificar que se haya creado el pago con medio mercado_pago
    const pagoCreado = await prismaBase.pago.findUniqueOrThrow({
      where: { id: confirmacion.pagoId! },
      include: { imputaciones: true },
    })

    expect(pagoCreado.medio).toBe('mercado_pago')
    expect(pagoCreado.referencia).toBe(`MP-pago_simulado_${inicio.intentoId}`)

    // Se imputaron las dos liquidaciones: mes 1 y mes 2
    expect(pagoCreado.imputaciones).toHaveLength(2)

    // Si se reintenta confirmar, es idempotente y no duplica
    const reintento = await confirmarPagoEnLinea(procesadorDePrueba, {
      consorcioId,
      pagoExternoId: `pago_simulado_${inicio.intentoId}`,
      intentoId: inicio.intentoId,
    })
    expect(reintento.pagoId).toBe(pagoCreado.id)

    const totalPagos = await prismaBase.pago.count({ where: { consorcioId } })
    expect(totalPagos).toBe(1)
  })

  it('iniciarPagoEnLinea rechaza si la expensa ya esta saldada', async () => {
    await guardarCredencialesPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      accessToken: 'TEST-TOKEN-1234',
      secretoWebhook: 'WEBHOOK-SECRET-1234',
    })

    const liq = await emitirMes(1, '1000.00')
    const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: liq.liquidacionId, unidadId: unidadA },
    })

    const inicio = await iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
      usuarioId: inquilino,
      consorcioId,
      detalleLiquidacionId: detalle.id,
      urlBaseRetorno: 'https://consorcio.app/volver',
    })

    // Confirmar pago
    await confirmarPagoEnLinea(procesadorDePrueba, {
      consorcioId,
      pagoExternoId: `pago_simulado_${inicio.intentoId}`,
      intentoId: inicio.intentoId,
    })

    // Intentar pagar nuevamente la misma expensa ya saldada
    await expect(
      iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
        usuarioId: inquilino,
        consorcioId,
        detalleLiquidacionId: detalle.id,
        urlBaseRetorno: 'https://consorcio.app/volver',
      }),
    ).rejects.toBeInstanceOf(ExpensaSinSaldoPendiente)
  })

  it('un pago rechazado en la pasarela actualiza el intento a rechazado y no crea Pago', async () => {
    await guardarCredencialesPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      accessToken: 'TEST-TOKEN-1234',
      secretoWebhook: 'WEBHOOK-SECRET-1234',
    })

    const liq = await emitirMes(1, '1000.00')
    const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: liq.liquidacionId, unidadId: unidadA },
    })

    const inicio = await iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
      usuarioId: inquilino,
      consorcioId,
      detalleLiquidacionId: detalle.id,
      urlBaseRetorno: 'https://consorcio.app/volver',
    })

    // Programar pago simulado como rechazado
    const pagoExternoId = `pago_rechazado_${inicio.intentoId}`
    procesadorDePrueba.programarPago(pagoExternoId, {
      estado: 'rechazado',
      importe: '500.00',
      referenciaExterna: inicio.intentoId,
      fechaAprobacion: null,
    })

    const confirmacion = await confirmarPagoEnLinea(procesadorDePrueba, {
      consorcioId,
      pagoExternoId,
      intentoId: inicio.intentoId,
    })

    expect(confirmacion.estado).toBe('rechazado')
    expect(confirmacion.pagoId).toBeUndefined()

    const intento = await prismaBase.intentoDePago.findUniqueOrThrow({
      where: { id: inicio.intentoId },
    })
    expect(intento.estado).toBe('rechazado')

    const pagos = await prismaBase.pago.findMany({ where: { consorcioId } })
    expect(pagos).toHaveLength(0)
  })

  it('un pago aprobado despues de un rechazo se imputa (no se pierde la plata)', async () => {
    await guardarCredencialesPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      accessToken: 'TEST-TOKEN-1234',
      secretoWebhook: 'WEBHOOK-SECRET-1234',
    })

    const liq = await emitirMes(1, '1000.00')
    const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: liq.liquidacionId, unidadId: unidadA },
    })
    const inicio = await iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
      usuarioId: inquilino,
      consorcioId,
      detalleLiquidacionId: detalle.id,
      urlBaseRetorno: 'https://consorcio.app/volver',
    })

    const rechazadoId = `pago_rechazado_${inicio.intentoId}`
    procesadorDePrueba.programarPago(rechazadoId, {
      estado: 'rechazado',
      importe: '1000.00',
      referenciaExterna: inicio.intentoId,
      fechaAprobacion: null,
    })
    await confirmarPagoEnLinea(procesadorDePrueba, {
      consorcioId,
      pagoExternoId: rechazadoId,
      intentoId: inicio.intentoId,
    })

    // La misma preferencia se paga despues con otro intento del comprador.
    const aprobadoId = `pago_tardio_${inicio.intentoId}`
    procesadorDePrueba.programarPago(aprobadoId, {
      estado: 'aprobado',
      importe: '1000.00',
      referenciaExterna: inicio.intentoId,
      fechaAprobacion: new Date('2026-09-15T12:00:00Z'),
    })

    const confirmacion = await confirmarPagoEnLinea(procesadorDePrueba, {
      consorcioId,
      pagoExternoId: aprobadoId,
      intentoId: inicio.intentoId,
    })

    expect(confirmacion.estado).toBe('aprobado')
    expect(confirmacion.pagoId).toBeTruthy()

    const intento = await prismaBase.intentoDePago.findUniqueOrThrow({
      where: { id: inicio.intentoId },
    })
    expect(intento.estado).toBe('aprobado')
    expect(intento.pagoExternoId).toBe(aprobadoId)
    expect(await prismaBase.pago.count({ where: { consorcioId } })).toBe(1)
  })

  it('un segundo pago aprobado del mismo intento queda como saldo a favor', async () => {
    await guardarCredencialesPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      accessToken: 'TEST-TOKEN-1234',
      secretoWebhook: 'WEBHOOK-SECRET-1234',
    })

    const liq = await emitirMes(1, '1000.00')
    const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: liq.liquidacionId, unidadId: unidadA },
    })
    const inicio = await iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
      usuarioId: inquilino,
      consorcioId,
      detalleLiquidacionId: detalle.id,
      urlBaseRetorno: 'https://consorcio.app/volver',
    })

    const primero = await confirmarPagoEnLinea(procesadorDePrueba, {
      consorcioId,
      pagoExternoId: `pago_simulado_${inicio.intentoId}`,
      intentoId: inicio.intentoId,
    })
    expect(primero.estado).toBe('aprobado')

    // Dos pestañas pagaron la misma preferencia: el segundo cobro no se descarta.
    const extraId = `pago_extra_${inicio.intentoId}`
    procesadorDePrueba.programarPago(extraId, {
      estado: 'aprobado',
      importe: '250.00',
      referenciaExterna: inicio.intentoId,
      fechaAprobacion: new Date('2026-09-15T12:00:00Z'),
    })
    const segundo = await confirmarPagoEnLinea(procesadorDePrueba, {
      consorcioId,
      pagoExternoId: extraId,
      intentoId: inicio.intentoId,
    })
    expect(segundo.estado).toBe('aprobado')
    expect(segundo.pagoId).not.toBe(primero.pagoId)

    const pagos = await prismaBase.pago.findMany({
      where: { consorcioId },
      orderBy: { creadoEn: 'asc' },
    })
    expect(pagos).toHaveLength(2)
    expect(pagos[1]!.saldoAFavor.toFixed(2)).toBe('250.00')

    const intento = await prismaBase.intentoDePago.findUniqueOrThrow({
      where: { id: inicio.intentoId },
    })
    expect(intento.pagoId).toBe(primero.pagoId)

    // El reintento del webhook del segundo pago no lo duplica.
    await confirmarPagoEnLinea(procesadorDePrueba, {
      consorcioId,
      pagoExternoId: extraId,
      intentoId: inicio.intentoId,
    })
    expect(await prismaBase.pago.count({ where: { consorcioId } })).toBe(2)
  })

  it('un rechazo tardio no pisa un intento ya aprobado', async () => {
    await guardarCredencialesPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      accessToken: 'TEST-TOKEN-1234',
      secretoWebhook: 'WEBHOOK-SECRET-1234',
    })

    const liq = await emitirMes(1, '1000.00')
    const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: liq.liquidacionId, unidadId: unidadA },
    })
    const inicio = await iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
      usuarioId: inquilino,
      consorcioId,
      detalleLiquidacionId: detalle.id,
      urlBaseRetorno: 'https://consorcio.app/volver',
    })

    const aprobadoId = `pago_simulado_${inicio.intentoId}`
    const primero = await confirmarPagoEnLinea(procesadorDePrueba, {
      consorcioId,
      pagoExternoId: aprobadoId,
      intentoId: inicio.intentoId,
    })

    const rechazadoId = `pago_rechazado_${inicio.intentoId}`
    procesadorDePrueba.programarPago(rechazadoId, {
      estado: 'rechazado',
      importe: '10.00',
      referenciaExterna: inicio.intentoId,
      fechaAprobacion: null,
    })
    const confirmacion = await confirmarPagoEnLinea(procesadorDePrueba, {
      consorcioId,
      pagoExternoId: rechazadoId,
      intentoId: inicio.intentoId,
    })

    // El intento ya tenia un pago aprobado: el rechazo de otro intento no lo pisa.
    expect(confirmacion.estado).toBe('aprobado')

    const intento = await prismaBase.intentoDePago.findUniqueOrThrow({
      where: { id: inicio.intentoId },
    })
    expect(intento.estado).toBe('aprobado')
    expect(intento.pagoExternoId).toBe(aprobadoId)
    expect(intento.pagoId).toBe(primero.pagoId)
  })

  it('aislamiento (RT-04): confirmar con un consorcio ajeno es rechazado', async () => {
    await guardarCredencialesPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      accessToken: 'TEST-TOKEN-1234',
      secretoWebhook: 'WEBHOOK-SECRET-1234',
    })

    const liq = await emitirMes(1, '1000.00')
    const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: liq.liquidacionId, unidadId: unidadA },
    })

    const inicio = await iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
      usuarioId: inquilino,
      consorcioId,
      detalleLiquidacionId: detalle.id,
      urlBaseRetorno: 'https://consorcio.app/volver',
    })

    // Crear un consorcio B ajeno
    const adminB = await crearAdministradora()
    const consorcioB = await crearConsorcio(adminB.id, 'Ajeno 999')

    await expect(
      confirmarPagoEnLinea(procesadorDePrueba, {
        consorcioId: consorcioB.id,
        pagoExternoId: `pago_simulado_${inicio.intentoId}`,
        intentoId: inicio.intentoId,
      }),
    ).rejects.toThrow()
  })

  it('auditoria (RN-15): CredencialPagoAdministradora e IntentoDePago quedan en BitacoraAuditoria', async () => {
    await guardarCredencialesPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      accessToken: 'TEST-TOKEN-1234',
      secretoWebhook: 'WEBHOOK-SECRET-1234',
    })

    const liq = await emitirMes(1, '1000.00')
    const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: liq.liquidacionId, unidadId: unidadA },
    })

    const inicio = await iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
      usuarioId: inquilino,
      consorcioId,
      detalleLiquidacionId: detalle.id,
      urlBaseRetorno: 'https://consorcio.app/volver',
    })

    // Verificar disparador de auditoria en CredencialPagoAdministradora
    const logsCredencial = await prismaBase.$queryRaw<unknown[]>`
      SELECT * FROM "BitacoraAuditoria"
      WHERE tabla = 'CredencialPagoAdministradora'
    `
    expect(logsCredencial.length).toBeGreaterThanOrEqual(1)

    // Verificar disparador de auditoria en IntentoDePago
    const logsIntento = await prismaBase.$queryRaw<unknown[]>`
      SELECT * FROM "BitacoraAuditoria"
      WHERE tabla = 'IntentoDePago' AND clave = ${inicio.intentoId}
    `
    expect(logsIntento.length).toBeGreaterThanOrEqual(1)
  })

  describe('Webhook de Mercado Pago (POST /api/pagos/webhook)', () => {
    it('rechaza con 400 si falta el parametro consorcio', async () => {
      const req = new Request('http://localhost/api/pagos/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })

      const res = await webhookRoute(req)
      expect(res.status).toBe(400)
    })

    it('rechaza con 404 si el consorcio no existe', async () => {
      const req = new Request(
        'http://localhost/api/pagos/webhook?consorcio=00000000-0000-0000-0000-000000000000',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        },
      )

      const res = await webhookRoute(req)
      expect(res.status).toBe(404)
    })

    it('rechaza con 401 si la firma x-signature no es valida', async () => {
      await guardarCredencialesPago(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        accessToken: 'TEST-TOKEN-1234',
        secretoWebhook: 'WEBHOOK-SECRET-1234',
      })

      const req = new Request(`http://localhost/api/pagos/webhook?consorcio=${consorcioId}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-signature': 'ts=1700000000,v1=invalido',
          'x-request-id': 'req-123',
        },
        body: JSON.stringify({
          action: 'payment.created',
          type: 'payment',
          data: { id: '999999' },
        }),
      })

      const res = await webhookRoute(req)
      expect(res.status).toBe(401)
    })

    it('procesa el pago correctamente cuando la firma es valida', async () => {
      const secretoWebhook = 'MI-SECRETO-WEBHOOK-SEGURO'
      await guardarCredencialesPago(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        accessToken: 'TEST-TOKEN-1234',
        secretoWebhook,
      })

      const liq = await emitirMes(1, '1000.00')
      const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
        where: { liquidacionId: liq.liquidacionId, unidadId: unidadA },
      })

      const inicio = await iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
        usuarioId: inquilino,
        consorcioId,
        detalleLiquidacionId: detalle.id,
        urlBaseRetorno: 'https://consorcio.app/volver',
      })

      const pagoExternoId = `pago_simulado_${inicio.intentoId}`
      const requestId = 'req-abc-123'
      const ts = Math.floor(Date.now() / 1000).toString()
      const manifest = `id:${pagoExternoId};request-id:${requestId};ts:${ts};`
      const hash = createHmac('sha256', secretoWebhook).update(manifest).digest('hex')
      const xSignature = `ts=${ts},v1=${hash}`

      const req = new Request(`http://localhost/api/pagos/webhook?consorcio=${consorcioId}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-signature': xSignature,
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          action: 'payment.created',
          type: 'payment',
          data: { id: pagoExternoId },
        }),
      })

      const res = await webhookRoute(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.recibido).toBe(true)
      expect(data.estado).toBe('aprobado')
      expect(data.pagoId).toBeTruthy()

      // Verificar que el intento paso a aprobado
      const intentoDb = await prismaBase.intentoDePago.findUniqueOrThrow({
        where: { id: inicio.intentoId },
      })
      expect(intentoDb.estado).toBe('aprobado')
      expect(intentoDb.pagoId).toBe(data.pagoId)
    })

    it('toma data.id y type del query string, que es lo que firma Mercado Pago', async () => {
      const secretoWebhook = 'SECRETO-QUERY-1234'
      await guardarCredencialesPago(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        accessToken: 'TEST-TOKEN-1234',
        secretoWebhook,
      })

      const liq = await emitirMes(1, '1000.00')
      const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
        where: { liquidacionId: liq.liquidacionId, unidadId: unidadA },
      })
      const inicio = await iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
        usuarioId: inquilino,
        consorcioId,
        detalleLiquidacionId: detalle.id,
        urlBaseRetorno: 'https://consorcio.app/volver',
      })

      const pagoExternoId = `pago_simulado_${inicio.intentoId}`
      const requestId = 'req-query-1'
      const ts = Math.floor(Date.now() / 1000).toString()
      const manifest = `id:${pagoExternoId};request-id:${requestId};ts:${ts};`
      const hash = createHmac('sha256', secretoWebhook).update(manifest).digest('hex')

      const req = new Request(
        `http://localhost/api/pagos/webhook?consorcio=${consorcioId}&data.id=${pagoExternoId}&type=payment`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-signature': `ts=${ts},v1=${hash}`,
            'x-request-id': requestId,
          },
          // El body trae otro id y otro tipo: debe ganar el query.
          body: JSON.stringify({ data: { id: 'id-que-no-firma' }, type: 'merchant_order' }),
        },
      )

      const res = await webhookRoute(req)
      expect(res.status).toBe(200)
      expect((await res.json()).estado).toBe('aprobado')

      const intentoDb = await prismaBase.intentoDePago.findUniqueOrThrow({
        where: { id: inicio.intentoId },
      })
      expect(intentoDb.estado).toBe('aprobado')
    })

    it('procesa una notificacion sin body cuando data.id viene en el query', async () => {
      const secretoWebhook = 'SECRETO-SIN-BODY-1234'
      await guardarCredencialesPago(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        accessToken: 'TEST-TOKEN-1234',
        secretoWebhook,
      })

      const liq = await emitirMes(1, '1000.00')
      const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
        where: { liquidacionId: liq.liquidacionId, unidadId: unidadA },
      })
      const inicio = await iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
        usuarioId: inquilino,
        consorcioId,
        detalleLiquidacionId: detalle.id,
        urlBaseRetorno: 'https://consorcio.app/volver',
      })

      const pagoExternoId = `pago_simulado_${inicio.intentoId}`
      const requestId = 'req-sin-body'
      const ts = Math.floor(Date.now() / 1000).toString()
      const manifest = `id:${pagoExternoId};request-id:${requestId};ts:${ts};`
      const hash = createHmac('sha256', secretoWebhook).update(manifest).digest('hex')

      const req = new Request(
        `http://localhost/api/pagos/webhook?consorcio=${consorcioId}&data.id=${pagoExternoId}&type=payment`,
        {
          method: 'POST',
          headers: {
            'x-signature': `ts=${ts},v1=${hash}`,
            'x-request-id': requestId,
          },
        },
      )

      const res = await webhookRoute(req)
      expect(res.status).toBe(200)
      expect((await res.json()).estado).toBe('aprobado')
    })
  })
})

describe('vencimiento del intento de pago (RF-28)', () => {
  async function iniciarA(instante: string) {
    const liq = await prismaBase.liquidacion.findFirstOrThrow({ where: { consorcioId } })
    const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: liq.id, unidadId: unidadA },
    })
    return iniciarPagoEnLinea(repo, relojFijo(instante), procesadorDePrueba, {
      usuarioId: inquilino,
      consorcioId,
      detalleLiquidacionId: detalle.id,
      urlBaseRetorno: 'https://consorcio.app/volver',
    })
  }

  beforeEach(async () => {
    await guardarCredencialesPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      accessToken: 'TEST-TOKEN-1234',
      secretoWebhook: 'WEBHOOK-SECRET-1234',
    })
    await emitirMes(1, '1000.00')
  })

  it('vence 24 h despues del instante en que se inicia, no de la medianoche', async () => {
    // 23:50 UTC: contado desde la medianoche venceria en 10 minutos.
    const inicio = await iniciarA('2026-02-05T23:50:00Z')

    const intento = await prismaBase.intentoDePago.findUniqueOrThrow({
      where: { id: inicio.intentoId },
    })
    expect(intento.venceEn.toISOString()).toBe('2026-02-06T23:50:00.000Z')
  })

  it('se reutiliza mientras no pasaron 24 h, aunque haya cambiado el dia', async () => {
    const primero = await iniciarA('2026-02-05T23:00:00Z')
    const segundo = await iniciarA('2026-02-06T10:00:00Z')

    expect(segundo.intentoId).toBe(primero.intentoId)
  })

  it('pasadas las 24 h se marca vencido y se crea otro', async () => {
    const primero = await iniciarA('2026-02-05T23:00:00Z')
    const segundo = await iniciarA('2026-02-06T23:30:00Z')

    expect(segundo.intentoId).not.toBe(primero.intentoId)
    const viejo = await prismaBase.intentoDePago.findUniqueOrThrow({
      where: { id: primero.intentoId },
    })
    expect(viejo.estado).toBe('vencido')
  })

  it('no pasa del fin del dia del vencimiento: despues el monto es otro', async () => {
    // Enero vence en firme el 10/02; las 24 h llegarian al 11/02 a mediodia.
    const inicio = await iniciarA('2026-02-10T12:00:00Z')

    const intento = await prismaBase.intentoDePago.findUniqueOrThrow({
      where: { id: inicio.intentoId },
    })
    // Fin del 10/02 en Argentina (UTC-3).
    expect(intento.venceEn.toISOString()).toBe('2026-02-11T03:00:00.000Z')
  })

  it('si el monto cambio (un pago manual en el medio) no reutiliza el intento viejo', async () => {
    const primero = await iniciarA('2026-02-05T12:00:00Z')
    await registrarPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: unidadA,
      importe: '100.00',
      fechaPago: new Date('2026-02-05'),
      medio: 'efectivo',
    })
    const segundo = await iniciarA('2026-02-05T13:00:00Z')

    expect(segundo.intentoId).not.toBe(primero.intentoId)
    const nuevo = await prismaBase.intentoDePago.findUniqueOrThrow({
      where: { id: segundo.intentoId },
    })
    expect(nuevo.importe.toFixed(2)).toBe('400.00')
    const viejo = await prismaBase.intentoDePago.findUniqueOrThrow({
      where: { id: primero.intentoId },
    })
    expect(viejo.estado).toBe('vencido')
  })

  it('pasado el vencimiento en firme no se puede pagar hasta la liquidacion siguiente', async () => {
    await expect(iniciarA('2026-02-11T12:00:00Z')).rejects.toBeInstanceOf(
      PagoBloqueadoHastaLiquidar,
    )

    const liq = await prismaBase.liquidacion.findFirstOrThrow({ where: { consorcioId } })
    const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: liq.id, unidadId: unidadA },
    })
    const disponibilidad = await consultarDisponibilidadPagoEnLinea(
      repo,
      relojFijo('2026-02-11T12:00:00Z'),
      { usuarioId: inquilino, consorcioId, detalleLiquidacionId: detalle.id },
    )
    expect(disponibilidad).toEqual({ pagable: false, motivo: 'vencida-en-firme' })

    // Tampoco a mano (decision 2026-11-10).
    await expect(
      registrarPago(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        unidadId: unidadA,
        importe: '500.00',
        fechaPago: new Date('2026-02-11'),
        medio: 'efectivo',
      }),
    ).rejects.toBeInstanceOf(PagoBloqueadoHastaLiquidar)
  })
})

describe('monto del pago en linea con vencimientos escalonados (RF-08)', () => {
  beforeEach(async () => {
    await guardarCredencialesPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      accessToken: 'TEST-TOKEN-1234',
      secretoWebhook: 'WEBHOOK-SECRET-1234',
    })
    // Enero vence 05/02 (base), 08/02 (+5 %) y 10/02 (+10 %, firme).
    await prismaBase.tramoVencimiento.createMany({
      data: [
        { consorcioId, orden: 1, diaDelMes: 5, recargoPorcentaje: '0' },
        { consorcioId, orden: 2, diaDelMes: 8, recargoPorcentaje: '5' },
        { consorcioId, orden: 3, diaDelMes: 10, recargoPorcentaje: '10' },
      ],
    })
  })

  it('la pantalla y la preferencia piden lo mismo, con el recargo del tramo', async () => {
    const liq = await emitirMes(1, '1000.00')
    const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: liq.liquidacionId, unidadId: unidadA },
    })
    const reloj = relojFijo('2026-02-07T12:00:00Z')
    const datos = { usuarioId: inquilino, consorcioId, detalleLiquidacionId: detalle.id }

    const disponibilidad = await consultarDisponibilidadPagoEnLinea(repo, reloj, datos)
    expect(disponibilidad.saldoExigible).toBe('525.00')

    const inicio = await iniciarPagoEnLinea(repo, reloj, procesadorDePrueba, {
      ...datos,
      urlBaseRetorno: 'https://consorcio.app/volver',
    })
    const intento = await prismaBase.intentoDePago.findUniqueOrThrow({
      where: { id: inicio.intentoId },
    })
    expect(intento.importe.toFixed(2)).toBe('525.00')
  })

  it('la liquidacion siguiente le suma a lo impago el recargo mas alto y la mora', async () => {
    await emitirMes(1, '1000.00')
    // Febrero se emite el 01/03, con enero vencido en firme el 10/02.
    const { periodoId } = await periodoPara(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      anio: 2026,
      mes: 2,
    })
    await registrarGasto(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId,
      rubroId,
      importe: '1000.00',
      fecha: new Date('2026-02-05'),
      descripcion: 'Gasto 2',
    })
    const emision = relojFijo('2026-03-01T12:00:00Z')
    const febrero = await liquidarPeriodo(repo, emision, {
      usuarioId: administrador,
      consorcioId,
      periodoId,
    })
    const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: febrero.liquidacionId, unidadId: unidadA },
    })
    // 500 propio + 500 arrastrado + 50 (10 %) + 10 (2 % de mora).
    expect(detalle.totalUnidad.toFixed(2)).toBe('1060.00')

    // Y se paga entero, sin recargo, antes del primer vencimiento de febrero.
    const disponibilidad = await consultarDisponibilidadPagoEnLinea(repo, emision, {
      usuarioId: inquilino,
      consorcioId,
      detalleLiquidacionId: detalle.id,
    })
    expect(disponibilidad.saldoExigible).toBe('1060.00')
  })
})
