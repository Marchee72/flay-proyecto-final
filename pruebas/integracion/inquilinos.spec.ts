import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { NoEncontrado } from '@/compartido/errores'
import {
  asignarInquilino,
  FechaDeFinInvalida,
  terminarAlquiler,
  verOcupantes,
} from '@/aplicacion/consorcios/inquilinos'
import {
  InquilinoSuperpuesto,
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

describe('asignar y terminar (RF-03, FR-008b)', () => {
  let duenio: Awaited<ReturnType<typeof crearUsuario>>
  let vecino: Awaited<ReturnType<typeof crearUsuario>>
  let consejo: Awaited<ReturnType<typeof crearUsuario>>
  let consorcioCocherasId: string
  let u1A: string
  let u1B: string
  let u1C: string
  let uC1: string
  let ocupacionPropietario1A: string

  beforeEach(async () => {
    consorcioCocherasId = (await crearConsorcio(administradoraId, 'Cordoba 800')).id
    await habilitarEnConsorcio(administrador, consorcioCocherasId, 'administrador')

    duenio = await crearUsuario('Maria', 'Duenia')
    vecino = await crearUsuario('Pedro', 'Vecino')
    consejo = await crearUsuario('Sofia', 'Consejo')
    await habilitarEnConsorcio(duenio.id, consorcioCocherasId, 'consorcista')
    await habilitarEnConsorcio(vecino.id, consorcioCocherasId, 'consorcista')
    await habilitarEnConsorcio(consejo.id, consorcioCocherasId, 'consejo')

    await cargarPadron(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId: consorcioCocherasId,
      unidades: [
        { designacion: '1A', tipo: 'departamento', coeficiente: '30.00000000' },
        { designacion: '1B', tipo: 'departamento', coeficiente: '30.00000000' },
        { designacion: '1C', tipo: 'departamento', coeficiente: '30.00000000' },
        { designacion: 'C1', tipo: 'cochera', coeficiente: '10.00000000' },
      ],
    })

    const unidades = await prismaBase.unidad.findMany({
      where: { consorcioId: consorcioCocherasId },
    })
    u1A = unidades.find((u) => u.designacion === '1A')!.id
    u1B = unidades.find((u) => u.designacion === '1B')!.id
    u1C = unidades.find((u) => u.designacion === '1C')!.id
    uC1 = unidades.find((u) => u.designacion === 'C1')!.id

    ocupacionPropietario1A = (
      await registrarOcupacion(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId: consorcioCocherasId,
        unidadId: u1A,
        personaId: duenio.personaId,
        tipo: 'propietario',
        desde: d('2025-01-01'),
      })
    ).ocupacionId
    await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId: consorcioCocherasId,
      unidadId: u1B,
      personaId: duenio.personaId,
      tipo: 'propietario',
      desde: d('2025-01-01'),
    })
    await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId: consorcioCocherasId,
      unidadId: uC1,
      personaId: duenio.personaId,
      tipo: 'propietario',
      desde: d('2025-01-01'),
    })
    await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId: consorcioCocherasId,
      unidadId: u1C,
      personaId: vecino.personaId,
      tipo: 'propietario',
      desde: d('2025-01-01'),
    })
  })

  const asignar = (
    datos: Partial<Parameters<typeof asignarInquilino>[2]> & {
      unidadId: string
      correo: string
    },
  ) =>
    asignarInquilino(repo, RELOJ, {
      usuarioId: duenio.id,
      consorcioId: consorcioCocherasId,
      nombre: 'Juan',
      apellido: 'Perez',
      desde: d('2026-09-01'),
      hasta: null,
      urlBase: 'https://flay.test',
      ...datos,
    })

  it('el dueño asigna un inquilino nuevo: persona, usuario invitado, ocupación y acceso', async () => {
    const correo = `nuevo-${crypto.randomUUID()}@ejemplo.test`
    await asignar({ unidadId: u1A, correo })

    const usuario = await prismaBase.usuario.findUniqueOrThrow({ where: { correo } })
    expect(usuario.estado).toBe('invitado')

    const trabajos = await prismaBase.trabajoPendiente.findMany({ where: { tipo: 'invitacion' } })
    expect(trabajos).toHaveLength(1)
    expect(await habilitacion(usuario.id, consorcioCocherasId)).toBeNull()
  })

  it('con fecha de fin, el acceso cierra ese día y al día siguiente ya no está vigente', async () => {
    const correo = `confin-${crypto.randomUUID()}@ejemplo.test`
    await asignar({ unidadId: u1A, correo, desde: d('2026-09-01'), hasta: d('2027-02-28') })

    const usuario = await prismaBase.usuario.findUniqueOrThrow({ where: { correo } })
    expect(await habilitacion(usuario.id, consorcioCocherasId)).toBe('2027-02-28')

    const vista = await verOcupantes(repo, RELOJ, {
      usuarioId: duenio.id,
      consorcioId: consorcioCocherasId,
    })
    const fila1A = vista.unidades.find((u) => u.designacion === '1A')!
    expect(fila1A.inquilinos[0]?.hasta).toBe('2027-02-28')

    // Al día siguiente el acceso ya no es vigente.
    const relojPosterior = relojFijo('2027-03-01T12:00:00Z')
    await expect(
      verOcupantes(repo, relojPosterior, {
        usuarioId: usuario.id,
        consorcioId: consorcioCocherasId,
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)
  })

  it('una cuenta existente se reutiliza sin invitación', async () => {
    const existente = await crearUsuario('Elena', 'Otra')
    await habilitarEnConsorcio(existente.id, consorcioId, 'consorcista')
    const trabajosAntes = await prismaBase.trabajoPendiente.count({ where: { tipo: 'invitacion' } })

    await asignar({
      unidadId: u1A,
      nombre: 'Elena',
      apellido: 'Otra',
      correo: existente.correo,
    })

    const trabajosDespues = await prismaBase.trabajoPendiente.count({
      where: { tipo: 'invitacion' },
    })
    expect(trabajosDespues).toBe(trabajosAntes)
    expect(await habilitacion(existente.id, consorcioCocherasId)).toBeNull()
    const usuariosConCorreo = await prismaBase.usuario.findMany({
      where: { correo: existente.correo },
    })
    expect(usuariosConCorreo).toHaveLength(1)
    expect(usuariosConCorreo[0]!.id).toBe(existente.id)
  })

  it('sobre la unidad del vecino, no encontrado', async () => {
    await expect(
      asignar({ unidadId: u1C, correo: `ajeno-${crypto.randomUUID()}@ejemplo.test` }),
    ).rejects.toBeInstanceOf(NoEncontrado)

    const { ocupacionId } = await asignar({
      usuarioId: vecino.id,
      unidadId: u1C,
      correo: `devecino-${crypto.randomUUID()}@ejemplo.test`,
    })

    await expect(
      terminarAlquiler(repo, RELOJ, {
        usuarioId: duenio.id,
        consorcioId: consorcioCocherasId,
        ocupacionId,
        hasta: d('2026-09-30'),
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)
  })

  it('el dueño no termina una ocupación de propietario', async () => {
    await expect(
      terminarAlquiler(repo, RELOJ, {
        usuarioId: duenio.id,
        consorcioId: consorcioCocherasId,
        ocupacionId: ocupacionPropietario1A,
        hasta: d('2026-09-30'),
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)
  })

  it('terminar cierra el acceso y libera la unidad para el siguiente', async () => {
    const correoA = `a-${crypto.randomUUID()}@ejemplo.test`
    const { ocupacionId } = await asignar({ unidadId: u1A, correo: correoA })
    const usuarioA = await prismaBase.usuario.findUniqueOrThrow({ where: { correo: correoA } })

    await terminarAlquiler(repo, RELOJ, {
      usuarioId: duenio.id,
      consorcioId: consorcioCocherasId,
      ocupacionId,
      hasta: d('2026-09-30'),
    })
    expect(await habilitacion(usuarioA.id, consorcioCocherasId)).toBe('2026-09-30')

    const correoB = `b-${crypto.randomUUID()}@ejemplo.test`
    await asignar({ unidadId: u1A, correo: correoB, desde: d('2026-10-01') })
    const usuarioB = await prismaBase.usuario.findUniqueOrThrow({ where: { correo: correoB } })
    expect(await habilitacion(usuarioB.id, consorcioCocherasId)).toBeNull()
  })

  it('fin anterior al ingreso', async () => {
    await expect(
      asignar({
        unidadId: u1A,
        correo: `mal-${crypto.randomUUID()}@ejemplo.test`,
        desde: d('2026-09-10'),
        hasta: d('2026-09-09'),
      }),
    ).rejects.toMatchObject({
      name: FechaDeFinInvalida.name,
      mensajeParaUsuario: 'La fecha de fin no puede ser anterior al ingreso, el 10/09/2026.',
    })

    const { ocupacionId } = await asignar({
      unidadId: u1A,
      correo: `ok-${crypto.randomUUID()}@ejemplo.test`,
      desde: d('2026-09-10'),
    })

    await expect(
      terminarAlquiler(repo, RELOJ, {
        usuarioId: duenio.id,
        consorcioId: consorcioCocherasId,
        ocupacionId,
        hasta: d('2026-09-09'),
      }),
    ).rejects.toMatchObject({
      name: FechaDeFinInvalida.name,
      mensajeParaUsuario: 'La fecha de fin no puede ser anterior al ingreso, el 10/09/2026.',
    })
  })

  it('correr el fin sobre el siguiente inquilino', async () => {
    const { ocupacionId: idA } = await asignar({
      unidadId: u1A,
      correo: `a-${crypto.randomUUID()}@ejemplo.test`,
      desde: d('2026-09-01'),
      hasta: d('2026-09-30'),
    })
    await asignar({
      unidadId: u1A,
      correo: `b-${crypto.randomUUID()}@ejemplo.test`,
      desde: d('2026-10-01'),
      hasta: null,
    })

    await expect(
      terminarAlquiler(repo, RELOJ, {
        usuarioId: duenio.id,
        consorcioId: consorcioCocherasId,
        ocupacionId: idA,
        hasta: d('2026-10-15'),
      }),
    ).rejects.toBeInstanceOf(InquilinoSuperpuesto)
  })

  it('una cochera se alquila como cualquier unidad', async () => {
    const correo = `doble-${crypto.randomUUID()}@ejemplo.test`
    const { ocupacionId: id1A } = await asignar({ unidadId: u1A, correo })
    const { ocupacionId: idC1 } = await asignar({ unidadId: uC1, correo })
    const usuario = await prismaBase.usuario.findUniqueOrThrow({ where: { correo } })

    await terminarAlquiler(repo, RELOJ, {
      usuarioId: duenio.id,
      consorcioId: consorcioCocherasId,
      ocupacionId: idC1,
      hasta: d('2026-09-30'),
    })
    expect(await habilitacion(usuario.id, consorcioCocherasId)).toBeNull()

    await terminarAlquiler(repo, RELOJ, {
      usuarioId: duenio.id,
      consorcioId: consorcioCocherasId,
      ocupacionId: id1A,
      hasta: d('2026-10-31'),
    })
    expect(await habilitacion(usuario.id, consorcioCocherasId)).toBe('2026-10-31')

    const vista = await verOcupantes(repo, RELOJ, {
      usuarioId: duenio.id,
      consorcioId: consorcioCocherasId,
    })
    expect(vista.unidades.find((u) => u.designacion === 'C1')?.tipo).toBe('cochera')
  })

  it('una cochera alquilada a otra persona', async () => {
    const correo1 = `depto-${crypto.randomUUID()}@ejemplo.test`
    const correo2 = `cochera-${crypto.randomUUID()}@ejemplo.test`
    await asignar({ unidadId: u1A, correo: correo1 })
    await asignar({ unidadId: uC1, correo: correo2 })

    const u1 = await prismaBase.usuario.findUniqueOrThrow({ where: { correo: correo1 } })
    const u2 = await prismaBase.usuario.findUniqueOrThrow({ where: { correo: correo2 } })
    expect(await habilitacion(u1.id, consorcioCocherasId)).toBeNull()
    expect(await habilitacion(u2.id, consorcioCocherasId)).toBeNull()
  })

  it('verOcupantes por rol', async () => {
    const correoInq = `inq-${crypto.randomUUID()}@ejemplo.test`
    await asignar({
      unidadId: u1A,
      correo: correoInq,
      desde: d('2026-09-01'),
      hasta: d('2027-02-28'),
    })
    const uInq = await prismaBase.usuario.findUniqueOrThrow({ where: { correo: correoInq } })

    const vistaAdmin = await verOcupantes(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId: consorcioCocherasId,
    })
    expect(vistaAdmin.gestiona).toBe(true)
    expect(vistaAdmin.unidades.map((u) => u.designacion)).toEqual(['1A', '1B', '1C', 'C1'])

    const vistaDuenio = await verOcupantes(repo, RELOJ, {
      usuarioId: duenio.id,
      consorcioId: consorcioCocherasId,
    })
    expect(vistaDuenio.gestiona).toBe(true)
    expect(vistaDuenio.unidades.map((u) => u.designacion)).toEqual(['1A', '1B', 'C1'])

    const vistaConsejo = await verOcupantes(repo, RELOJ, {
      usuarioId: consejo.id,
      consorcioId: consorcioCocherasId,
    })
    expect(vistaConsejo.gestiona).toBe(false)
    expect(vistaConsejo.unidades.map((u) => u.designacion)).toEqual(['1A', '1B', '1C', 'C1'])

    const vistaInq = await verOcupantes(repo, RELOJ, {
      usuarioId: uInq.id,
      consorcioId: consorcioCocherasId,
    })
    expect(vistaInq.unidades).toEqual([])
    expect(vistaInq.alquilo).toEqual([
      { designacion: '1A', desde: '2026-09-01', hasta: '2027-02-28' },
    ])
  })
})
