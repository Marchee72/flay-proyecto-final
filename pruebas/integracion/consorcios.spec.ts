import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { RolInsuficiente } from '@/compartido/errores'
import { SumaDeCoeficientesInvalida } from '@/dominio/coeficientes/suma'
import { VigenciaRetroactiva } from '@/dominio/coeficientes/vigencia'
import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import {
  agregarUnidad,
  cambiarCoeficiente,
  cargarPadron,
  PadronYaCargado,
} from '@/aplicacion/consorcios/unidades'
import { verConsorcio } from '@/aplicacion/consorcios/ver-consorcio'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../dominio/reloj-fijo'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnConsorcio,
  limpiar,
} from './ayudas'

/**
 * Los casos de uso de la historia 2. Lo que **la base** impone se prueba en
 * `invariantes-base.spec.ts`, salteandose esta capa; lo de aca es lo otro: que
 * el rechazo llegue con un mensaje que un administrador pueda leer (RNF-10).
 */

const RELOJ = relojFijo('2026-09-09T12:00:00Z')
const repo = repositorioHabilitaciones

const fecha = (dia: string) => new Date(`${dia}T00:00:00Z`)

let consorcioId: string
let administrador: string
let consorcista: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  administrador = (await crearUsuario('Ada')).id
  consorcista = (await crearUsuario('Beto')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(consorcista, consorcioId, 'consorcista')
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Ocupacion"`
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await prismaBase.$executeRaw`DELETE FROM "Unidad"`
  await limpiar()
})

const padron = (unidades: { designacion: string; coeficiente: string }[], quien = administrador) =>
  cargarPadron(repo, RELOJ, { usuarioId: quien, consorcioId, unidades })

const MITADES = [
  { designacion: '1A', coeficiente: '50.00000000' },
  { designacion: '1B', coeficiente: '50.00000000' },
]

describe('carga del padron (regla RN-01)', () => {
  it('carga las unidades y cada una nace con su fila de historia (regla RN-02)', async () => {
    await padron(MITADES)

    const vista = await verConsorcio(repo, RELOJ, { usuarioId: administrador, consorcioId })
    expect(vista.suma).toBe('100.00000000')
    expect(vista.cuadra).toBe(true)
    expect(vista.unidades.map((u) => u.coeficiente)).toEqual(['50.00000000', '50.00000000'])

    expect(await prismaBase.coeficienteHistorico.count()).toBe(2)
  })

  it('un cienmillonesimo de menos se rechaza nombrando la diferencia (SC-004)', async () => {
    const casi = [
      { designacion: '1A', coeficiente: '50.00000000' },
      { designacion: '1B', coeficiente: '49.99999999' },
    ]

    await expect(padron(casi)).rejects.toBeInstanceOf(SumaDeCoeficientesInvalida)
    await expect(padron(casi)).rejects.toThrow(/falta 0\.00000001/)

    // Nada quedo a medio escribir.
    expect(await prismaBase.unidad.count()).toBe(0)
  })

  it('un consorcista no puede cargar el padron (SC-002b)', async () => {
    await expect(padron(MITADES, consorcista)).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('el padron se carga una sola vez', async () => {
    await padron(MITADES)
    await expect(padron(MITADES)).rejects.toBeInstanceOf(PadronYaCargado)
  })
})

describe('agregar una unidad (FR-011c)', () => {
  it('exige reajustar las demas en la misma operacion', async () => {
    await padron(MITADES)

    const { unidades } = await verConsorcio(repo, RELOJ, { usuarioId: administrador, consorcioId })
    const [a, b] = unidades

    // Sin ajustes la suma quedaria en 133.33333333: se rechaza antes de escribir.
    await expect(
      agregarUnidad(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        designacion: '1C',
        coeficiente: '33.33333333',
      }),
    ).rejects.toBeInstanceOf(SumaDeCoeficientesInvalida)

    await agregarUnidad(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      designacion: '1C',
      coeficiente: '33.33333334',
      ajustes: [
        { unidadId: a.id, coeficiente: '33.33333333' },
        { unidadId: b.id, coeficiente: '33.33333333' },
      ],
    })

    const vista = await verConsorcio(repo, RELOJ, { usuarioId: administrador, consorcioId })
    expect(vista.suma).toBe('100.00000000')
    expect(vista.unidades).toHaveLength(3)
  })
})

