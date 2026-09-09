import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { altaConsorcio } from '@/aplicacion/consorcios/alta-consorcio'
import { RolInsuficiente } from '@/compartido/errores'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../dominio/reloj-fijo'

/**
 * FR-007b: el alta de consorcio la autoriza el administrador de cartera, no un
 * administrador de consorcio. Es la unica operacion que trabaja por encima del
 * aislamiento, asi que el rol tiene que ser escaso y verificado.
 */

const RELOJ = relojFijo('2026-09-09T12:00:00Z')

async function crearUsuario() {
  const persona = await prismaBase.persona.create({ data: { nombre: 'Ana', apellido: 'Diaz' } })
  return prismaBase.usuario.create({
    data: {
      personaId: persona.id,
      correo: `u-${crypto.randomUUID()}@ejemplo.test`,
      estado: 'activo',
    },
  })
}

const datosDe = (usuarioId: string) => ({
  usuarioId,
  nombre: 'Mitre 456',
  direccion: 'Mitre 456',
  localidad: 'Rosario',
  cuit: `30-${Math.floor(Math.random() * 100_000_000)}-0`,
})

let cartera: string
let comun: string

beforeEach(async () => {
  const conCartera = await crearUsuario()
  await prismaBase.habilitacionCartera.create({
    data: { usuarioId: conCartera.id, vigenciaDesde: new Date('2026-01-01') },
  })
  cartera = conCartera.id
  comun = (await crearUsuario()).id
})

afterEach(async () => {
  await prismaBase.habilitacionCartera.deleteMany({})
  await prismaBase.habilitacion.deleteMany({})
  await prismaBase.usuario.deleteMany({})
  await prismaBase.persona.deleteMany({})
  await prismaBase.consorcio.deleteMany({})
})

describe('alta de consorcio', () => {
  it('el administrador de cartera lo crea y queda habilitado sobre el', async () => {
    const { consorcioId } = await altaConsorcio(repositorioHabilitaciones, RELOJ, datosDe(cartera))

    const habilitacion = await prismaBase.habilitacion.findFirstOrThrow({
      where: { usuarioId: cartera, consorcioId },
    })
    expect(habilitacion.rol).toBe('administrador')
  })

  it('un usuario sin habilitacion de cartera no puede, aunque administre otro consorcio', async () => {
    const { consorcioId } = await altaConsorcio(repositorioHabilitaciones, RELOJ, datosDe(cartera))
    await prismaBase.habilitacion.create({
      data: {
        usuarioId: comun,
        consorcioId,
        rol: 'administrador',
        vigenciaDesde: new Date('2026-01-01'),
      },
    })

    await expect(
      altaConsorcio(repositorioHabilitaciones, RELOJ, datosDe(comun)),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('una habilitacion de cartera vencida ayer ya no alcanza', async () => {
    await prismaBase.habilitacionCartera.updateMany({
      where: { usuarioId: cartera },
      data: { vigenciaHasta: new Date('2026-09-08') },
    })

    await expect(
      altaConsorcio(repositorioHabilitaciones, RELOJ, datosDe(cartera)),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('rechaza un CUIT repetido con mensaje para el usuario final', async () => {
    const datos = datosDe(cartera)
    await altaConsorcio(repositorioHabilitaciones, RELOJ, datos)

    await expect(altaConsorcio(repositorioHabilitaciones, RELOJ, datos)).rejects.toThrow(
      'Ya hay un consorcio con ese CUIT.',
    )
  })
})
