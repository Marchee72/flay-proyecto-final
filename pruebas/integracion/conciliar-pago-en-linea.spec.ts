import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { guardarCredencialesPago } from '@/aplicacion/administradoras/credenciales-pago'
import {
  conciliarIntento,
  conciliarPagosDelDetalle,
  manejadorConciliacion,
  PagoTodaviaSinConfirmar,
} from '@/aplicacion/pagos/conciliar-pago-en-linea'
import { confirmarPagoEnLinea } from '@/aplicacion/pagos/confirmar-pago-en-linea'
import { iniciarPagoEnLinea } from '@/aplicacion/pagos/iniciar-pago-en-linea'
import { NoEncontrado } from '@/compartido/errores'
import { procesadorDePrueba } from '@/infraestructura/pagos/procesador-de-prueba'
import {
  ProcesadorDePagosDeshabilitado,
  ProcesadorNulo,
} from '@/infraestructura/pagos/procesador-nulo'
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
  unidadA,
  unidadB,
} from './ayudas-pago-en-linea'

/**
 * Conciliacion *pull* de pagos en linea (`RF-28`): sin webhook ni retorno, el
 * intento se confirma preguntando a la pasarela por su referencia externa.
 */

let detalleId: string
let detalleBId: string
let intentoId: string

beforeEach(async () => {
  await prepararEscenario()
  await guardarCredencialesPago(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    accessToken: 'TEST-TOKEN-1234',
    secretoWebhook: 'WEBHOOK-SECRET-1234',
  })
  const liq = await emitirMes(1)
  const detalles = await prismaBase.detalleLiquidacion.findMany({
    where: { liquidacionId: liq.liquidacionId },
  })
  detalleId = detalles.find((d) => d.unidadId === unidadA)!.id
  detalleBId = detalles.find((d) => d.unidadId === unidadB)!.id

  intentoId = (
    await iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
      usuarioId: inquilino,
      consorcioId,
      detalleLiquidacionId: detalleId,
      urlBaseRetorno: 'https://consorcio.app/volver',
    })
  ).intentoId
})

afterEach(async () => {
  vi.restoreAllMocks()
  await limpiarEscenario()
})

const conciliar = (reloj = RELOJ) =>
  conciliarIntento(procesadorDePrueba, reloj, {
    consorcioId,
    detalleLiquidacionId: detalleId,
    intentoId,
  })

const intento = () => prismaBase.intentoDePago.findUniqueOrThrow({ where: { id: intentoId } })
const pagos = () => prismaBase.pago.findMany({ where: { consorcioId } })
const avisos = () =>
  prismaBase.notificacion.count({ where: { usuarioId: inquilino, tipo: 'pago_acreditado' } })

function programar(pagoExternoId: string, estado: 'aprobado' | 'rechazado' | 'pendiente') {
  procesadorDePrueba.programarPago(pagoExternoId, {
    estado,
    importe: '500.00',
    referenciaExterna: intentoId,
    fechaAprobacion: estado === 'aprobado' ? new Date('2026-09-15T13:00:00Z') : null,
  })
}