describe('cambio de coeficiente (regla RN-02, FR-012)', () => {
  it('hacia el futuro: cierra la vigencia anterior y no toca el coeficiente de hoy', async () => {
    await padron(MITADES)
    const { unidades } = await verConsorcio(repo, RELOJ, { usuarioId: administrador, consorcioId })
    const [a, b] = unidades

    await cambiarCoeficiente(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: a.id,
      coeficiente: '60.00000000',
      vigenciaDesde: fecha('2026-10-01'),
      ajustes: [{ unidadId: b.id, coeficiente: '40.00000000' }],
    })

    const vigente = await verConsorcio(repo, RELOJ, { usuarioId: administrador, consorcioId })
    expect(vigente.unidades.map((u) => u.coeficiente)).toEqual(['50.00000000', '50.00000000'])

    const historia = await prismaBase.coeficienteHistorico.findMany({
      where: { unidadId: a.id },
      orderBy: { vigenciaDesde: 'asc' },
    })

    expect(historia).toHaveLength(2)
    expect(historia[0].vigenciaHasta?.toISOString().slice(0, 10)).toBe('2026-09-30')
    expect(historia[1].coeficiente.toFixed(8)).toBe('60.00000000')
  })

  it('hacia atras se rechaza (FR-012)', async () => {
    await padron(MITADES)
    const { unidades } = await verConsorcio(repo, RELOJ, { usuarioId: administrador, consorcioId })

    await expect(
      cambiarCoeficiente(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        unidadId: unidades[0].id,
        coeficiente: '60.00000000',
        vigenciaDesde: fecha('2026-09-01'),
        ajustes: [{ unidadId: unidades[1].id, coeficiente: '40.00000000' }],
      }),
    ).rejects.toBeInstanceOf(VigenciaRetroactiva)
  })
})

describe('ocupaciones (FR-008b, FR-008c)', () => {
  it('el administrador registra al propietario y la persona queda habilitada', async () => {
    await padron(MITADES)
    const { unidades } = await verConsorcio(repo, RELOJ, { usuarioId: administrador, consorcioId })

    const duenio = await crearUsuario('Cora')

    await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: unidades[0].id,
      personaId: duenio.personaId,
      tipo: 'propietario',
      desde: fecha('2026-01-01'),
    })

    const habilitacion = await prismaBase.habilitacion.findFirst({
      where: { usuarioId: duenio.id, consorcioId, rol: 'consorcista' },
    })

    expect(habilitacion).not.toBeNull()
  })

  /**
   * La cochera de un tercero: quien la posee **no tiene departamento** en el
   * edificio y aun asi es consorcista, porque paga expensas por su coeficiente
   * como cualquier otra unidad funcional (punto 7 § Unidad).
   */
  it('una cochera puede tener dueño propio, sin departamento en el edificio', async () => {
    await cargarPadron(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidades: [
        { designacion: '1A', coeficiente: '60.00000000', tipo: 'departamento' },
        { designacion: '1B', coeficiente: '38.00000000', tipo: 'departamento' },
        { designacion: 'Cochera 1', coeficiente: '2.00000000', tipo: 'cochera' },
      ],
    })

    const { unidades } = await verConsorcio(repo, RELOJ, { usuarioId: administrador, consorcioId })
    const cochera = unidades.find((unidad) => unidad.designacion === 'Cochera 1')
    expect(cochera?.tipo).toBe('cochera')

    const duenioDeLaCochera = await crearUsuario('Nadia')

    await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: cochera!.id,
      personaId: duenioDeLaCochera.personaId,
      tipo: 'propietario',
      desde: fecha('2026-01-01'),
    })

    // Es consorcista del edificio sin ocupar ninguna otra unidad.
    const habilitacion = await prismaBase.habilitacion.findFirst({
      where: { usuarioId: duenioDeLaCochera.id, consorcioId, rol: 'consorcista' },
    })
    expect(habilitacion).not.toBeNull()

    const suyas = await prismaBase.$queryRaw<{ unidad_id: string }[]>`
      SELECT unidad_id FROM "Ocupacion" WHERE persona_id = ${duenioDeLaCochera.personaId}::uuid`
    expect(suyas).toEqual([{ unidad_id: cochera!.id }])
  })

  it('un consorcista que no es propietario de la unidad no la encuentra (FR-008b)', async () => {
    await padron(MITADES)
    const { unidades } = await verConsorcio(repo, RELOJ, { usuarioId: administrador, consorcioId })
    const inquilino = await prismaBase.persona.create({ data: { nombre: 'Dan', apellido: 'Paz' } })

    await expect(
      registrarOcupacion(repo, RELOJ, {
        usuarioId: consorcista,
        consorcioId,
        unidadId: unidades[0].id,
        personaId: inquilino.id,
        tipo: 'inquilino',
        desde: fecha('2026-01-01'),
      }),
    ).rejects.toThrow('No encontramos lo que buscabas.')
  })
})
