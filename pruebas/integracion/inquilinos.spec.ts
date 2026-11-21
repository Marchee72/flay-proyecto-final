import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  registrarOcupacion,
  sincronizarHabilitacion,
} from '@/aplicacion/consorcios/registrar-ocupacion'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'
import {
  registrarOcupacion as insertarOcupacion,
  terminarOcupacion,
} from '@/infraestructura/repositorios/ocupaciones'

import { relojFijo } from '../dominio/reloj-fijo'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnConsorcio,
  limpiar,
} from './ayudas'

const RELOJ = relojFijo('2026-09-09T12:00:00Z')
const repo = repositorioHabilitaciones
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

let consorcioId: string
let administradoraId: string
let administrador: string
let unidad1A: string
let unidad1B: string
let unidad1C: string

async function habilitacion(usuarioId: string, consorcio = consorcioId): Promise<string | null> {
  const fila = await prismaBase.habilitacion.findUnique({
    where: {
      usuarioId_consorcioId_rol: { usuarioId, consorcioId: consorcio, rol: 'consorcista' },
    },
  })
  if (!fila) throw new Error(`Sin habilitacion consorcista para ${usuarioId}`)
  return fila.vigenciaHasta?.toISOString().slice(0, 10) ?? null
}

beforeEach(async () => {
  const administradora = await crearAdministradora()
  administradoraId = administradora.id
  consorcioId = (await crearConsorcio(administradoraId, 'Mitre 456')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')

  await cargarPadron(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidades: [
      { designacion: '1A', coeficiente: '34.00000000' },
      { designacion: '1B', coeficiente: '33.00000000' },
      { designacion: '1C', coeficiente: '33.00000000' },
    ],
  })

  const unidades = await prismaBase.unidad.findMany({
    where: { consorcioId },
    orderBy: { designacion: 'asc' },
  })
  unidad1A = unidades[0]!.id
  unidad1B = unidades[1]!.id
  unidad1C = unidades[2]!.id
})

afterEach(async () => {
  await limpiar()
})

describe('acceso (RN-24)', () => {
  it('terminar la única ocupación cierra el acceso el último día', async () => {
    const u = await crearUsuario('Juan', 'Perez')
    const { ocupacionId } = await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: unidad1A,
      personaId: u.personaId,
      tipo: 'inquilino',
      desde: d('2026-01-01'),
    })

    await terminarOcupacion(ocupacionId, d('2026-09-30'))
    await sincronizarHabilitacion(u.personaId, consorcioId)

    expect(await habilitacion(u.id)).toBe('2026-09-30')
  })

  it('con otra ocupación abierta, el acceso sigue abierto', async () => {
    const u = await crearUsuario('Juan', 'Perez')
    const { ocupacionId } = await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: unidad1A,
      personaId: u.personaId,
      tipo: 'inquilino',
      desde: d('2026-01-01'),
    })
    await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: unidad1B,
      personaId: u.personaId,
      tipo: 'propietario',
      desde: d('2025-01-01'),
    })

    await terminarOcupacion(ocupacionId, d('2026-09-30'))
    await sincronizarHabilitacion(u.personaId, consorcioId)

    expect(await habilitacion(u.id)).toBeNull()
  })

  it('no toca la habilitación de administrador ni de consejo', async () => {
    const u = await crearUsuario('Clara', 'Admin')
    await habilitarEnConsorcio(u.id, consorcioId, 'administrador')
    await habilitarEnConsorcio(u.id, consorcioId, 'consejo')
    const { ocupacionId } = await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: unidad1A,
      personaId: u.personaId,
      tipo: 'inquilino',
      desde: d('2026-01-01'),
    })

    await terminarOcupacion(ocupacionId, d('2026-09-30'))
    await sincronizarHabilitacion(u.personaId, consorcioId)

    expect(await habilitacion(u.id)).toBe('2026-09-30')
    const habAdmin = await prismaBase.habilitacion.findUniqueOrThrow({
      where: {
        usuarioId_consorcioId_rol: { usuarioId: u.id, consorcioId, rol: 'administrador' },
      },
    })
    const habConsejo = await prismaBase.habilitacion.findUniqueOrThrow({
      where: {
        usuarioId_consorcioId_rol: { usuarioId: u.id, consorcioId, rol: 'consejo' },
      },
    })
    expect(habAdmin.vigenciaHasta).toBeNull()
    expect(habConsejo.vigenciaHasta).toBeNull()
  })

  it('reabre el acceso de quien vuelve', async () => {
    const u = await crearUsuario('Lucas', 'Vuelve')
    await prismaBase.habilitacion.create({
      data: {
        usuarioId: u.id,
        consorcioId,
        rol: 'consorcista',
        vigenciaDesde: d('2025-01-01'),
        vigenciaHasta: d('2026-05-31'),
      },
    })

    await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: unidad1C,
      personaId: u.personaId,
      tipo: 'inquilino',
      desde: d('2026-09-01'),
    })

    expect(await habilitacion(u.id)).toBeNull()
  })

  it('una persona sin usuario no crea habilitación', async () => {
    const persona = await prismaBase.persona.create({
      data: { nombre: 'Sin', apellido: 'Cuenta' },
    })
    const antes = await prismaBase.habilitacion.count()

    await insertarOcupacion({
      unidadId: unidad1A,
      personaId: persona.id,
      tipo: 'inquilino',
      desde: d('2026-01-01'),
      hasta: null,
    })
    await sincronizarHabilitacion(persona.id, consorcioId)

    expect(await prismaBase.habilitacion.count()).toBe(antes)
  })
})
