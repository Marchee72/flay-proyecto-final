import { describe, expect, it } from 'vitest'

import { Decimal, importe } from '@/compartido/dinero'
import {
  exigirSumaExacta,
  SUMA_EXIGIDA,
  SumaDeCoeficientesInvalida,
  sumarCoeficientes,
  type UnidadConCoeficiente,
} from '@/dominio/coeficientes/suma'

/**
 * Regla RN-01, SC-001 y SC-004. Prueba escrita **antes** que la implementacion:
 * la constitucion no deja opcional el desarrollo guiado por pruebas en el
 * nucleo economico, y esto es la precondicion aritmetica de la liquidacion.
 *
 * Todas las comparaciones son decimales exactas. Ninguna usa tolerancia: una
 * tolerancia de un cienmillonesimo es exactamente el error que la regla busca.
 */

const unidad = (designacion: string, coeficiente: string): UnidadConCoeficiente => ({
  designacion,
  coeficiente: importe(coeficiente),
})

/**
 * Reparto parejo con el resto en la ultima unidad, que es como queda un edificio
 * real: 100 / 96 no da exacto y el reglamento se lo carga a alguien.
 */
function juegoDe(cantidad: number): UnidadConCoeficiente[] {
  const parejo = SUMA_EXIGIDA.div(cantidad).toDecimalPlaces(8, Decimal.ROUND_DOWN)
  const ultima = SUMA_EXIGIDA.minus(parejo.times(cantidad - 1))

  return Array.from({ length: cantidad }, (_, i) => ({
    designacion: `U${String(i + 1).padStart(3, '0')}`,
    coeficiente: i === cantidad - 1 ? ultima : parejo,
  }))
}

describe('suma de coeficientes (regla RN-01)', () => {
  it('el consorcio de 12 unidades del juego de § 13.4 suma exacto (SC-001)', () => {
    const resultado = sumarCoeficientes(juegoDe(12))

    expect(resultado.cuadra).toBe(true)
    expect(resultado.total.toFixed(8)).toBe('100.00000000')
    expect(resultado.diferencia.isZero()).toBe(true)
  })

  it('el consorcio de 96 unidades del juego de § 13.4 suma exacto (SC-001)', () => {
    const unidades = juegoDe(96)
    const resultado = sumarCoeficientes(unidades)

    expect(unidades).toHaveLength(96)
    expect(resultado.cuadra).toBe(true)
    expect(resultado.total.toFixed(8)).toBe('100.00000000')
  })

  it('un consorcio de una sola unidad va al 100.00000000', () => {
    const resultado = sumarCoeficientes([unidad('UNICA', '100.00000000')])

    expect(resultado.cuadra).toBe(true)
    expect(resultado.total.toFixed(8)).toBe('100.00000000')
  })

  it('una diferencia de 0.00000001 no cuadra, y la diferencia sale con signo (SC-004)', () => {
    const unidades = [unidad('1A', '50.00000000'), unidad('1B', '49.99999999')]
    const resultado = sumarCoeficientes(unidades)

    expect(resultado.cuadra).toBe(false)
    expect(resultado.total.toFixed(8)).toBe('99.99999999')
    // Negativa: falta. Positiva seria que sobra.
    expect(resultado.diferencia.toFixed(8)).toBe('-0.00000001')
    expect(resultado.unidades).toEqual(['1A', '1B'])
  })

  it('un centesimo de mas tampoco cuadra: la comparacion es exacta, no por tolerancia', () => {
    const resultado = sumarCoeficientes([unidad('1A', '50.00000000'), unidad('1B', '50.00000001')])

    expect(resultado.cuadra).toBe(false)
    expect(resultado.diferencia.toFixed(8)).toBe('0.00000001')
  })

  it('un consorcio sin ninguna unidad no viola la regla (FR-011c)', () => {
    const resultado = sumarCoeficientes([])

    expect(resultado.cuadra).toBe(true)
    expect(resultado.total.isZero()).toBe(true)
  })
})

describe('exigirSumaExacta', () => {
  it('deja pasar la suma exacta', () => {
    expect(() => exigirSumaExacta(juegoDe(12))).not.toThrow()
  })

  it('rechaza nombrando la diferencia exacta y las unidades (FR-011, RNF-10)', () => {
    const unidades = [unidad('1A', '50.00000000'), unidad('1B', '49.99999999')]

    let capturado: SumaDeCoeficientesInvalida | undefined
    try {
      exigirSumaExacta(unidades)
    } catch (error) {
      capturado = error as SumaDeCoeficientesInvalida
    }

    expect(capturado).toBeInstanceOf(SumaDeCoeficientesInvalida)
    // El mensaje dice el numero, no un codigo: lo lee el administrador.
    expect(capturado!.mensajeParaUsuario).toContain('99.99999999')
    expect(capturado!.mensajeParaUsuario).toContain('0.00000001')
    expect(capturado!.mensajeParaUsuario).toContain('falta')
    expect(capturado!.detalle).toMatchObject({ unidades: ['1A', '1B'] })
  })

  it('cuando sobra, lo dice al reves', () => {
    expect(() => exigirSumaExacta([unidad('1A', '100.00000001')])).toThrow(/sobra 0\.00000001/)
  })
})
