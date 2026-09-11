import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { importe } from '@/compartido/dinero'
import { anularLiquidacion } from '@/aplicacion/liquidacion/anular'
import { liquidarPeriodo, PeriodoNoCerrado } from '@/aplicacion/liquidacion/liquidar'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'
import { cambiarCoeficiente, cargarPadron } from '@/aplicacion/consorcios/unidades'
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
 * La emision, contra la base (`RF-07`, `CU-03`).
 *
 * Lo que el dominio ya prueba —el calculo— no se repite aca. Lo de este archivo
 * es lo que **solo la base puede garantizar**: la transaccion entera, el candado
 * contra la emision doble y la reversion de imputaciones.
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let administrador: string
let rubroId: string

const MITADES = [
  { designacion: '1A', coeficiente: '50.00000000' },
  { designacion: '1B', coeficiente: '50.00000000' },
]

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')

  const rubro = await prismaBase.rubroGasto.upsert({
    where: { nombre: 'Rubro de prueba' },
    update: {},
    create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
  })
  rubroId = rubro.id

  await cargarPadron(repo, RELOJ, { usuarioId: administrador, consorcioId, unidades: MITADES })
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "InteresLiquidado"`
  await prismaBase.$executeRaw`DELETE FROM "PagoImputacion"`
  await prismaBase.$executeRaw`DELETE FROM "DetalleLiquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "Liquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "Pago"`
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await prismaBase.$executeRaw`DELETE FROM "Unidad"`
  await limpiar()
})

async function periodoConGasto(mes: number, importeGasto = '1000.00') {
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
    importe: importeGasto,
    fecha: new Date('2026-01-15'),
    descripcion: `Gasto de ${mes}`,
  })

  await cerrarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
  return periodoId
}

describe('emision de la liquidacion', () => {
  it('emite en una transaccion: liquidacion, detalles y periodo liquidado', async () => {
    const periodoId = await periodoConGasto(1)

    const emitida = await liquidarPeriodo(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId,
    })

    expect(emitida.totalGeneral).toBe('1000.00')
    expect(emitida.unidades).toBe(2)
    // El vencimiento sale del dia del consorcio, sobre el mes siguiente.
    expect(emitida.vencimiento).toBe('2026-02-10')

    const periodo = await prismaBase.periodo.findUniqueOrThrow({ where: { id: periodoId } })
    expect(periodo.estado).toBe('liquidado')

    const detalles = await prismaBase.detalleLiquidacion.findMany({
      where: { liquidacionId: emitida.liquidacionId },
    })
    expect(detalles).toHaveLength(2)
    expect(detalles[0].totalUnidad.toFixed(2)).toBe('500.00')
  })

  it('un periodo que no esta cerrado no se liquida', async () => {
    const { periodoId } = await abrirPeriodo(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      anio: 2026,
      mes: 3,
    })

    await expect(
      liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId }),
    ).rejects.toThrow(PeriodoNoCerrado)
  })

  /** SC-011: el candado es la base, no el codigo. */
  it('dos emisiones simultaneas del mismo periodo: emite exactamente una', async () => {
    const periodoId = await periodoConGasto(4)

    const resultados = await Promise.allSettled([
      liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId }),
      liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId }),
    ])

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)

    const vigentes = await prismaBase.liquidacion.count({
      where: { periodoId, estado: 'vigente' },
    })
    expect(vigentes).toBe(1)
  })

  /**
   * SC-010: una falla no deja nada a medias.
   *
   * La falla se provoca con la **segunda emision sin anular**, que es la unica
   * que rompe despues de haber escrito: el indice unico parcial la rechaza
   * recien al insertar la liquidacion, con los detalles de la primera ya en la
   * base. Romper el padron no sirve para esto —el disparador diferido de `002`
   * no deja dejarlo mal ni por fuera de la aplicacion (SC-004b)— y abortar
   * antes de escribir no probaria ninguna reversion.
   */
  it('si la emision falla, no queda nada de esa emision', async () => {
    const periodoId = await periodoConGasto(5)

    const primera = await liquidarPeriodo(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId,
    })

    await expect(
      liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId }),
    ).rejects.toThrow()

    // Ni una liquidacion de mas, ni un detalle huerfano, ni una linea de interes.
    expect(await prismaBase.liquidacion.count({ where: { periodoId } })).toBe(1)
    expect(
      await prismaBase.detalleLiquidacion.count({
        where: { liquidacionId: { not: primera.liquidacionId } },
      }),
    ).toBe(0)
  })
})

describe('anulacion y reemision (FR-003b)', () => {
  it('anular no toca el periodo, y la reemision procede igual', async () => {
    const periodoId = await periodoConGasto(6)

    const primera = await liquidarPeriodo(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId,
    })

    await anularLiquidacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      liquidacionId: primera.liquidacionId,
    })

    // El periodo sigue liquidado: lo que se anulo es la emision.
    const periodo = await prismaBase.periodo.findUniqueOrThrow({ where: { id: periodoId } })
    expect(periodo.estado).toBe('liquidado')

    // Y la reemision entra, porque ya no hay otra vigente.
    const segunda = await liquidarPeriodo(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId,
    })

    expect(segunda.liquidacionId).not.toBe(primera.liquidacionId)

    const todas = await prismaBase.liquidacion.findMany({
      where: { periodoId },
      orderBy: { emitidaEn: 'asc' },
      select: { estado: true },
    })
    expect(todas.map((l) => l.estado)).toEqual(['anulada', 'vigente'])
  })
})

describe('deuda anterior e interes (FR-024b)', () => {
  it('la liquidacion siguiente arrastra lo impago y su interes por mes vencido', async () => {
    const enero = await periodoConGasto(1)
    await liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId: enero })

    // Marzo se liquida el 15/09: enero vencio el 10/02, siete meses completos.
    const marzo = await periodoConGasto(3)
    const segunda = await liquidarPeriodo(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId: marzo,
    })

    const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: segunda.liquidacionId },
    })

    expect(detalle.deudaAnterior.toFixed(2)).toBe('500.00')
    // 500 × 2 % × 7 meses = 70.00
    expect(detalle.interesMora.toFixed(2)).toBe('70.00')

    const desglose = await prismaBase.interesLiquidado.findMany({
      where: { detalleId: detalle.id },
    })
    expect(desglose).toHaveLength(1)
    expect(desglose[0].meses).toBe(7)
    expect(importe(desglose[0].capital.toFixed(2)).toFixed(2)).toBe('500.00')
  })
})

/** PL-07 (§ 15.2.1): la liquidacion vieja conserva su coeficiente (regla RN-02). */
describe('coeficiente cambiado entre dos emisiones (PL-07)', () => {
  it('la anterior conserva el coeficiente aplicado y la nueva usa el vigente', async () => {
    const enero = await periodoConGasto(1)
    const primera = await liquidarPeriodo(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId: enero,
    })

    const unidades = await prismaBase.unidad.findMany({
      where: { consorcioId },
      orderBy: { designacion: 'asc' },
    })

    // 1A pasa de 50 a 60 desde hoy, y 1B se reajusta a 40 en la misma operacion.
    await cambiarCoeficiente(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: unidades[0].id,
      coeficiente: '60.00000000',
      vigenciaDesde: RELOJ.hoy(),
      ajustes: [{ unidadId: unidades[1].id, coeficiente: '40.00000000' }],
    })

    const marzo = await periodoConGasto(3)
    const segunda = await liquidarPeriodo(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId: marzo,
    })

    const de = async (liquidacionId: string) =>
      (
        await prismaBase.detalleLiquidacion.findFirstOrThrow({
          where: { liquidacionId, unidadId: unidades[0].id },
        })
      ).coeficienteAplicado.toFixed(8)

    expect(await de(primera.liquidacionId)).toBe('50.00000000')
    expect(await de(segunda.liquidacionId)).toBe('60.00000000')
  })
})
