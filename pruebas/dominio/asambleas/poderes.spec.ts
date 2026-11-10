import { describe, expect, it } from 'vitest'

import { TopeDePoderes, verificarTope } from '@/dominio/asambleas/poderes'

/** Tope de unidades por apoderado (art. 23 del reglamento, FR-012). */

describe('verificarTope', () => {
  it('deja pasar mientras el apoderado está debajo del tope', () => {
    expect(() => verificarTope(0, 3)).not.toThrow()
    expect(() => verificarTope(2, 3)).not.toThrow()
    expect(() => verificarTope(0, 1)).not.toThrow()
  })

  it('rechaza el poder que lo haría superar el tope', () => {
    expect(() => verificarTope(3, 3)).toThrow(TopeDePoderes)
    expect(() => verificarTope(1, 1)).toThrow(TopeDePoderes)
  })

  it('dice cuál es el tope', () => {
    try {
      verificarTope(3, 3)
      expect.unreachable()
    } catch (error) {
      expect((error as TopeDePoderes).mensajeParaUsuario).toMatch(/3 unidades/)
    }
  })
})
