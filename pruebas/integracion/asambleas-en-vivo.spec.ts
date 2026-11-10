import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { abrir } from '@/aplicacion/asambleas/conducir'
import { conAviso, permisoDeEscucha } from '@/aplicacion/asambleas/en-vivo'
import { NoEncontrado } from '@/compartido/errores'
import type { AvisoEnVivo } from '@/dominio/contratos/aviso-en-vivo'
import { avisoNulo } from '@/infraestructura/en-vivo/nulo'

import {
  armarEscenario,
  asambleaConvocada,
  enLaReunion,
  repo,
  type Escenario,
} from './asambleas-ayudas'
import { limpiar } from './ayudas'

/** El aviso de la sala en vivo: cuándo se publica y a quién se le deja escuchar. */

const RELOJ = enLaReunion(5)
const PERMISO = { canal: 'asamblea:x', token: 'tok' }

let e: Escenario
let asambleaId: string
let aviso: AvisoEnVivo
let pendientes: Promise<void>[]

const programar = (tarea: () => Promise<void>) => void pendientes.push(tarea())
const de = (usuarioId: string) => ({ usuarioId, consorcioId: e.consorcioId, asambleaId })

beforeEach(async () => {
  e = await armarEscenario()
  asambleaId = await asambleaConvocada(e)
  pendientes = []
  aviso = {
    publicar: vi.fn(async () => {}),
    permisoDeEscucha: vi.fn(async () => PERMISO),
  }
})

afterEach(async () => {
  await limpiar()
})

describe('conAviso', () => {
  it('una acción aceptada publica recién después de terminar', async () => {
    const orden: string[] = []
    vi.mocked(aviso.publicar).mockImplementation(async () => void orden.push('publicar'))
    const valor = await conAviso(aviso, programar, asambleaId, async () => {
      orden.push('trabajo')
      return 'hecho'
    })
    await Promise.all(pendientes)
    expect(valor).toBe('hecho')
    expect(orden).toEqual(['trabajo', 'publicar'])
    expect(aviso.publicar).toHaveBeenCalledWith(asambleaId)
  })

  it('una acción rechazada no publica y su error sigue viaje', async () => {
    const error = new Error('rechazada')
    await expect(
      conAviso(aviso, programar, asambleaId, async () => Promise.reject(error)),
    ).rejects.toBe(error)
    expect(pendientes).toHaveLength(0)
    expect(aviso.publicar).not.toHaveBeenCalled()
  })

  it('si publicar falla, la acción termina bien', async () => {
    vi.mocked(aviso.publicar).mockRejectedValue(new Error('Ably respondió 500'))
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(conAviso(aviso, programar, asambleaId, async () => 'hecho')).resolves.toBe('hecho')
    await expect(Promise.all(pendientes)).resolves.toBeDefined()
    expect(registro).toHaveBeenCalledWith('AVISO_EN_VIVO_FALLO', asambleaId)
    registro.mockRestore()
  })
})

describe('permisoDeEscucha', () => {
  it('quien alcanza la asamblea en curso recibe permiso', async () => {
    await abrir(repo, RELOJ, de(e.consejo))
    expect(await permisoDeEscucha(repo, RELOJ, aviso, de(e.ana))).toEqual(PERMISO)
    expect(aviso.permisoDeEscucha).toHaveBeenCalledWith(asambleaId)
  })

  it('sin servicio no hay permiso', async () => {
    await abrir(repo, RELOJ, de(e.consejo))
    expect(await permisoDeEscucha(repo, RELOJ, avisoNulo, de(e.ana))).toBeNull()
  })

  it('un usuario de otro consorcio no recibe permiso', async () => {
    await abrir(repo, RELOJ, de(e.consejo))
    await expect(permisoDeEscucha(repo, RELOJ, aviso, de(e.ajeno.administrador))).rejects.toThrow()
    await expect(
      permisoDeEscucha(repo, RELOJ, aviso, {
        usuarioId: e.ajeno.administrador,
        consorcioId: e.ajeno.consorcioId,
        asambleaId,
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)
    expect(aviso.permisoDeEscucha).not.toHaveBeenCalled()
  })

  it('una asamblea que no está en curso no da permiso', async () => {
    await expect(permisoDeEscucha(repo, RELOJ, aviso, de(e.ana))).rejects.toBeInstanceOf(
      NoEncontrado,
    )
    expect(aviso.permisoDeEscucha).not.toHaveBeenCalled()
  })
})
