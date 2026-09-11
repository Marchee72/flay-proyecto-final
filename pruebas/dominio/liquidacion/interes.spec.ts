import { describe, expect, it } from 'vitest'

import { importe } from '@/compartido/dinero'
import { interesPorMora, mesesCompletos } from '@/dominio/liquidacion/interes'

/**
 * Interes por mora (`FR-024`, `FR-025`, SC-014b).
 *
 * La formula la decidio el equipo el 2026-09-10: **simple, por mes vencido
 * completo**, sin prorrateo de dias y sin capitalizar, y contada **por cada
 * liquidacion impaga desde su propio vencimiento**. Estas pruebas son el lugar
 * donde esa decision queda fijada.
 */

const fecha = (dia: string) => new Date(`${dia}T00:00:00Z`)

const deuda = (id: string, capital: string, vencimiento: string) => ({
  liquidacionId: id,
  capital,
  vencimiento: fecha(vencimiento),
})

describe('meses vencidos completos (research R-05)', () => {
  it('veintinueve dias de atraso son cero meses', () => {
    expect(mesesCompletos(fecha('2026-01-10'), fecha('2026-02-08'))).toBe(0)
  })

  it('el dia exacto del mes siguiente completa el primero', () => {
    expect(mesesCompletos(fecha('2026-01-10'), fecha('2026-02-10'))).toBe(1)
  })

  it('sesenta dias son dos meses', () => {
    expect(mesesCompletos(fecha('2026-01-10'), fecha('2026-03-11'))).toBe(2)
  })

  it('antes del vencimiento no hay meses', () => {
    expect(mesesCompletos(fecha('2026-03-10'), fecha('2026-01-01'))).toBe(0)
  })

  /** El borde del calendario: no hay 31 de febrero. */
  it('de un vencimiento el 31, el 28 de febrero no completa el mes y el 1 de marzo si', () => {
    expect(mesesCompletos(fecha('2026-01-31'), fecha('2026-02-28'))).toBe(0)
    expect(mesesCompletos(fecha('2026-01-31'), fecha('2026-03-01'))).toBe(1)
  })
})

describe('interes por mora (FR-024)', () => {
  const TASA = importe('2.0000') // 2 % mensual

  it('veintinueve dias de atraso dan cero', () => {
    const calculo = interesPorMora(
      [deuda('l-1', '10000.00', '2026-01-10')],
      TASA,
      fecha('2026-02-08'),
    )

    expect(calculo.total).toBe('0.00')
    expect(calculo.desglose).toEqual([])
  })

  it('dos meses se calculan sobre el mismo capital: no capitaliza', () => {
    const calculo = interesPorMora(
      [deuda('l-1', '10000.00', '2026-01-10')],
      TASA,
      fecha('2026-03-10'),
    )

    expect(calculo.total).toBe('400.00')
    expect(calculo.desglose).toEqual([
      {
        liquidacionId: 'l-1',
        capital: '10000.00',
        tasaMensual: '2.0000',
        meses: 2,
        importe: '400.00',
      },
    ])
  })

  it('tasa cero da interes cero, sin caso especial', () => {
    const calculo = interesPorMora(
      [deuda('l-1', '10000.00', '2026-01-10')],
      importe('0'),
      fecha('2026-06-10'),
    )

    expect(calculo.total).toBe('0.00')
  })

  /**
   * La decision que mas se nota: tres liquidaciones impagas devengan tres, dos
   * y un mes **cada una desde su propio vencimiento**, y no dos meses sobre el
   * total. Es lo que le da sentido a imputar por antiguedad (regla RN-08).
   */
  it('suma un calculo independiente por cada liquidacion impaga', () => {
    const calculo = interesPorMora(
      [
        deuda('l-1', '10000.00', '2026-01-10'),
        deuda('l-2', '10000.00', '2026-02-10'),
        deuda('l-3', '10000.00', '2026-03-10'),
      ],
      TASA,
      fecha('2026-04-10'),
    )

    expect(calculo.desglose.map((d) => d.meses)).toEqual([3, 2, 1])
    // 200 + 400 + 600 = 1200, y no 2 meses sobre 30.000 = 1200 por casualidad:
    // se verifica el desglose, que es lo que distingue las dos lecturas.
    expect(calculo.total).toBe('1200.00')
  })

  it('deja afuera las liquidaciones que todavia no vencieron', () => {
    const calculo = interesPorMora(
      [deuda('l-1', '10000.00', '2026-01-10'), deuda('l-2', '10000.00', '2026-05-10')],
      TASA,
      fecha('2026-04-10'),
    )

    expect(calculo.desglose).toHaveLength(1)
    expect(calculo.desglose[0].liquidacionId).toBe('l-1')
  })

  it('sin deuda no hay interes', () => {
    expect(interesPorMora([], TASA, fecha('2026-04-10')).total).toBe('0.00')
  })

  it('redondea cada linea a dos decimales y el total es la suma de las lineas', () => {
    const calculo = interesPorMora(
      [deuda('l-1', '333.33', '2026-01-10'), deuda('l-2', '333.33', '2026-01-10')],
      importe('1.5000'),
      fecha('2026-02-10'),
    )

    expect(calculo.desglose.map((d) => d.importe)).toEqual(['5.00', '5.00'])
    expect(calculo.total).toBe('10.00')
  })
})
