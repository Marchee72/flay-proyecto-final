import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { NoEncontrado } from '@/compartido/errores'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { CorreoInvalido } from '@/aplicacion/identidad/invitar-persona'
import {
  avisoDelLote,
  CorreoEnUso,
  invitarRegistrado,
  invitarRegistrados,
  registradosSinAcceso,
} from '@/aplicacion/identidad/registrados'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'
import { registrarOcupacion } from '@/infraestructura/repositorios/ocupaciones'

import { relojFijo } from '../dominio/reloj-fijo'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnConsorcio,
  limpiar,
} from './ayudas'

/**
 * «Registrados sin acceso» (RF-03): importar registra y no invita; el acceso se
 * da acá, a propósito, una persona por transacción.
 */

const RELOJ = relojFijo('2026-09-09T12:00:00Z')
const repo = repositorioHabilitaciones
const DESDE = new Date('2026-01-01T00:00:00.000Z')

let consorcioId: string
let administrador: string

const unidad = (designacion: string, consorcio = consorcioId) =>
  prismaBase.unidad.findFirstOrThrow({ where: { consorcioId: consorcio, designacion } })

async function ocupa(
  personaId: string,
  designacion: string,
  tipo: 'propietario' | 'inquilino' = 'propietario',
  desde = DESDE,
  hasta: Date | null = null,
  consorcio = consorcioId,
) {
  await registrarOcupacion({
    unidadId: (await unidad(designacion, consorcio)).id,
    personaId,
    tipo,
    desde,
    hasta,
  })
}

const persona = (
  nombre: string,
  apellido: string,
  extra: { documento?: string; correo?: string } = {},
) => prismaBase.persona.create({ data: { nombre, apellido, ...extra } })

const listar = () => registradosSinAcceso(repo, RELOJ, { usuarioId: administrador, consorcioId })

const DATOS = () => ({
  usuarioId: administrador,
  consorcioId,
  consorcioNombre: 'Mitre 456',
  urlBase: 'https://flay.test',
})

const invitar = (personaId: string, correo?: string) =>
  invitarRegistrado(repo, RELOJ, { ...DATOS(), personaId, correo })

const habilitacionVigente = (usuarioId: string) =>
  prismaBase.habilitacion.findFirst({
    where: { usuarioId, consorcioId, rol: 'consorcista', vigenciaHasta: null },
  })

const invitaciones = () => prismaBase.trabajoPendiente.findMany({ where: { tipo: 'invitacion' } })

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id)).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await cargarPadron(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidades: [
      { designacion: '1A', coeficiente: '60.00000000' },
      { designacion: '1B', coeficiente: '40.00000000' },
    ],
  })
})

afterEach(limpiar)

describe('registradosSinAcceso (RF-03)', () => {
  it('lista a quien ocupa una unidad vigente y no tiene habilitación vigente acá', async () => {
    const luis = await persona('Luis', 'Paz', {
      documento: '20123456',
      correo: 'luis@ejemplo.test',
    })
    const eva = await persona('Eva', 'Ruiz')
    const futuro = await persona('Ivo', 'Sosa')
    const pasado = await persona('Leo', 'Vera')
    await ocupa(luis.id, '1A')
    await ocupa(eva.id, '1B', 'inquilino')
    await ocupa(futuro.id, '1A', 'propietario', new Date('2027-01-01T00:00:00.000Z'))
    await ocupa(pasado.id, '1B', 'propietario', DESDE, new Date('2026-03-31T00:00:00.000Z'))

    expect(await listar()).toEqual([
      {
        personaId: luis.id,
        nombre: 'Paz, Luis',
        dni: '20123456',
        correo: 'luis@ejemplo.test',
        unidades: [{ designacion: '1A', tipo: 'propietario' }],
        tieneUsuario: false,
      },
      {
        personaId: eva.id,
        nombre: 'Ruiz, Eva',
        dni: null,
        correo: null,
        unidades: [{ designacion: '1B', tipo: 'inquilino' }],
        tieneUsuario: false,
      },
    ])
  })

  it('incluye a quien tiene usuario en otro consorcio (tieneUsuario: true)', async () => {
    const vecino = await crearUsuario('Beto', 'Gil')
    const otro = (await crearConsorcio((await crearAdministradora('Otra')).id, 'Otro 1')).id
    await habilitarEnConsorcio(vecino.id, otro, 'consorcista')
    await ocupa(vecino.personaId, '1B')

    expect(await listar()).toEqual([
      expect.objectContaining({
        personaId: vecino.personaId,
        correo: vecino.correo,
        tieneUsuario: true,
      }),
    ])
  })

  it('no incluye a quien ya tiene habilitación vigente acá', async () => {
    const habilitado = await crearUsuario('Beto', 'Gil')
    await habilitarEnConsorcio(habilitado.id, consorcioId, 'consorcista')
    await ocupa(habilitado.personaId, '1A')
    // Un acceso quitado no cuenta: vuelve a la lista.
    const revocado = await crearUsuario('Ivo', 'Sosa')
    await prismaBase.habilitacion.create({
      data: {
        usuarioId: revocado.id,
        consorcioId,
        rol: 'consorcista',
        vigenciaDesde: DESDE,
        vigenciaHasta: new Date('2026-06-30T00:00:00.000Z'),
      },
    })
    await ocupa(revocado.personaId, '1B')

    expect((await listar()).map((r) => r.personaId)).toEqual([revocado.personaId])
  })
})

