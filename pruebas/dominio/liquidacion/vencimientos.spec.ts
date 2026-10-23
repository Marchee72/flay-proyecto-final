import { describe, expect, it } from 'vitest'

import { ErrorDeAplicacion } from '@/compartido/errores'
import {
  montoExigible,
  recargoVigente,
  validarReglaVencimientos,
  type TramoCongelado,
} from '@/dominio/liquidacion/vencimientos'

const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`)

// Ejemplo de la nota: dias 10/20/28, recargos 0/5/8 (noviembre 2026).
const tramos: TramoCongelado[] = [
  { orden: 1, fecha: fecha('2026-11-10'), recargoPorcentaje: '0.0000' },
  { orden: 2, fecha: fecha('2026-11-20'), recargoPorcentaje: '5.0000' },
  { orden: 3, fecha: fecha('2026-11-28'), recargoPorcentaje: '8.0000' },
]

describe('recargoVigente — tramo aplicable por fecha (RF-08)', () => {
  it('antes del primer vencimiento: base, tramo 1', () => {
    expect(recargoVigente(tramos, fecha('2026-11-05'))).toMatchObject({
      recargoPorcentaje: '0.0000',
      tramo: 1,
      venceEnFirme: false,
    })
  })

  it('el día del primer vencimiento es inclusive: todavía base', () => {
    expect(recargoVigente(tramos, fecha('2026-11-10')).tramo).toBe(1)
  })

  it('entre el 1º y el 2º: recargo del tramo 2', () => {
    expect(recargoVigente(tramos, fecha('2026-11-15'))).toMatchObject({
      recargoPorcentaje: '5.0000',
      tramo: 2,
    })
  })

  it('el día del último vencimiento es inclusive: tramo 3', () => {
    expect(recargoVigente(tramos, fecha('2026-11-28'))).toMatchObject({
      recargoPorcentaje: '8.0000',
      tramo: 3,
    })
  })

  it('pasado el último: vencida en firme, sin recargo', () => {
    expect(recargoVigente(tramos, fecha('2026-11-29'))).toMatchObject({
      recargoPorcentaje: '0.0000',
      tramo: null,
      venceEnFirme: true,
    })
  })
})

describe('montoExigible — base más recargo (Principio II)', () => {
  it('sin recargo, el exigible es el base', () => {
    expect(montoExigible('100000.00', '0.0000')).toBe('100000.00')
  })

  it('5 % sobre 100000', () => {
    expect(montoExigible('100000.00', '5.0000')).toBe('105000.00')
  })

  it('8 % sobre 100000', () => {
    expect(montoExigible('100000.00', '8.0000')).toBe('108000.00')
  })

  it('redondea a dos decimales solo al final (1234.57 × 1.05 = 1296.2985)', () => {
    expect(montoExigible('1234.57', '5.0000')).toBe('1296.30')
  })
})

describe('validarReglaVencimientos — coherencia (RF-08, RNF-10)', () => {
  it('acepta 3 tramos con mora mayor al último recargo', () => {
    expect(() =>
      validarReglaVencimientos(
        [
          { orden: 1, diaDelMes: 10, recargoPorcentaje: '0.0000' },
          { orden: 2, diaDelMes: 20, recargoPorcentaje: '5.0000' },
          { orden: 3, diaDelMes: 28, recargoPorcentaje: '8.0000' },
        ],
        '10.0000',
      ),
    ).not.toThrow()
  })

  it('acepta un solo tramo (comportamiento actual)', () => {
    expect(() =>
      validarReglaVencimientos(
        [{ orden: 1, diaDelMes: 10, recargoPorcentaje: '0.0000' }],
        '10.0000',
      ),
    ).not.toThrow()
  })

  it('rechaza mora igual o menor que el último recargo', () => {
    expect(() =>
      validarReglaVencimientos(
        [
          { orden: 1, diaDelMes: 10, recargoPorcentaje: '0.0000' },
          { orden: 2, diaDelMes: 20, recargoPorcentaje: '10.0000' },
        ],
        '10.0000',
      ),
    ).toThrow(ErrorDeAplicacion)
  })

  it('rechaza días no ascendentes', () => {
    expect(() =>
      validarReglaVencimientos(
        [
          { orden: 1, diaDelMes: 20, recargoPorcentaje: '0.0000' },
          { orden: 2, diaDelMes: 10, recargoPorcentaje: '5.0000' },
        ],
        '10.0000',
      ),
    ).toThrow()
  })

  it('rechaza día mayor a 28', () => {
    expect(() =>
      validarReglaVencimientos(
        [{ orden: 1, diaDelMes: 30, recargoPorcentaje: '0.0000' }],
        '10.0000',
      ),
    ).toThrow()
  })

  it('rechaza primer tramo con recargo distinto de 0', () => {
    expect(() =>
      validarReglaVencimientos(
        [{ orden: 1, diaDelMes: 10, recargoPorcentaje: '3.0000' }],
        '10.0000',
      ),
    ).toThrow()
  })
})
