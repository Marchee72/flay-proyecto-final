import { describe, expect, it } from 'vitest'

import { consorcioDeLaRuta } from '@/app/(panel)/consorcio-activo'
import { destinoSeguro } from '@/compartido/destinos'

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

describe('destinoSeguro (sin redireccion abierta)', () => {
  it('acepta una ruta interna', () => {
    expect(destinoSeguro('/consorcios/x/gastos?periodo=p', '/')).toBe(
      '/consorcios/x/gastos?periodo=p',
    )
  })
  it.each([
    '//evil.test',
    '/\\evil.test',
    'https://evil.test',
    '/ingresar?desde=%2F',
    '/\t/evil.test',
    '',
    null,
    3,
  ])('rechaza %s', (valor) => expect(destinoSeguro(valor, '/')).toBe('/'))
  it('con prefijo, solo dentro del consorcio', () => {
    expect(destinoSeguro('/consorcios/a/expensas/e', '/consorcios/a/pagos', '/consorcios/a/')).toBe(
      '/consorcios/a/expensas/e',
    )
    expect(destinoSeguro('/consorcios/b/expensas/e', '/consorcios/a/pagos', '/consorcios/a/')).toBe(
      '/consorcios/a/pagos',
    )
  })
})
