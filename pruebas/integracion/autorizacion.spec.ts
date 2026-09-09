import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { conAutorizacion } from '@/aplicacion/autorizacion'
import { NoEncontrado, RolInsuficiente } from '@/compartido/errores'
import { consorcioActivo } from '@/infraestructura/cliente-aislado'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../dominio/reloj-fijo'

/**
 * SC-002 y SC-002b: la autorizacion se evalua por par (rol, consorcio) en cada
 * operacion. Sin habilitacion vigente no hay datos, y el mensaje nunca dice que
 * el recurso existe.
 */

const HOY = relojFijo('2026-09-09T12:00:00Z')

let consorcioA: string
let consorcioB: string
let usuario: string

beforeEach(async () => {
  const a = await prismaBase.consorcio.create({
    data: {
      nombre: 'Mitre 456',
      direccion: 'Mitre 456',
      localidad: 'Rosario',
      cuit: `A-${crypto.randomUUID()}`,
    },
  })
  const b = await prismaBase.consorcio.create({
    data: {
      nombre: 'San Luis 900',
      direccion: 'San Luis 900',
      localidad: 'Rosario',
      cuit: `B-${crypto.randomUUID()}`,
    },
  })
  const persona = await prismaBase.persona.create({ data: { nombre: 'Ana', apellido: 'Diaz' } })
  const creado = await prismaBase.usuario.create({
    data: {
      personaId: persona.id,
      correo: `ana-${crypto.randomUUID()}@ejemplo.test`,
      estado: 'activo',
    },
  })

  consorcioA = a.id
  consorcioB = b.id
  usuario = creado.id
})

afterEach(async () => {
  await prismaBase.habilitacion.deleteMany({})
  await prismaBase.usuario.deleteMany({})
  await prismaBase.persona.deleteMany({})
  await prismaBase.consorcio.deleteMany({})
})

const correr = (
  consorcioId: string,
  rolesPermitidos?: readonly ('administrador' | 'consejo' | 'consorcista')[],
) =>
  conAutorizacion(
    repositorioHabilitaciones,
    HOY,
    { usuarioId: usuario, consorcioId, rolesPermitidos, accion: 'esta prueba' },
    async () => consorcioActivo(),
  )

describe('autorizacion por par (rol, consorcio)', () => {
  it('sin habilitacion, no encuentra nada', async () => {
    await expect(correr(consorcioA)).rejects.toBeInstanceOf(NoEncontrado)
  })

  it('con habilitacion sobre otro consorcio, tampoco', async () => {
    await prismaBase.habilitacion.create({
      data: {
        usuarioId: usuario,
        consorcioId: consorcioA,
        rol: 'administrador',
        vigenciaDesde: new Date('2026-01-01'),
      },
    })

    await expect(correr(consorcioB)).rejects.toBeInstanceOf(NoEncontrado)
  })

  it('una habilitacion que vencio ayer equivale a inexistente', async () => {
    await prismaBase.habilitacion.create({
      data: {
        usuarioId: usuario,
        consorcioId: consorcioA,
        rol: 'administrador',
        vigenciaDesde: new Date('2026-01-01'),
        vigenciaHasta: new Date('2026-09-08'),
      },
    })

    await expect(correr(consorcioA)).rejects.toBeInstanceOf(NoEncontrado)
  })

  it('con habilitacion vigente, abre el contexto de aislamiento', async () => {
    await prismaBase.habilitacion.create({
      data: {
        usuarioId: usuario,
        consorcioId: consorcioA,
        rol: 'administrador',
        vigenciaDesde: new Date('2026-01-01'),
      },
    })

    await expect(correr(consorcioA)).resolves.toBe(consorcioA)
  })

  it('el rol que no alcanza es rechazado, aunque la habilitacion sea vigente', async () => {
    await prismaBase.habilitacion.create({
      data: {
        usuarioId: usuario,
        consorcioId: consorcioA,
        rol: 'consorcista',
        vigenciaDesde: new Date('2026-01-01'),
      },
    })

    await expect(correr(consorcioA, ['administrador'])).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('el mensaje de «no encontrado» no revela que el consorcio existe', async () => {
    await expect(correr(consorcioB)).rejects.toThrow('No encontramos lo que buscabas.')
  })
})
