import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { POST as webhookRoute } from '@/app/api/pagos/webhook/route'
import {
  guardarCredencialesPago,
  verEstadoCredencialPago,
} from '@/aplicacion/administradoras/credenciales-pago'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'
import { confirmarPagoEnLinea } from '@/aplicacion/pagos/confirmar-pago-en-linea'
import {
  ExpensaNoEsUltimaVigente,
  ExpensaSinSaldoPendiente,
  iniciarPagoEnLinea,
  PasarelaNoConfigurada,
} from '@/aplicacion/pagos/iniciar-pago-en-linea'
import { periodoPara } from '@/aplicacion/periodos/periodos'
import { procesadorDePrueba } from '@/infraestructura/pagos/procesador-de-prueba'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../dominio/reloj-fijo'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnConsorcio,
  limpiar,
} from './ayudas'

/**
 * Pruebas de integracion del flujo completo de pago en linea con Mercado Pago (`RF-28`).
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let administrador: string
let inquilino: string
let unidadA: string
let rubroId: string

beforeEach(async () => {
  process.env.MP_CLAVE_CIFRADO = Buffer.alloc(32, 9).toString('base64')
  procesadorDePrueba.limpiar()

  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  administrador = (await crearUsuario('Admin')).id
  inquilino = (await crearUsuario('Inquilino')).id

  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(inquilino, consorcioId, 'consorcista')

  rubroId = (
    await prismaBase.rubroGasto.upsert({
      where: { nombre: 'Rubro de prueba' },
      update: {},
      create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
    })
  ).id

  await cargarPadron(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidades: [
      { designacion: '1A', tipo: 'departamento', coeficiente: '50.00000000' },
      { designacion: '1B', tipo: 'departamento', coeficiente: '50.00000000' },
    ],
  })

  const unidades = await prismaBase.unidad.findMany({
    where: { consorcioId },
    orderBy: { designacion: 'asc' },
  })
  unidadA = unidades[0].id

  const inquilinoUsuario = await prismaBase.usuario.findUniqueOrThrow({ where: { id: inquilino } })
  await registrarOcupacion(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidadId: unidadA,
    personaId: inquilinoUsuario.personaId,
    tipo: 'inquilino',
    desde: new Date('2026-01-01'),
  })
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "IntentoDePago"`
  await prismaBase.$executeRaw`DELETE FROM "CredencialPagoAdministradora"`
  await prismaBase.$executeRaw`DELETE FROM "Reserva"`
  await prismaBase.$executeRaw`DELETE FROM "PagoImputacion"`
  await prismaBase.$executeRaw`DELETE FROM "Pago"`
  await prismaBase.$executeRaw`DELETE FROM "InteresLiquidado"`
  await prismaBase.$executeRaw`DELETE FROM "DetalleLiquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "VencimientoLiquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "Liquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "Gasto"`
  await prismaBase.$executeRaw`DELETE FROM "Periodo"`
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await prismaBase.$executeRaw`DELETE FROM "Ocupacion"`
  await prismaBase.$executeRaw`DELETE FROM "Unidad"`
  await limpiar()
})

async function emitirMes(mes: number, gastoMonto = '1000.00') {
  const { periodoId } = await periodoPara(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    anio: 2026,
    mes,
  })
  await registrarGasto(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    periodoId,
    rubroId,
    importe: gastoMonto,
    fecha: new Date(`2026-${String(mes).padStart(2, '0')}-05`),
    descripcion: `Gasto ${mes}`,
  })
  await cerrarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
  return liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
}

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
  })
})
