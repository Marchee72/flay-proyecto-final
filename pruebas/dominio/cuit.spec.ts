import { describe, expect, it } from 'vitest'

import { normalizarCuit } from '@/dominio/proveedores/cuit'

describe('normalizarCuit (RF-05)', () => {
  it('lleva cualquier forma de tipearlo a NN-NNNNNNNN-N', () => {
    expect(normalizarCuit('20123456789')).toBe('20-12345678-9')
    expect(normalizarCuit('20-12345678-9')).toBe('20-12345678-9')
    expect(normalizarCuit(' 20 12345678 9 ')).toBe('20-12345678-9')
    expect(normalizarCuit('20.12345678/9')).toBe('20-12345678-9')
  })

  it('sin 11 digitos no es un CUIT', () => {
    expect(normalizarCuit('')).toBeNull()
    expect(normalizarCuit('2012345678')).toBeNull()
    expect(normalizarCuit('201234567890')).toBeNull()
    expect(normalizarCuit('no-es-cuit')).toBeNull()
  })
})
