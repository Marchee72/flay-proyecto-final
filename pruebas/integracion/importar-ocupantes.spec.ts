import ExcelJS from 'exceljs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { importarOcupantes } from '@/aplicacion/importacion/importar-ocupantes'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'
import {
  registrarOcupacion,
  registrarOcupaciones,
} from '@/infraestructura/repositorios/ocupaciones'
import {
  comoInquilinoSuperpuesto,
  InquilinoSuperpuesto,
} from '@/aplicacion/consorcios/registrar-ocupacion'

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
const ENCABEZADOS = ['Unidad', 'Vínculo', 'Nombre', 'Apellido', 'DNI', 'Correo', 'Desde', 'Hasta']

let consorcioId: string
let administrador: string

async function xlsx(filas: string[][]): Promise<Uint8Array> {
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet('Ocupantes')
  hoja.addRow(ENCABEZADOS)
  for (const fila of filas) hoja.addRow(fila)
  return new Uint8Array(await libro.xlsx.writeBuffer())
}

const importar = (bytes: Uint8Array, confirmar: boolean, consorcio = consorcioId) =>
  importarOcupantes(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId: consorcio,
    bytes,
    nombreArchivo: 'ocupantes.xlsx',
    confirmar,
  })

const ocupaciones = () =>
  prismaBase.$queryRaw<
    {
      designacion: string
      tipo: string
      documento: string | null
      desde: Date
      hasta: Date | null
    }[]
  >`SELECT un.designacion, o.tipo::text AS tipo, p.documento,
           lower(o.vigencia) AS desde, upper(o.vigencia) AS hasta
    FROM "Ocupacion" o JOIN "Unidad" un ON un.id = o.unidad_id JOIN "Persona" p ON p.id = o.persona_id
    ORDER BY un.designacion, o.tipo`

const unidad = (designacion: string) =>
  prismaBase.unidad.findFirstOrThrow({ where: { consorcioId, designacion } })

const ARCHIVO = () =>
  xlsx([
    ['1A', 'propietario', 'Luis', 'Paz', '20123456', 'luis@ejemplo.test', '', ''],
    ['1A', 'inquilino', 'Eva', 'Ruiz', '27999888', '', '2026-10-01', '30/09/2027'],
  ])

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

describe('importarOcupantes (RF-03)', () => {
  it('revisar no escribe; confirmar crea personas y ocupaciones con sus fechas', async () => {
    const bytes = await ARCHIVO()
    const revisado = await importar(bytes, false)
    expect(revisado.estado).toBe('revisado')
    expect(await ocupaciones()).toHaveLength(0)

    const r = await importar(bytes, true)
    expect(r).toEqual({
      estado: 'cargado',
      resumen: { propietarios: 1, inquilinos: 1, yaEstaban: 0, sinIdentificar: 0 },
    })
    const filas = await ocupaciones()
    expect(
      filas.map((f) => [
        f.designacion,
        f.tipo,
        f.documento,
        f.desde.toISOString().slice(0, 10),
        f.hasta?.toISOString().slice(0, 10) ?? null,
      ]),
    ).toEqual([
      ['1A', 'propietario', '20123456', '2026-09-09', null],
      // `hasta` inclusivo 30/09/2027 se guarda semiabierto [desde, 2027-10-01).
      ['1A', 'inquilino', '27999888', '2026-10-01', '2027-10-01'],
    ])
  })

  it('subir el mismo archivo dos veces no duplica (segunda: yaEstaban = todas)', async () => {
    const bytes = await ARCHIVO()
    expect((await importar(bytes, true)).estado).toBe('cargado')
    const personas = await prismaBase.persona.count()
    const r = await importar(bytes, true)
    expect(r).toEqual({
      estado: 'cargado',
      resumen: { propietarios: 0, inquilinos: 0, yaEstaban: 2, sinIdentificar: 0 },
    })
    expect(await ocupaciones()).toHaveLength(2)
    expect(await prismaBase.persona.count()).toBe(personas)
  })

  it('no da habilitación ni encola invitación', async () => {
    const vecino = await crearUsuario('Beto', 'Gil')
    const r = await importar(
      await xlsx([['1B', 'propietario', 'Beto', 'Gil', '', vecino.correo, '', '']]),
      true,
    )
    expect(r.estado).toBe('cargado')
    expect(await prismaBase.habilitacion.count({ where: { usuarioId: vecino.id } })).toBe(0)
    expect(await prismaBase.trabajoPendiente.count({ where: { tipo: 'invitacion' } })).toBe(0)
    expect(await prismaBase.usuario.count()).toBe(2)
  })

  it('inquilino cargado entre revisar y confirmar → errores, sin escribir', async () => {
    const bytes = await ARCHIVO()
    expect((await importar(bytes, false)).estado).toBe('revisado')
    const otro = await prismaBase.persona.create({ data: { nombre: 'Ivo', apellido: 'Sosa' } })
    await registrarOcupacion({
      unidadId: (await unidad('1A')).id,
      personaId: otro.id,
      tipo: 'inquilino',
      desde: new Date('2026-09-01T00:00:00.000Z'),
      hasta: null,
    })
    const r = await importar(bytes, true)
    expect(r).toEqual({
      estado: 'errores',
      errores: [
        { fila: 3, columna: 'Desde', mensaje: 'la unidad ya tiene un inquilino en esas fechas.' },
      ],
    })
    expect(await ocupaciones()).toHaveLength(1)
    expect(await prismaBase.persona.count({ where: { documento: '20123456' } })).toBe(0)
  })

  it('la exclusión de la base sobre el lote se reconoce como inquilino superpuesto', async () => {
    const unidadId = (await unidad('1A')).id
    const [a, b] = await Promise.all(
      ['Ivo', 'Leo'].map((nombre) =>
        prismaBase.persona.create({ data: { nombre, apellido: 'S' } }),
      ),
    )
    const inquilino = (personaId: string) => ({
      id: crypto.randomUUID(),
      unidadId,
      personaId,
      tipo: 'inquilino' as const,
      desde: new Date('2026-09-01T00:00:00.000Z'),
      hasta: null,
    })
    const error = await registrarOcupaciones(
      [inquilino(a!.id), inquilino(b!.id)],
      prismaBase,
    ).catch((e: unknown) => e)
    expect(comoInquilinoSuperpuesto(error)).toBeInstanceOf(InquilinoSuperpuesto)
  })

  it('unidad de otro consorcio no se encuentra (aislamiento)', async () => {
    const administradora = await crearAdministradora('Otra')
    const ajeno = (await crearConsorcio(administradora.id, 'Ajeno 1')).id
    await habilitarEnConsorcio(administrador, ajeno, 'administrador')
    await cargarPadron(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId: ajeno,
      unidades: [{ designacion: '7C', coeficiente: '100.00000000' }],
    })
    const r = await importar(
      await xlsx([['7C', 'propietario', 'Luis', 'Paz', '', '', '', '']]),
      true,
    )
    expect(r).toEqual({
      estado: 'errores',
      errores: [
        { fila: 2, columna: 'Unidad', mensaje: 'no hay ninguna unidad «7C» en este consorcio.' },
      ],
    })
  })

  it('sin padrón: «Primero cargá el padrón.»', async () => {
    const administradora = await crearAdministradora('Vacia')
    const vacio = (await crearConsorcio(administradora.id, 'Vacio 2')).id
    await habilitarEnConsorcio(administrador, vacio, 'administrador')
    const r = await importar(await ARCHIVO(), false, vacio)
    expect(r).toEqual({
      estado: 'errores',
      errores: [{ fila: null, mensaje: 'Primero cargá el padrón.' }],
    })
  })
})
