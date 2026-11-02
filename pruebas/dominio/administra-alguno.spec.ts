import { describe, expect, it } from 'vitest'

import { administraAlguno } from '@/aplicacion/consorcios/administra-alguno'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Rol } from '@/dominio/identidad/rol'

import { relojFijo } from './reloj-fijo'

const reloj = relojFijo('2026-11-02T12:00:00Z')

/** Un repositorio falso: cada consorcio con los roles que el usuario tiene en el. */
function repositorio(roles: Record<string, Rol[]>): RepositorioHabilitaciones {
  return {
    consorciosDe: async () => Object.keys(roles),
    accesoVigente: async (usuarioId, consorcioId) => ({
      usuarioId,
      consorcioId,
      roles: roles[consorcioId] ?? [],
      origen: 'consorcio',
    }),
    esSuperAdministrador: async () => false,
    administradorasDe: async () => [],
  }
}

describe('administraAlguno (RNF-03)', () => {
  it('basta con que administre uno, aunque no sea el primero', async () => {
    const repo = repositorio({ a: ['consorcista'], b: ['administrador'] })
    expect(await administraAlguno(repo, reloj, 'u')).toBe(true)
  })
  it('el consorcista solo no administra nada', async () => {
    const repo = repositorio({ a: ['consorcista', 'consejo'] })
    expect(await administraAlguno(repo, reloj, 'u')).toBe(false)
  })
  it('sin consorcios, tampoco', async () => {
    expect(await administraAlguno(repositorio({}), reloj, 'u')).toBe(false)
  })
})
