import { describe, expect, it } from 'vitest'

import { importe } from '@/compartido/dinero'
import { ajustePorRedondeo, filasDesdePegado } from '@/compartido/padron'

const CIEN = importe('100.00000000')

/** Doce unidades iguales: el caso que a mano no cierra nunca (FR-011c). */
const doce = (ultimo: string) => [
  ...Array.from({ length: 11 }, (_, i) => ({
    designacion: `U${i + 1}`,
    coeficiente: '8.33333333',
  })),
  { designacion: 'U12', coeficiente: ultimo },
]

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
