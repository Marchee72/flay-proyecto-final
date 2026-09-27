import { describe, expect, it } from 'vitest'

import { divisionDe } from '@/dominio/unidades/division'

describe('divisionDe (RF-18)', () => {
  it('es la letra que sigue al piso', () => {
    expect(divisionDe('3A')).toBe('A')
    expect(divisionDe('3-A')).toBe('A')
    expect(divisionDe('10 b')).toBe('B')
    expect(divisionDe('PB-B')).toBe('B')
    expect(divisionDe('4°C')).toBe('C')
  })

  it('una unidad sin letra despues del piso no tiene division', () => {
    expect(divisionDe('C1')).toBeNull()
    expect(divisionDe('Local 2')).toBeNull()
    expect(divisionDe('1-27')).toBeNull()
    expect(divisionDe('Cochera 5')).toBeNull()
  })
})
