import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { altaAdministradora } from '@/aplicacion/administradoras/alta-administradora'
import { altaConsorcio } from '@/aplicacion/consorcios/alta-consorcio'
import { RolInsuficiente } from '@/compartido/errores'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../dominio/reloj-fijo'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnAdministradora,
  habilitarEnConsorcio,
  habilitarEnPlataforma,
  limpiar,
} from './ayudas'

/**
 * SC-002c: el alta de administradoras y de consorcios es de plataforma. Son las
 * dos operaciones que trabajan por encima del aislamiento, asi que el rol tiene
 * que ser escaso y verificado.
 */

const RELOJ = relojFijo('2026-09-09T12:00:00Z')

let superAdmin: string
let comun: string
let delta: string

beforeEach(async () => {
  superAdmin = (await crearUsuario('Lautaro')).id
  await habilitarEnPlataforma(superAdmin)
  comun = (await crearUsuario('Otro')).id
  delta = (await crearAdministradora()).id
})

afterEach(limpiar)

const datosConsorcio = (usuarioId: string, administradoraId: string) => ({
  usuarioId,
  administradoraId,
  nombre: 'Mitre 456',
  direccion: 'Mitre 456',
  localidad: 'Rosario',
  cuit: `30-${crypto.randomUUID().slice(0, 8)}-0`,
})

describe('alta de administradora', () => {
  it('la crea el super administrador', async () => {
    const { administradoraId } = await altaAdministradora(repositorioHabilitaciones, RELOJ, {
      usuarioId: superAdmin,
      razonSocial: 'Nueva Administradora',
      cuit: `30-${crypto.randomUUID().slice(0, 8)}-1`,
    })

    const creada = await prismaBase.administradora.findUniqueOrThrow({
      where: { id: administradoraId },
    })
    expect(creada.razonSocial).toBe('Nueva Administradora')
  })

  it('no la puede crear alguien con habilitacion de empresa', async () => {
    await habilitarEnAdministradora(comun, delta)

    await expect(
      altaAdministradora(repositorioHabilitaciones, RELOJ, {
        usuarioId: comun,
        razonSocial: 'Intento',
        cuit: `30-${crypto.randomUUID().slice(0, 8)}-2`,
      }),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })
})

describe('alta de consorcio', () => {
  it('el super administrador lo crea y queda habilitado sobre el', async () => {
    const { consorcioId } = await altaConsorcio(
      repositorioHabilitaciones,
      RELOJ,
      datosConsorcio(superAdmin, delta),
    )

    const habilitacion = await prismaBase.habilitacion.findFirstOrThrow({
      where: { usuarioId: superAdmin, consorcioId },
    })
    expect(habilitacion.rol).toBe('administrador')

    const consorcio = await prismaBase.consorcio.findUniqueOrThrow({ where: { id: consorcioId } })
    expect(consorcio.administradoraId).toBe(delta)
  })

  it('un administrador de otro consorcio no puede', async () => {
    const otro = await crearConsorcio(delta, 'San Luis 900')
    await habilitarEnConsorcio(comun, otro.id, 'administrador')

    await expect(
      altaConsorcio(repositorioHabilitaciones, RELOJ, datosConsorcio(comun, delta)),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('una habilitacion de plataforma vencida ayer ya no alcanza', async () => {
    await prismaBase.habilitacionPlataforma.updateMany({
      where: { usuarioId: superAdmin },
      data: { vigenciaHasta: new Date('2026-09-08') },
    })

    await expect(
      altaConsorcio(repositorioHabilitaciones, RELOJ, datosConsorcio(superAdmin, delta)),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('rechaza un CUIT repetido con mensaje para el usuario final', async () => {
    const datos = datosConsorcio(superAdmin, delta)
    await altaConsorcio(repositorioHabilitaciones, RELOJ, datos)

    await expect(altaConsorcio(repositorioHabilitaciones, RELOJ, datos)).rejects.toThrow(
      'Ya hay un consorcio con ese CUIT.',
    )
  })
})
