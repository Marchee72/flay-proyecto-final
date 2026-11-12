import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { NoEncontrado } from '@/compartido/errores'
import {
  InquilinoSuperpuesto,
  registrarOcupacion,
} from '@/aplicacion/consorcios/registrar-ocupacion'
import { revocarHabilitacion } from '@/aplicacion/identidad/habilitaciones'
import { listarUsuarios } from '@/aplicacion/identidad/listar-usuarios'
import { NoPodesQuitarteElAcceso, quitarAcceso } from '@/aplicacion/identidad/quitar-acceso'
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

  it('revocar y volver a invitar deja el acceso vigente', async () => {
    const existente = await crearUsuario('Eva', 'Existente')
    const habilitacion = await habilitarEnConsorcio(existente.id, consorcioId, 'consorcista')
    await revocarHabilitacion(relojFijo('2026-09-01T12:00:00Z'), habilitacion.id)
    expect(await repositorioHabilitaciones.accesoVigente(existente.id, consorcioId, HOY)).toBeNull()

    const resultado = await invitar(existente.correo)

    expect(resultado.yaTeniaCuenta).toBe(true)
    expect(
      await repositorioHabilitaciones.accesoVigente(existente.id, consorcioId, HOY),
    ).not.toBeNull()
  })

  it('invitar un inquilino a una unidad con inquilino vigente se rechaza con mensaje', async () => {
    await invitar(correoNuevo(), { unidad: { unidadId, tipo: 'inquilino' } })
    const usuarios = await prismaBase.usuario.count()

    await expect(
      invitar(correoNuevo(), { unidad: { unidadId, tipo: 'inquilino' } }),
    ).rejects.toBeInstanceOf(InquilinoSuperpuesto)
    expect(await prismaBase.usuario.count()).toBe(usuarios)
  })
})

describe('quitar acceso y unidades en la nómina', () => {
  const quitar = (usuarioId: string, habilitacionId: string, consorcio = consorcioId) =>
    quitarAcceso(repositorioHabilitaciones, RELOJ, {
      usuarioId,
      consorcioId: consorcio,
      habilitacionId,
    })

  it('quitar el acceso de un consorcista lo deja afuera hoy mismo', async () => {
    const eva = await crearUsuario('Eva', 'Existente')
    const habilitacion = await habilitarEnConsorcio(eva.id, consorcioId, 'consorcista')
    expect(await repositorioHabilitaciones.accesoVigente(eva.id, consorcioId, HOY)).not.toBeNull()

    await quitar(admin, habilitacion.id)

    expect(await repositorioHabilitaciones.accesoVigente(eva.id, consorcioId, HOY)).toBeNull()
  })

  it('una habilitación otorgada hoy se borra al quitarla', async () => {
    const eva = await crearUsuario('Eva', 'Existente')
    const habilitacion = await prismaBase.habilitacion.create({
      data: { usuarioId: eva.id, consorcioId, rol: 'consorcista', vigenciaDesde: HOY },
    })

    await quitar(admin, habilitacion.id)

    expect(await prismaBase.habilitacion.findUnique({ where: { id: habilitacion.id } })).toBeNull()
  })

  it('el administrador no puede quitarse su propio acceso', async () => {
    const propia = await prismaBase.habilitacion.findFirstOrThrow({
      where: { usuarioId: admin, consorcioId, rol: 'administrador' },
    })

    await expect(quitar(admin, propia.id)).rejects.toBeInstanceOf(NoPodesQuitarteElAcceso)
    expect(await repositorioHabilitaciones.accesoVigente(admin, consorcioId, HOY)).not.toBeNull()
  })

  it('quitar una habilitación de otro consorcio es no encontrado', async () => {
    const otro = (await crearConsorcio((await crearAdministradora()).id, 'Ajeno 1')).id
    const eva = await crearUsuario('Eva', 'Existente')
    const ajena = await habilitarEnConsorcio(eva.id, otro, 'consorcista')

    await expect(quitar(admin, ajena.id)).rejects.toBeInstanceOf(NoEncontrado)
    expect(await repositorioHabilitaciones.accesoVigente(eva.id, otro, HOY)).not.toBeNull()
  })

  it('listarUsuarios trae las unidades vigentes de cada persona', async () => {
    const eva = await crearUsuario('Eva', 'Existente')
    await habilitarEnConsorcio(eva.id, consorcioId, 'consorcista')
    await registrarOcupacion(repositorioHabilitaciones, RELOJ, {
      usuarioId: admin,
      consorcioId,
      unidadId,
      personaId: eva.personaId,
      tipo: 'propietario',
      desde: HOY,
    })

    const filas = await listarUsuarios(repositorioHabilitaciones, RELOJ, {
      usuarioId: admin,
      consorcioId,
    })

    const fila = filas.find((f) => f.usuarioId === eva.id)
    expect(fila?.unidades).toEqual([{ designacion: '1A', tipo: 'propietario' }])
    expect(fila?.habilitaciones).toHaveLength(1)
    expect(filas.find((f) => f.usuarioId === admin)?.unidades).toEqual([])
  })

  it('un segundo inquilino superpuesto se rechaza con mensaje', async () => {
    const alta = async (nombre: string) => {
      const u = await crearUsuario(nombre, 'Inquilino')
      return registrarOcupacion(repositorioHabilitaciones, RELOJ, {
        usuarioId: admin,
        consorcioId,
        unidadId,
        personaId: u.personaId,
        tipo: 'inquilino',
        desde: HOY,
      })
    }
    await alta('Uno')

    await expect(alta('Dos')).rejects.toBeInstanceOf(InquilinoSuperpuesto)
  })
})