describe('invitarRegistrado (RF-03)', () => {
  it('invitar sin usuario: crea usuario invitado, habilitación consorcista y encola invitación', async () => {
    const luis = await persona('Luis', 'Paz', { correo: 'luis@ejemplo.test' })
    await ocupa(luis.id, '1A')

    expect(await invitar(luis.id)).toEqual({ yaTeniaCuenta: false })

    const usuario = await prismaBase.usuario.findUniqueOrThrow({ where: { personaId: luis.id } })
    expect(usuario).toMatchObject({ correo: 'luis@ejemplo.test', estado: 'invitado' })
    expect(await habilitacionVigente(usuario.id)).toMatchObject({ vigenciaDesde: DESDE })
    const cola = await invitaciones()
    expect(cola.map((t) => (t.carga as { destino: string }).destino)).toEqual(['luis@ejemplo.test'])
    expect(await listar()).toEqual([])
  })

  it('invitar con usuario: solo habilitación, sin correo', async () => {
    const vecino = await crearUsuario('Beto', 'Gil')
    await ocupa(vecino.personaId, '1B')
    const usuarios = await prismaBase.usuario.count()

    expect(await invitar(vecino.personaId)).toEqual({ yaTeniaCuenta: true })

    expect(await habilitacionVigente(vecino.id)).not.toBeNull()
    expect(await invitaciones()).toHaveLength(0)
    expect(await prismaBase.usuario.count()).toBe(usuarios)
  })

  it('invitar sin correo exige correo; lo guarda en la Persona', async () => {
    const eva = await persona('Eva', 'Ruiz')
    await ocupa(eva.id, '1B', 'inquilino')

    const sinCorreo = await invitar(eva.id).catch((e: unknown) => e)
    expect(sinCorreo).toBeInstanceOf(CorreoInvalido)
    expect((sinCorreo as CorreoInvalido).mensajeParaUsuario).toBe('Escribí el correo.')
    await expect(invitar(eva.id, 'eva@')).rejects.toBeInstanceOf(CorreoInvalido)

    await invitar(eva.id, ' Eva@Ejemplo.test ')

    expect(await prismaBase.persona.findUniqueOrThrow({ where: { id: eva.id } })).toMatchObject({
      correo: 'eva@ejemplo.test',
    })
    expect(
      await prismaBase.usuario.findUniqueOrThrow({ where: { personaId: eva.id } }),
    ).toMatchObject({ correo: 'eva@ejemplo.test', estado: 'invitado' })
    expect(await invitaciones()).toHaveLength(1)
  })

  it('correo de otra Persona o de otro Usuario → CorreoEnUso, sin decir de quién', async () => {
    const luis = await persona('Luis', 'Paz', { correo: 'luis@ejemplo.test' })
    const vecino = await crearUsuario('Beto', 'Gil')
    const eva = await persona('Eva', 'Ruiz')
    await ocupa(eva.id, '1B', 'inquilino')

    for (const correo of [luis.correo!, vecino.correo]) {
      const error = await invitar(eva.id, correo).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(CorreoEnUso)
      expect((error as CorreoEnUso).mensajeParaUsuario).toBe(
        'Ese correo ya pertenece a otra persona registrada.',
      )
    }

    expect((await prismaBase.persona.findUniqueOrThrow({ where: { id: eva.id } })).correo).toBe(
      null,
    )
    expect(await prismaBase.usuario.findUnique({ where: { personaId: eva.id } })).toBeNull()
    expect(await invitaciones()).toHaveLength(0)
  })

  it('persona de otro consorcio no se puede invitar desde este (NoEncontrado)', async () => {
    const otro = (await crearConsorcio((await crearAdministradora('Otra')).id, 'Otro 1')).id
    await habilitarEnConsorcio(administrador, otro, 'administrador')
    await cargarPadron(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId: otro,
      unidades: [{ designacion: '7C', coeficiente: '100.00000000' }],
    })
    const ajena = await persona('Ivo', 'Sosa', { correo: 'ivo@ejemplo.test' })
    await ocupa(ajena.id, '7C', 'propietario', DESDE, null, otro)

    await expect(invitar(ajena.id)).rejects.toBeInstanceOf(NoEncontrado)
    expect(await prismaBase.usuario.findUnique({ where: { personaId: ajena.id } })).toBeNull()
  })
})

