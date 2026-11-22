import { describe, expect, it } from 'vitest'

import { eligeAlEntrar } from '@/app/(panel)/consorcio-activo'

/** RF-03: con unidades en dos o mas edificios se elige al entrar; la condicion es por unidades. */
describe('eligeAlEntrar', () => {
  it('dos edificios con unidades: elige', () =>
    expect(
      eligeAlEntrar(
        new Map([
          ['a', ['3B']],
          ['b', ['1A']],
        ]),
      ),
    ).toBe(true))

  it('varias unidades en un solo edificio: no elige', () =>
    expect(eligeAlEntrar(new Map([['a', ['3B', '3C', 'Cochera 12']]]))).toBe(false))

  it('sin unidades: no elige', () => expect(eligeAlEntrar(new Map())).toBe(false))

  it('una clave vacia no cuenta', () =>
    expect(
      eligeAlEntrar(
        new Map([
          ['a', ['3B']],
          ['b', []],
        ]),
      ),
    ).toBe(false))
})
