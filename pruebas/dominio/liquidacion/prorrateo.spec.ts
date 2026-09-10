import { describe, expect, it } from 'vitest'

import { importe } from '@/compartido/dinero'
import { SumaDeCoeficientesInvalida } from '@/dominio/coeficientes/suma'
import {
  DiferenciaDeRedondeoInaceptable,
  prorratear,
  type UnidadDelPadron,
} from '@/dominio/liquidacion/prorrateo'

/**
 * El corazon economico del sistema (`RF-07`, reglas RN-01, RN-05 y RN-07 § 7.2).
 *
 * Todo lo de este archivo corre **sin base de datos**: es lo que el Principio
 * III compra, y lo que permite ejercitar el calculo mil veces sin que cueste.
 */

/**
 * La cuadratura de SC-001 es sobre lo que **cada unidad paga**, no sobre uno de
 * los subtotales: el ajuste de redondeo vive en campo propio (regla RN-07), asi
 * que sumar solo `importeOrdinario` da de menos por construccion.
 */
const totalPagado = (filas: { totalUnidad: string }[]) =>
  filas.reduce((suma, fila) => suma.plus(importe(fila.totalUnidad)), importe('0'))

/** `n` unidades iguales, con el sobrante de la division en la primera. */
function padronParejo(n: number): UnidadDelPadron[] {
  const parejo = importe('100').div(n).toDecimalPlaces(8, 1 /* ROUND_DOWN */)
  const sobrante = importe('100').minus(parejo.times(n))

  return Array.from({ length: n }, (_, i) => ({
    unidadId: `u-${String(i + 1).padStart(3, '0')}`,
    designacion: `U${i + 1}`,
    coeficiente: (i === 0 ? parejo.plus(sobrante) : parejo).toFixed(8),
  }))
}

const MITADES: UnidadDelPadron[] = [
  { unidadId: 'u-1', designacion: '1A', coeficiente: '50.00000000' },
  { unidadId: 'u-2', designacion: '1B', coeficiente: '50.00000000' },
]

describe('prorrateo (SC-001)', () => {
  it.each([1, 12, 96, 100])('cuadra con tolerancia cero sobre %i unidades', (n) => {
    const resultado = prorratear({
      padron: padronParejo(n),
      totalOrdinario: '1000000.00',
      totalExtraordinario: '0.00',
    })

    expect(resultado.detalles).toHaveLength(n)
    expect(totalPagado(resultado.detalles).toFixed(2)).toBe('1000000.00')
  })

  it('produce dos subtotales por unidad: el ocupante y el propietario (regla RN-05)', () => {
    const resultado = prorratear({
      padron: MITADES,
      totalOrdinario: '1000.00',
      totalExtraordinario: '500.00',
    })

    expect(resultado.detalles[0].importeOrdinario).toBe('500.00')
    expect(resultado.detalles[0].importeExtraordinario).toBe('250.00')
    expect(resultado.detalles[0].totalUnidad).toBe('750.00')
  })

  it('copia el coeficiente aplicado a cada detalle (regla RN-02)', () => {
    const resultado = prorratear({
      padron: MITADES,
      totalOrdinario: '1000.00',
      totalExtraordinario: '0.00',
    })

    expect(resultado.detalles[0].coeficienteAplicado).toBe('50.00000000')
  })

  it('redondea solo al final: tres unidades sobre 100 no pierden un centavo', () => {
    const resultado = prorratear({
      padron: padronParejo(3),
      totalOrdinario: '100.00',
      totalExtraordinario: '0.00',
    })

    expect(totalPagado(resultado.detalles).toFixed(2)).toBe('100.00')
  })
})

describe('el padron que no cierra se rechaza antes de calcular (SC-004)', () => {
  it('aborta con la diferencia exacta y las unidades', () => {
    const flojo = [
      { unidadId: 'u-1', designacion: '1A', coeficiente: '50.00000000' },
      { unidadId: 'u-2', designacion: '1B', coeficiente: '49.99999999' },
    ]

    expect(() =>
      prorratear({ padron: flojo, totalOrdinario: '1000.00', totalExtraordinario: '0.00' }),
    ).toThrow(SumaDeCoeficientesInvalida)

    try {
      prorratear({ padron: flojo, totalOrdinario: '1000.00', totalExtraordinario: '0.00' })
    } catch (error) {
      expect((error as SumaDeCoeficientesInvalida).mensajeParaUsuario).toContain('0.00000001')
      expect((error as SumaDeCoeficientesInvalida).mensajeParaUsuario).toContain('2 unidades')
    }
  })

  it('un padron vacio tampoco liquida', () => {
    expect(() =>
      prorratear({ padron: [], totalOrdinario: '1000.00', totalExtraordinario: '0.00' }),
    ).toThrow()
  })
})

