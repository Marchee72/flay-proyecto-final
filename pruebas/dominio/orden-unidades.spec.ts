import { describe, expect, it } from 'vitest'

import {
  compararDesignaciones,
  desglosarDesignacion,
  ordenarUnidades,
} from '@/dominio/unidades/division'

describe('desglosarDesignacion', () => {
  it('desglosa subsuelos', () => {
    expect(desglosarDesignacion('SS')).toEqual({ categoria: -1, piso: -1, resto: '' })
    expect(desglosarDesignacion('SS 2')).toEqual({ categoria: -1, piso: -2, resto: '' })
    expect(desglosarDesignacion('Subsuelo 1 A')).toEqual({ categoria: -1, piso: -1, resto: 'A' })
  })

  it('desglosa planta baja', () => {
    expect(desglosarDesignacion('PB')).toEqual({ categoria: 0, piso: 0, resto: '' })
    expect(desglosarDesignacion('PB A')).toEqual({ categoria: 0, piso: 0, resto: 'A' })
    expect(desglosarDesignacion('PB-01')).toEqual({ categoria: 0, piso: 0, resto: '01' })
    expect(desglosarDesignacion('Planta Baja B')).toEqual({ categoria: 0, piso: 0, resto: 'B' })
  })

  it('desglosa pisos numéricos', () => {
    expect(desglosarDesignacion('1A')).toEqual({ categoria: 1, piso: 1, resto: 'A' })
    expect(desglosarDesignacion('2B')).toEqual({ categoria: 1, piso: 2, resto: 'B' })
    expect(desglosarDesignacion('10A')).toEqual({ categoria: 1, piso: 10, resto: 'A' })
    expect(desglosarDesignacion('10-B')).toEqual({ categoria: 1, piso: 10, resto: 'B' })
    expect(desglosarDesignacion('Piso 4 C')).toEqual({ categoria: 1, piso: 4, resto: 'C' })
  })

  it('desglosa unidades complementarias u otras', () => {
    expect(desglosarDesignacion('C1')).toEqual({ categoria: 2, piso: 9999, resto: 'C1' })
    expect(desglosarDesignacion('Cochera 10')).toEqual({
      categoria: 2,
      piso: 9999,
      resto: 'Cochera 10',
    })
    expect(desglosarDesignacion('Local 2')).toEqual({ categoria: 2, piso: 9999, resto: 'Local 2' })
  })
})

describe('compararDesignaciones y ordenarUnidades', () => {
  it('ordena por piso físico y no alfabéticamente (1A y 2A antes de 10A)', () => {
    const desordenadas = ['10B', '10A', '2A', '1B', '1A', '2B']
    const ordenadas = [...desordenadas].sort(compararDesignaciones)
    expect(ordenadas).toEqual(['1A', '1B', '2A', '2B', '10A', '10B'])
  })

  it('ubica Subsuelos antes de PB, PB antes de Piso 1, y Cocheras al final', () => {
    const unidades = [
      { id: '10', designacion: '10A' },
      { id: 'c1', designacion: 'C1' },
      { id: 'c10', designacion: 'C10' },
      { id: 'c2', designacion: 'C2' },
      { id: '1', designacion: '1A' },
      { id: 'pb-b', designacion: 'PB B' },
      { id: 'pb-a', designacion: 'PB A' },
      { id: 'ss1', designacion: 'SS 1' },
      { id: 'ss2', designacion: 'SS 2' },
      { id: '2', designacion: '2A' },
    ]

    const resultado = ordenarUnidades(unidades)
    expect(resultado.map((u) => u.designacion)).toEqual([
      'SS 2',
      'SS 1',
      'PB A',
      'PB B',
      '1A',
      '2A',
      '10A',
      'C1',
      'C2',
      'C10',
    ])
  })

  it('ordena colecciones genéricas con números naturales (U1..U12)', () => {
    const unidades = [
      { designacion: 'U10' },
      { designacion: 'U1' },
      { designacion: 'U2' },
      { designacion: 'U12' },
      { designacion: 'U9' },
    ]
    expect(ordenarUnidades(unidades).map((u) => u.designacion)).toEqual([
      'U1',
      'U2',
      'U9',
      'U10',
      'U12',
    ])
  })
})
