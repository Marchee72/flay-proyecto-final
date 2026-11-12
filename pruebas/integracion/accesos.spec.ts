import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { NoEncontrado } from '@/compartido/errores'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import {
  CorreoInvalido,
  invitarPersona,
  YaTieneAcceso,
} from '@/aplicacion/identidad/invitar-persona'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'
import { ocupantesVigentes } from '@/infraestructura/repositorios/ocupaciones'

import { relojFijo } from '../dominio/reloj-fijo'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnConsorcio,
  limpiar,
} from './ayudas'

/** RF-03: invitar con unidad (C2), correo mal formado (A2) y quien ya tiene cuenta (A3). */

const RELOJ = relojFijo('2026-09-09T12:00:00Z')
const HOY = new Date('2026-09-09')

let admin: string
let consorcioId: string
let unidadId: string

const padron = (usuarioId: string, consorcio: string) =>
  cargarPadron(repositorioHabilitaciones, RELOJ, {
    usuarioId,
    consorcioId: consorcio,
    unidades: [{ designacion: '1A', coeficiente: '100.00000000' }],
  })

const invitar = (correo: string, extra: Record<string, unknown> = {}) =>
  invitarPersona(repositorioHabilitaciones, RELOJ, {
    invitadorId: admin,
    nombre: 'Franco',
    apellido: 'Ferrero',
    correo,
    rol: 'consorcista',
    consorcioId,
    consorcioNombre: 'Mitre 456',
    vigenciaDesde: HOY,
    urlBase: 'https://flay.test',
    ...extra,
  })

beforeEach(async () => {
  await limpiar()
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  admin = (await crearUsuario('Ada', 'Admin')).id
  await habilitarEnConsorcio(admin, consorcioId, 'administrador')
  await padron(admin, consorcioId)
  unidadId = (await prismaBase.unidad.findFirstOrThrow({ where: { consorcioId } })).id
})

afterEach(async () => {
  await prismaBase.trabajoPendiente.deleteMany({})
  await limpiar()
})

const correoNuevo = () => `nuevo-${crypto.randomUUID()}@ejemplo.test`

describe('invitar con unidad', () => {
  it('invitar con unidad deja la ocupación vigente desde la vigencia', async () => {
    const correo = correoNuevo()
    const { usuarioId } = await invitar(correo, { unidad: { unidadId, tipo: 'propietario' } })

    const usuario = await prismaBase.usuario.findUniqueOrThrow({ where: { id: usuarioId } })
    expect(await ocupantesVigentes(unidadId, 'propietario', HOY)).toContain(usuario.personaId)
  })

  it('invitar un correo mal formado no crea nada', async () => {
    const antes = await prismaBase.usuario.count()
    await expect(invitar('sin-arroba')).rejects.toBeInstanceOf(CorreoInvalido)
    expect(await prismaBase.usuario.count()).toBe(antes)
  })

  it('invitar a quien ya tiene cuenta en otro consorcio le suma el acceso sin crear usuario ni correo', async () => {
    const existente = await crearUsuario('Eva', 'Existente')
    const correo = existente.correo
    const antes = await prismaBase.usuario.count()

    const resultado = await invitar(correo, { unidad: { unidadId, tipo: 'inquilino' } })

    expect(resultado).toEqual({ usuarioId: existente.id, yaTeniaCuenta: true })
    expect(await prismaBase.usuario.count()).toBe(antes)
    expect(
      await repositorioHabilitaciones.accesoVigente(existente.id, consorcioId, HOY),
    ).not.toBeNull()
    expect(await ocupantesVigentes(unidadId, 'inquilino', HOY)).toContain(existente.personaId)
    expect(
      await prismaBase.trabajoPendiente.count({
        where: { tipo: 'invitacion', carga: { path: ['destino'], equals: correo } },
      }),
    ).toBe(0)
  })

  it('invitar de nuevo con el mismo rol avisa', async () => {
    const correo = correoNuevo()
    await invitar(correo)
    await expect(invitar(correo)).rejects.toBeInstanceOf(YaTieneAcceso)
  })

  it('una persona cargada sin usuario se reutiliza', async () => {
    const correo = correoNuevo()
    await prismaBase.persona.create({ data: { nombre: 'Dora', apellido: 'Diaz', correo } })

    await invitar(correo)

    expect(await prismaBase.persona.count({ where: { correo } })).toBe(1)
  })

  it('la unidad de otro consorcio no se acepta', async () => {
    const otro = (await crearConsorcio((await crearAdministradora()).id, 'Ajeno 1')).id
    const otroAdmin = (await crearUsuario('Otto', 'Otro')).id
    await habilitarEnConsorcio(otroAdmin, otro, 'administrador')
    await padron(otroAdmin, otro)
    const ajena = await prismaBase.unidad.findFirstOrThrow({ where: { consorcioId: otro } })

    await expect(
      invitar(correoNuevo(), { unidad: { unidadId: ajena.id, tipo: 'propietario' } }),
    ).rejects.toBeInstanceOf(NoEncontrado)
  })
})
