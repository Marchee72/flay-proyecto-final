import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Decimal, importe } from '@/compartido/dinero'
import { anularLiquidacion } from '@/aplicacion/liquidacion/anular'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'
import { verEstadoDeCuenta, verMorosidad } from '@/aplicacion/pagos/estado-de-cuenta'
import { registrarPago } from '@/aplicacion/pagos/registrar'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { abrirPeriodo } from '@/aplicacion/periodos/periodos'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
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
 * Pagos, imputacion y morosidad contra la base (`RF-09`, `CU-04`, SC-009,
 * SC-014c, SC-015). El reparto lo prueba el dominio; aca se prueba que se
 * escribe entero, que la anulacion lo revierte marcando, que el saldo a favor
 * llega a la emision siguiente, y quien ve la nomina.
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let administrador: string
let unidadA: string
let rubroId: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')

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
      { designacion: '1A', coeficiente: '50.00000000' },
      { designacion: '1B', coeficiente: '50.00000000' },
    ],
  })
  unidadA = (await prismaBase.unidad.findFirstOrThrow({ where: { designacion: '1A' } })).id
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Notificacion"`
  await prismaBase.trabajoPendiente.deleteMany({})
  await prismaBase.$executeRaw`DELETE FROM "Ocupacion"`
  await prismaBase.$executeRaw`DELETE FROM "PagoImputacion"`
  await prismaBase.$executeRaw`DELETE FROM "Pago"`
  await prismaBase.$executeRaw`DELETE FROM "InteresLiquidado"`
  await prismaBase.$executeRaw`DELETE FROM "DetalleLiquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "Liquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await prismaBase.$executeRaw`DELETE FROM "Unidad"`
  await limpiar()
})

/** Un mes con 1000 de gasto, emitido: cada unidad debe 500. */
async function emitirMes(mes: number) {
  const { periodoId } = await abrirPeriodo(repo, RELOJ, {
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
    importe: '1000.00',
    fecha: new Date(`2026-${String(mes).padStart(2, '0')}-05`),
    descripcion: `Gasto ${mes}`,
  })
  await cerrarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
  return liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
}

const pagar = (importePagado: string) =>
  registrarPago(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidadId: unidadA,
    importe: importePagado,
    fechaPago: new Date('2026-09-15'),
    medio: 'transferencia',
  })

describe('imputacion por antiguedad (SC-009)', () => {
  it('un pago de una liquidacion y media va a la mas antigua primero', async () => {
    const enero = await emitirMes(1)
    await emitirMes(2)

    const pago = await pagar('750.00')

    const [primera, segunda] = pago.imputaciones
    expect(primera.importeImputado).toBe('500.00')
    expect(segunda.importeImputado).toBe('250.00')
    expect(pago.saldoAFavor).toBe('0.00')

    const detalleEnero = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: enero.liquidacionId, unidadId: unidadA },
    })
    expect(primera.detalleId).toBe(detalleEnero.id)

    // La suma de imputaciones escritas iguala el pago con tolerancia cero.
    const escritas = await prismaBase.pagoImputacion.findMany({ where: { pagoId: pago.pagoId } })
    const suma = escritas.reduce(
      (total, i) => total.plus(importe(i.importeImputado.toFixed(2))),
      new Decimal(0),
    )
    expect(suma.toFixed(2)).toBe('750.00')
  })

  it('el excedente queda a favor y se descuenta solo en la emision siguiente (FR-026b)', async () => {
    await emitirMes(1)

    const pago = await pagar('800.00')
    expect(pago.saldoAFavor).toBe('300.00')

    const marzo = await emitirMes(3)
    const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: marzo.liquidacionId, unidadId: unidadA },
    })

    // Debia 500 del mes, sin deuda anterior (enero quedo pagado); el saldo a
    // favor de 300 se aplica y quedan 200.
    expect(detalle.saldoAFavorAplicado.toFixed(2)).toBe('300.00')
    expect(detalle.totalUnidad.toFixed(2)).toBe('200.00')
  })

  it('un importe invalido se rechaza con un mensaje legible', async () => {
    await expect(pagar('0.00')).rejects.toThrow(/mayor que cero/)
    await expect(pagar('12.345')).rejects.toThrow(/mayor que cero/)
  })
})

describe('anulacion y reversion (FR-027)', () => {
  it('las imputaciones quedan marcadas, no borradas, y el pago vuelve a estar disponible', async () => {
    const enero = await emitirMes(1)
    const pago = await pagar('500.00')

    await anularLiquidacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      liquidacionId: enero.liquidacionId,
    })

    const imputaciones = await prismaBase.pagoImputacion.findMany({
      where: { pagoId: pago.pagoId },
    })
    expect(imputaciones).toHaveLength(1)
    expect(imputaciones[0].revertidaEn).not.toBeNull()

    const registrado = await prismaBase.pago.findUniqueOrThrow({ where: { id: pago.pagoId } })
    expect(registrado.saldoAFavor.toFixed(2)).toBe('500.00')
  })
})

describe('morosidad por rol (FR-029, SC-015)', () => {
  it('el administrador ve la nomina; el consorcista, solo el agregado', async () => {
    // Vencio el 10/02 y hoy es 15/09: 1A y 1B deben 500 cada una.
    await emitirMes(1)

    const nominada = await verMorosidad(repo, RELOJ, { usuarioId: administrador, consorcioId })
    expect(nominada.nominada).toBe(true)
    if (nominada.nominada) {
      expect(nominada.deudores.map((d) => d.designacion)).toEqual(['1A', '1B'])
      expect(nominada.agregado).toEqual({
        unidadesEnMora: 2,
        unidadesTotales: 2,
        deudaTotal: '1000.00',
      })
    }

    const vecino = await crearUsuario('Beto')
    await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: unidadA,
      personaId: vecino.personaId,
      tipo: 'propietario',
      desde: new Date('2026-01-01'),
    })

    const agregada = await verMorosidad(repo, RELOJ, { usuarioId: vecino.id, consorcioId })
    expect(agregada.nominada).toBe(false)
    expect(agregada.agregado.unidadesEnMora).toBe(2)
    expect(JSON.stringify(agregada)).not.toContain('1B')
  })

  /**
   * La fuga que encontro una prueba de extremo a extremo por casualidad:
   * `DetalleLiquidacion` no lleva `consorcio_id`, y consultarla directo suma
   * la mora de todos los consorcios. Aca queda fijado (Principio I, RT-04).
   */
  it('la morosidad de un consorcio no cuenta la deuda de otro', async () => {
    await emitirMes(1)

    // Otro consorcio con su propia deuda vencida, de la misma administradora.
    const administradora = await prismaBase.consorcio
      .findUniqueOrThrow({ where: { id: consorcioId } })
      .then((c) => c.administradoraId)
    const otro = await crearConsorcio(administradora, 'San Martin 7890')
    await habilitarEnConsorcio(administrador, otro.id, 'administrador')
    await cargarPadron(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId: otro.id,
      unidades: [{ designacion: 'PB', coeficiente: '100.00000000' }],
    })
    const { periodoId } = await abrirPeriodo(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId: otro.id,
      anio: 2026,
      mes: 1,
    })
    await registrarGasto(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId: otro.id,
      periodoId,
      rubroId,
      importe: '9999.00',
      fecha: new Date('2026-01-05'),
      descripcion: 'Gasto ajeno',
    })
    await cerrarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId: otro.id, periodoId })
    await liquidarPeriodo(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId: otro.id,
      periodoId,
    })

    const morosidad = await verMorosidad(repo, RELOJ, { usuarioId: administrador, consorcioId })
    expect(morosidad.agregado).toEqual({
      unidadesEnMora: 2,
      unidadesTotales: 2,
      deudaTotal: '1000.00',
    })
  })

  it('el consorcista ve el estado de cuenta de su unidad y no el de la vecina', async () => {
    await emitirMes(1)

    const vecino = await crearUsuario('Beto')
    await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: unidadA,
      personaId: vecino.personaId,
      tipo: 'inquilino',
      desde: new Date('2026-01-01'),
    })

    const propio = await verEstadoDeCuenta(repo, RELOJ, {
      usuarioId: vecino.id,
      consorcioId,
      unidadId: unidadA,
    })
    expect(propio.saldo).toBe('500.00')
    expect(propio.movimientos[0].concepto).toBe('Expensas 01/2026')

    const unidadB = (await prismaBase.unidad.findFirstOrThrow({ where: { designacion: '1B' } })).id
    await expect(
      verEstadoDeCuenta(repo, RELOJ, { usuarioId: vecino.id, consorcioId, unidadId: unidadB }),
    ).rejects.toThrow('No encontramos lo que buscabas.')
  })
})
