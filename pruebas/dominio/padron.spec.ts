import { describe, expect, it } from 'vitest'

import { importe } from '@/compartido/dinero'
import { ajustePorRedondeo, filasDesdePegado, padronPorPisos } from '@/compartido/padron'

const CIEN = importe('100.00000000')

const suma = (filas: { coeficiente: string }[]) =>
  filas.reduce((total, fila) => total.plus(importe(fila.coeficiente)), importe('0'))

/** Doce unidades iguales: el caso que a mano no cierra nunca (FR-011c). */
const doce = (ultimo: string) => [
  ...Array.from({ length: 11 }, (_, i) => ({
    designacion: `U${i + 1}`,
    coeficiente: '8.33333333',
  })),
  { designacion: 'U12', coeficiente: ultimo },
]

describe('padron generado por pisos', () => {
  it('tres unidades quedan en dos decimales, con una en 33.34', () => {
    expect(padronPorPisos(1, 3, CIEN)).toEqual([
      { designacion: '1A', coeficiente: '33.34' },
      { designacion: '1B', coeficiente: '33.33' },
      { designacion: '1C', coeficiente: '33.33' },
    ])
  })

  it('numera por piso y por letra', () => {
    const filas = padronPorPisos(4, 3, CIEN)
    expect(filas).toHaveLength(12)
    expect(filas.map((fila) => fila.designacion)).toEqual([
      '1A',
      '1B',
      '1C',
      '2A',
      '2B',
      '2C',
      '3A',
      '3B',
      '3C',
      '4A',
      '4B',
      '4C',
    ])
  })

  it('doce unidades tambien entran en dos decimales', () => {
    const filas = padronPorPisos(4, 3, CIEN)
    expect(filas[0].coeficiente).toBe('8.37')
    expect(filas[1].coeficiente).toBe('8.33')
  })

  /**
   * El caso que obliga a mas precision: con dos decimales sobraria 0.16 % sobre
   * una sola unidad, un 15 % de su coeficiente. Con cuatro, el exceso de esa
   * unidad es de 0.61 %, y nadie paga de mas por el redondeo.
   */
  it('noventa y seis unidades bajan a la precision que haga falta', () => {
    const filas = padronPorPisos(32, 3, CIEN)
    expect(filas).toHaveLength(96)
    expect(filas[1].coeficiente).toBe('1.0416')
    expect(filas[0].coeficiente).toBe('1.0480')

    const exceso = importe(filas[0].coeficiente).minus(importe(filas[1].coeficiente))
    expect(exceso.dividedBy(importe(filas[1].coeficiente)).lessThan(0.01)).toBe(true)
  })

  it('siempre suma exactamente 100', () => {
    for (const [pisos, porPiso] of [
      [1, 1],
      [1, 3],
      [4, 3],
      [32, 3],
      [10, 7],
      [13, 2],
      [24, 4],
    ]) {
      expect(suma(padronPorPisos(pisos, porPiso, CIEN)).equals(CIEN)).toBe(true)
    }
  })

  it('con mas de veintiseis unidades por piso numera en vez de agotar el abecedario', () => {
    expect(padronPorPisos(1, 30, CIEN)[26].designacion).toBe('1-27')
  })

  it('no genera nada sin pisos o sin unidades', () => {
    expect(padronPorPisos(0, 3, CIEN)).toEqual([])
    expect(padronPorPisos(3, 0, CIEN)).toEqual([])
  })
})

describe('pegado del padron', () => {
  it('lee designacion y coeficiente separados por tabulacion', () => {
    expect(filasDesdePegado('1A\t12.5\n1B\t7.5')).toEqual([
      { designacion: '1A', coeficiente: '12.5' },
      { designacion: '1B', coeficiente: '7.5' },
    ])
  })

  it('lee el CSV del padron, con encabezado y columnas de mas', () => {
    const pegado = [
      'consorcio;unidad;coeficiente;ocupacion;estado_mora',
      'C-A;1A;12.50000000;propietario;al día',
      'C-A;1B;7.50000000;inquilino;al día',
    ].join('\n')

    expect(filasDesdePegado(pegado)).toEqual([
      { designacion: '1A', coeficiente: '12.50000000' },
      { designacion: '1B', coeficiente: '7.50000000' },
    ])
  })

  it('acepta la coma decimal que sale de una planilla en español', () => {
    expect(filasDesdePegado('1A\t12,50000000')).toEqual([
      { designacion: '1A', coeficiente: '12.50000000' },
    ])
  })

  it('toma el tipo si la linea lo trae y el vocabulario lo reconoce', () => {
    const pegado = ['1A;departamento;8.33', 'Cochera 1;cochera;2.00', '1B;lo que sea;5.00'].join(
      '\n',
    )

    expect(filasDesdePegado(pegado, ['departamento', 'cochera'])).toEqual([
      { designacion: '1A', coeficiente: '8.33', tipo: 'departamento' },
      { designacion: 'Cochera 1', coeficiente: '2.00', tipo: 'cochera' },
      { designacion: 'lo que sea', coeficiente: '5.00' },
    ])
  })

  it('sin vocabulario, el tipo no se adivina', () => {
    expect(filasDesdePegado('Cochera 1;cochera;2.00')).toEqual([
      { designacion: 'cochera', coeficiente: '2.00' },
    ])
  })

  it('ignora las lineas sin numero en vez de romperse', () => {
    expect(filasDesdePegado('Padron del edificio\n\n1A,12.5')).toEqual([
      { designacion: '1A', coeficiente: '12.5' },
    ])
  })
})

describe('ajuste por redondeo', () => {
  it('asigna la diferencia a la unidad de mayor coeficiente', () => {
    const filas = [
      { designacion: '1A', coeficiente: '12.50000000' },
      { designacion: '1B', coeficiente: '7.50000000' },
      { designacion: '1C', coeficiente: '79.99999999' },
    ]

    expect(ajustePorRedondeo(filas, CIEN)).toMatchObject({
      designacion: '1C',
      anterior: '79.99999999',
      nuevo: '80.00000000',
      diferencia: '0.00000001',
    })
  })

  it('cierra las doce unidades iguales, que a mano no cierran', () => {
    const ajuste = ajustePorRedondeo(doce('8.33333336'), CIEN)
    expect(ajuste?.nuevo).toBe('8.33333337')
  })

  it('tambien saca lo que sobra', () => {
    const ajuste = ajustePorRedondeo(doce('8.33333338'), CIEN)
    expect(ajuste?.diferencia).toBe('-0.00000001')
    expect(ajuste?.nuevo).toBe('8.33333337')
  })

  it('no ofrece nada si ya cierra', () => {
    expect(ajustePorRedondeo(doce('8.33333337'), CIEN)).toBeNull()
  })

  /** Lo que no es redondeo no se tapa moviendo un coeficiente. */
  it('no ofrece nada si la diferencia excede un ultimo digito por unidad', () => {
    expect(ajustePorRedondeo(doce('8.33333350'), CIEN)).toBeNull()
    expect(ajustePorRedondeo([{ designacion: '1A', coeficiente: '96' }], CIEN)).toBeNull()
  })

  it('no ofrece nada con una fila a medio tipear', () => {
    const filas = [...doce('8.33333336'), { designacion: '1X', coeficiente: '' }]
    expect(ajustePorRedondeo(filas, CIEN)).toBeNull()
  })

  it('ignora las filas todavia vacias', () => {
    const filas = [...doce('8.33333336'), { designacion: '', coeficiente: '' }]
    expect(ajustePorRedondeo(filas, CIEN)?.nuevo).toBe('8.33333337')
  })
})
