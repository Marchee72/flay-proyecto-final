import { describe, expect, it } from 'vitest'

import { destinoSeguro } from '@/compartido/destinos'

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