describe('invitarRegistrados (RF-03)', () => {
  it('invitar a todos: invita solo a los que tienen correo y es reanudable', async () => {
    const luis = await persona('Luis', 'Paz', { correo: 'luis@ejemplo.test' })
    const eva = await persona('Eva', 'Ruiz')
    const vecino = await crearUsuario('Beto', 'Gil')
    await ocupa(luis.id, '1A')
    await ocupa(eva.id, '1B', 'inquilino')
    await ocupa(vecino.personaId, '1B')

    // Sin presupuesto: invita a uno (siempre avanza) y corta.
    expect(await invitarRegistrados(repo, RELOJ, { ...DATOS(), presupuestoMs: 0 })).toEqual({
      invitados: 1,
      quedan: 1,
      fallidos: 0,
    })
    expect(await invitarRegistrados(repo, RELOJ, DATOS())).toEqual({
      invitados: 1,
      quedan: 0,
      fallidos: 0,
    })
    expect(await invitarRegistrados(repo, RELOJ, DATOS())).toEqual({
      invitados: 0,
      quedan: 0,
      fallidos: 0,
    })

    expect((await listar()).map((r) => r.personaId)).toEqual([eva.id])
    expect(await invitaciones()).toHaveLength(1)
  })

  it('quien tiene un correo de otra persona no frena el lote: se cuenta como fallido', async () => {
    const luis = await persona('Luis', 'Paz', { correo: 'luis@ejemplo.test' })
    const vecino = await crearUsuario('Beto', 'Gil')
    // Importada con el correo de una cuenta ajena: invitarla sería fusionar personas.
    const eva = await persona('Eva', 'Ruiz', { correo: vecino.correo })
    await ocupa(luis.id, '1A')
    await ocupa(eva.id, '1B', 'inquilino')

    expect(await invitarRegistrados(repo, RELOJ, DATOS())).toEqual({
      invitados: 1,
      quedan: 0,
      fallidos: 1,
    })
    expect((await listar()).map((r) => r.personaId)).toEqual([eva.id])
    expect(await prismaBase.usuario.findUnique({ where: { personaId: eva.id } })).toBeNull()
  })
})

describe('avisoDelLote (RF-03)', () => {
  it('sin pendientes ni fallidos es un éxito; si no, dice cuántos quedan y cuántos fallaron', () => {
    expect(avisoDelLote({ invitados: 3, quedan: 0, fallidos: 0 })).toBeNull()
    expect(avisoDelLote({ invitados: 3, quedan: 2, fallidos: 0 })).toBe(
      'Invitamos a 3; quedan 2: volvé a apretar para seguir.',
    )
    expect(avisoDelLote({ invitados: 3, quedan: 0, fallidos: 1 })).toBe(
      'Invitamos a 3. 1 no se pudo invitar: su correo ya pertenece a otra persona registrada o no es válido.',
    )
    expect(avisoDelLote({ invitados: 1, quedan: 4, fallidos: 2 })).toBe(
      'Invitamos a 1; quedan 4: volvé a apretar para seguir. 2 no se pudieron invitar: su correo ya pertenece a otra persona registrada o no es válido.',
    )
  })
})
