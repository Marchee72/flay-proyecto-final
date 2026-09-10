import { describe, expect, it } from 'vitest'

import {
  admiteGastos,
  ESTADOS_PERIODO,
  exigirPeriodoConGastos,
  PeriodoNoAdmiteGastos,
  transicionValida,
} from '@/dominio/periodos/estado'

/**
 * FR-017 y regla RN-03, sin base de datos (Principio III). La prueba usa el
 * contrato compartido en vez de fabricar un estado propio: si `003-liquidacion`
 * cambiara la maquina, esto se entera aca y no en produccion.
 */

describe('estado del periodo', () => {
  it('declara los cuatro valores que comparte 003-liquidacion', () => {
    expect([...ESTADOS_PERIODO]).toEqual(['abierto', 'cerrado', 'liquidado', 'anulado'])
  })

  it('solo un periodo abierto admite gastos (regla RN-03)', () => {
    expect(admiteGastos('abierto')).toBe(true)

    for (const estado of ['cerrado', 'liquidado', 'anulado'] as const) {
      expect(admiteGastos(estado)).toBe(false)
    }
  })

  it('un periodo liquidado no vuelve atras', () => {
    expect(transicionValida('liquidado', 'abierto')).toBe(false)
    expect(transicionValida('liquidado', 'cerrado')).toBe(false)
  })

  it('un periodo cerrado se puede reabrir: aparece una factura del mes', () => {
    expect(transicionValida('cerrado', 'abierto')).toBe(true)
    expect(transicionValida('cerrado', 'liquidado')).toBe(true)
  })

  it('el rechazo dice el estado y que hacer, no un codigo (RNF-10)', () => {
    expect(() => exigirPeriodoConGastos('liquidado')).toThrow(PeriodoNoAdmiteGastos)

    try {
      exigirPeriodoConGastos('liquidado')
    } catch (error) {
      const mensaje = (error as PeriodoNoAdmiteGastos).mensajeParaUsuario
      expect(mensaje).toContain('liquidado')
      expect(mensaje).toContain('período siguiente')
    }
  })

  it('un periodo abierto no lanza', () => {
    expect(() => exigirPeriodoConGastos('abierto')).not.toThrow()
  })
})
