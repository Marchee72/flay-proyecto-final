import { describe, expect, it } from 'vitest'

import { consorcioDeLaRuta } from '@/app/(panel)/consorcio-activo'

describe('consorcioDeLaRuta', () => {
  const id = '0b5c3a52-6a3e-4e0e-9c1a-2f0c4a1d7e11'
  it('lo saca del resumen y de una sección', () => {
    expect(consorcioDeLaRuta(`/consorcios/${id}`)).toBe(id)
    expect(consorcioDeLaRuta(`/consorcios/${id}/gastos/abc`)).toBe(id)
  })
  it('nada fuera de un consorcio ni con un id que no es uuid', () => {
    expect(consorcioDeLaRuta('/consorcios')).toBeNull()
    expect(consorcioDeLaRuta('/consorcios/nuevo')).toBeNull()
    expect(consorcioDeLaRuta('/bandeja')).toBeNull()
  })
})