describe('la diferencia de redondeo (regla RN-07, FR-009)', () => {
  it('va entera a la unidad de mayor coeficiente, en su campo propio', () => {
    const resultado = prorratear({
      padron: padronParejo(3),
      totalOrdinario: '100.00',
      totalExtraordinario: '0.00',
    })

    const conAjuste = resultado.detalles.filter((d) => d.ajusteRedondeo !== '0.00')
    expect(conAjuste).toHaveLength(1)
    expect(conAjuste[0].unidadId).toBe('u-001')
    expect(conAjuste[0].ajusteRedondeo).toBe('0.01')
    // El ajuste **no** esta sumado al importe: es una linea aparte.
    expect(conAjuste[0].importeOrdinario).toBe('33.33')
    expect(conAjuste[0].totalUnidad).toBe('33.34')
  })

  it('con coeficientes empatados gana el identificador menor, para que sea determinista', () => {
    const empatados: UnidadDelPadron[] = [
      { unidadId: 'u-2', designacion: '1B', coeficiente: '33.33333333' },
      { unidadId: 'u-1', designacion: '1A', coeficiente: '33.33333334' },
      { unidadId: 'u-3', designacion: '1C', coeficiente: '33.33333333' },
    ]

    const primera = prorratear({
      padron: empatados,
      totalOrdinario: '100.00',
      totalExtraordinario: '0.00',
    })
    const segunda = prorratear({
      padron: [...empatados].reverse(),
      totalOrdinario: '100.00',
      totalExtraordinario: '0.00',
    })

    const ajustada = (r: typeof primera) =>
      r.detalles.find((d) => d.ajusteRedondeo !== '0.00')?.unidadId

    expect(ajustada(primera)).toBe(ajustada(segunda))
  })

  /**
   * El caso de borde que la especificación nombra: cuatro unidades iguales, y
   * el mayor coeficiente empatado entre las cuatro. Sin desempate declarado, la
   * unidad que absorbe dependería del orden en que llegó el padrón.
   */
  it('con el maximo empatado entre varias, absorbe la de identificador menor', () => {
    const cuartos: UnidadDelPadron[] = [
      { unidadId: 'u-3', designacion: '1C', coeficiente: '25.00000000' },
      { unidadId: 'u-1', designacion: '1A', coeficiente: '25.00000000' },
      { unidadId: 'u-4', designacion: '1D', coeficiente: '25.00000000' },
      { unidadId: 'u-2', designacion: '1B', coeficiente: '25.00000000' },
    ]

    for (const padron of [cuartos, [...cuartos].reverse()]) {
      const resultado = prorratear({
        padron,
        totalOrdinario: '100.01',
        totalExtraordinario: '0.00',
      })

      const conAjuste = resultado.detalles.filter((d) => d.ajusteRedondeo !== '0.00')
      expect(conAjuste).toHaveLength(1)
      expect(conAjuste[0].unidadId).toBe('u-1')
      expect(totalPagado(resultado.detalles).toFixed(2)).toBe('100.01')
    }
  })

  it('aborta si la diferencia supera un centavo por unidad (SC-003)', () => {
    // Un padron de dos unidades no puede dejar mas de dos centavos de sobrante
    // por redondeo: se fuerza con un total que el prorrateo no puede repartir.
    expect(() =>
      prorratear({
        padron: MITADES,
        totalOrdinario: '1000.00',
        totalExtraordinario: '0.00',
        toleranciaPorUnidad: '0.00',
      }),
    ).not.toThrow()

    expect(() =>
      prorratear({
        padron: padronParejo(3),
        totalOrdinario: '100.00',
        totalExtraordinario: '0.00',
        toleranciaPorUnidad: '0.00',
      }),
    ).toThrow(DiferenciaDeRedondeoInaceptable)
  })
})