describe('conciliacion de pagos en linea (RF-28)', () => {
  it('concilia un intento aprobado sin webhook ni retorno: crea el Pago, lo imputa y notifica', async () => {
    expect(await conciliar()).toEqual({ intentoId, estado: 'aprobado' })

    const registrados = await pagos()
    expect(registrados).toHaveLength(1)
    expect(registrados[0].referencia).toBe(`MP-pago_simulado_${intentoId}`)
    expect(registrados[0].medio).toBe('mercado_pago')

    const actual = await intento()
    expect(actual.estado).toBe('aprobado')
    expect(actual.pagoId).toBe(registrados[0].id)
    expect(await avisos()).toBe(1)
  })

  it('conciliar dos veces no duplica el Pago', async () => {
    await conciliar()
    expect((await conciliar()).estado).toBe('aprobado')
    expect(await pagos()).toHaveLength(1)
  })

  it('sin pago en la pasarela queda esperando y no toca el intento', async () => {
    procesadorDePrueba.limpiar()

    expect((await conciliar()).estado).toBe('esperando')
    expect((await intento()).estado).toBe('iniciado')
    expect(await pagos()).toHaveLength(0)
  })

  it('un pago pendiente queda esperando', async () => {
    procesadorDePrueba.limpiar()
    programar('mp-pend', 'pendiente')

    expect((await conciliar()).estado).toBe('esperando')
  })

  it('el ultimo pago rechazado marca el intento rechazado', async () => {
    procesadorDePrueba.limpiar()
    programar('mp-rech', 'rechazado')

    expect((await conciliar()).estado).toBe('rechazado')
    expect((await intento()).estado).toBe('rechazado')
  })

  it('un aprobado despues de un rechazo se concilia', async () => {
    procesadorDePrueba.limpiar()
    programar('mp-rech', 'rechazado')
    programar('mp-ok', 'aprobado')

    expect((await conciliar()).estado).toBe('aprobado')
    const registrados = await pagos()
    expect(registrados).toHaveLength(1)
    expect(registrados[0].referencia).toBe('MP-mp-ok')
  })

  it('concurrente con el webhook no duplica', async () => {
    await Promise.all([
      conciliar(),
      confirmarPagoEnLinea(procesadorDePrueba, {
        consorcioId,
        pagoExternoId: `pago_simulado_${intentoId}`,
        intentoId,
      }),
    ])

    expect(await pagos()).toHaveLength(1)
    expect(await avisos()).toBe(1)
  })

  it('vencido hace mas de 72 h no consulta la pasarela', async () => {
    const espia = vi.spyOn(procesadorDePrueba, 'buscarPagosPorReferencia')

    expect((await conciliar(relojFijo('2026-09-20T12:00:00Z'))).estado).toBe('vencido')
    expect(espia).toHaveBeenCalledTimes(0)
  })

  it('propaga el error de la pasarela sin tocar el intento', async () => {
    await expect(
      conciliarIntento(new ProcesadorNulo(), RELOJ, {
        consorcioId,
        detalleLiquidacionId: detalleId,
        intentoId,
      }),
    ).rejects.toBeInstanceOf(ProcesadorDePagosDeshabilitado)
    expect((await intento()).estado).toBe('iniciado')
  })

  it('un intento de otro detalle o de otro consorcio es NoEncontrado', async () => {
    await expect(
      conciliarIntento(procesadorDePrueba, RELOJ, {
        consorcioId,
        detalleLiquidacionId: detalleBId,
        intentoId,
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)

    const otro = await crearConsorcio((await crearAdministradora()).id, 'Ajeno 999')
    await expect(
      conciliarIntento(procesadorDePrueba, RELOJ, {
        consorcioId: otro.id,
        detalleLiquidacionId: detalleId,
        intentoId,
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)
  })

  it('conciliarPagosDelDetalle ignora intentos sin preferencia', async () => {
    const actual = await intento()
    await prismaBase.intentoDePago.create({
      data: {
        consorcioId,
        unidadId: unidadA,
        detalleLiquidacionId: detalleId,
        importe: actual.importe,
        estado: 'rechazado',
        iniciadoPor: inquilino,
        venceEn: actual.venceEn,
      },
    })

    expect(
      await conciliarPagosDelDetalle(procesadorDePrueba, RELOJ, {
        consorcioId,
        detalleLiquidacionId: detalleId,
      }),
    ).toEqual([{ intentoId, estado: 'aprobado' }])
  })

  it('iniciarPagoEnLinea encola un trabajo conciliar_pago', async () => {
    const trabajos = await prismaBase.trabajoPendiente.findMany({
      where: { tipo: 'conciliar_pago' },
    })
    expect(trabajos).toHaveLength(1)
    expect((trabajos[0].carga as { intentoId: string }).intentoId).toBe(intentoId)
  })

  it('el manejador lanza mientras no hay pago y concilia cuando aparece', async () => {
    procesadorDePrueba.limpiar()
    const manejar = manejadorConciliacion(procesadorDePrueba, RELOJ)
    const carga = { consorcioId, detalleLiquidacionId: detalleId, intentoId }

    await expect(manejar(carga)).rejects.toBeInstanceOf(PagoTodaviaSinConfirmar)

    procesadorDePrueba.programarPago('mp-ok', {
      estado: 'aprobado',
      importe: '500.00',
      referenciaExterna: intentoId,
      fechaAprobacion: new Date(),
    })
    await expect(manejar(carga)).resolves.toBeUndefined()
    expect(await pagos()).toHaveLength(1)
  })

  it('el manejador termina sin error con un intento inexistente', async () => {
    await expect(
      manejadorConciliacion(
        procesadorDePrueba,
        RELOJ,
      )({
        consorcioId,
        detalleLiquidacionId: detalleId,
        intentoId: randomUUID(),
      }),
    ).resolves.toBeUndefined()
  })
})
