import ExcelJS from 'exceljs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { RolInsuficiente } from '@/compartido/errores'
import { importarPadron } from '@/aplicacion/importacion/importar-padron'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
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

const RELOJ = relojFijo('2026-09-09T12:00:00Z')
const repo = repositorioHabilitaciones
const ENCABEZADOS = ['Designación', 'Tipo', 'Coeficiente', 'Nombre', 'Apellido', 'DNI', 'Correo']

let consorcioId: string
let administrador: string

async function xlsx(filas: string[][]): Promise<Uint8Array> {
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet('Padron')
  hoja.addRow(ENCABEZADOS)
  for (const fila of filas) hoja.addRow(fila)
  return new Uint8Array(await libro.xlsx.writeBuffer())
}

const importar = (bytes: Uint8Array, confirmar: boolean, usuarioId = administrador) =>
  importarPadron(repo, RELOJ, {
    usuarioId,
    consorcioId,
    bytes,
    nombreArchivo: 'padron.xlsx',
    confirmar,
  })

const DOS_UNIDADES = () =>
  xlsx([
    ['1A', 'departamento', '60.00000000', 'Luis', 'Paz', '20123456', 'luis@ejemplo.test'],
    ['1B', '', '40.00000000', '', '', '', ''],
  ])

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id)).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
})

afterEach(limpiar)

describe('importarPadron (RF-02)', () => {
  it('revisar no escribe nada', async () => {
    const r = await importar(await DOS_UNIDADES(), false)
    expect(r.estado).toBe('revisado')
    if (r.estado !== 'revisado') return
    expect(r.resumen.unidades).toBe(2)
    expect(r.vista).toHaveLength(2)
    expect(await prismaBase.unidad.count()).toBe(0)
    expect(await prismaBase.persona.count({ where: { documento: '20123456' } })).toBe(0)
  })

  it('confirmar carga unidades, historia, personas y ocupaciones de propietario desde hoy', async () => {
    const r = await importar(await DOS_UNIDADES(), true)
    expect(r.estado).toBe('cargado')

    const unidades = await prismaBase.unidad.findMany({ where: { consorcioId } })
    expect(unidades.map((u) => u.designacion).sort()).toEqual(['1A', '1B'])
    expect(
      await prismaBase.coeficienteHistorico.count({
        where: { unidadId: { in: unidades.map((u) => u.id) }, vigenciaHasta: null },
      }),
    ).toBe(2)

    const persona = await prismaBase.persona.findUniqueOrThrow({ where: { documento: '20123456' } })
    expect(persona.correo).toBe('luis@ejemplo.test')
    const ocupaciones = await prismaBase.$queryRaw<
      { unidad_id: string; tipo: string; desde: Date; hasta: Date | null }[]
    >`SELECT unidad_id, tipo::text AS tipo, lower(vigencia) AS desde, upper(vigencia) AS hasta
      FROM "Ocupacion" WHERE persona_id = ${persona.id}::uuid`
    expect(ocupaciones).toHaveLength(1)
    expect(ocupaciones[0]!.tipo).toBe('propietario')
    expect(ocupaciones[0]!.desde.toISOString().slice(0, 10)).toBe('2026-09-09')
    expect(ocupaciones[0]!.hasta).toBeNull()
    expect(await prismaBase.$queryRaw`SELECT 1 FROM "Ocupacion"`).toHaveLength(1)
  })

  it('dueño existente por DNI con mismo nombre se reutiliza (no se crea Persona)', async () => {
    const existente = await prismaBase.persona.create({
      data: { nombre: 'Luis', apellido: 'Paz', documento: '20123456' },
    })
    const antes = await prismaBase.persona.count()
    const r = await importar(
      await xlsx([
        ['1A', '', '60.00000000', 'Luis', 'Paz', '20123456', ''],
        ['1B', '', '40.00000000', '', '', '', ''],
      ]),
      true,
    )
    expect(r.estado).toBe('cargado')
    expect(await prismaBase.persona.count()).toBe(antes)
    const [fila] = await prismaBase.$queryRaw<{ persona_id: string }[]>`
      SELECT persona_id FROM "Ocupacion"`
    expect(fila!.persona_id).toBe(existente.id)
  })

  it('dueño reutilizado con usuario NO recibe habilitación en este consorcio', async () => {
    const otro = await crearUsuario('Beto', 'Gil')
    const u = await prismaBase.usuario.findUniqueOrThrow({
      where: { id: otro.id },
      include: { persona: true },
    })
    const r = await importar(
      await xlsx([['1A', '', '100.00000000', 'Beto', 'Gil', '', u.correo]]),
      true,
    )
    expect(r.estado).toBe('cargado')
    expect(await prismaBase.habilitacion.count({ where: { usuarioId: otro.id } })).toBe(0)
    const [fila] = await prismaBase.$queryRaw<{ persona_id: string }[]>`
      SELECT persona_id FROM "Ocupacion"`
    expect(fila!.persona_id).toBe(u.personaId)
  })

  it('con errores no escribe nada', async () => {
    const r = await importar(
      await xlsx([
        ['1A', '', '60.00000000', '', '', '', ''],
        ['1B', '', '30.00000000', '', '', '', ''],
      ]),
      true,
    )
    expect(r.estado).toBe('errores')
    expect(await prismaBase.unidad.count()).toBe(0)
  })

  it('archivo que no es planilla → error de archivo', async () => {
    const r = await importarPadron(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      bytes: new Uint8Array([1, 2, 3]),
      nombreArchivo: 'padron.pdf',
      confirmar: false,
    })
    expect(r).toEqual({
      estado: 'errores',
      errores: [{ fila: null, mensaje: 'Subí un archivo .xlsx o .csv.' }],
    })
  })

  it('confirmar con el padrón ya cargado entre revisar y confirmar → errores, sin escribir', async () => {
    const bytes = await DOS_UNIDADES()
    expect((await importar(bytes, false)).estado).toBe('revisado')
    await cargarPadron(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidades: [{ designacion: '9Z', coeficiente: '100.00000000' }],
    })
    const r = await importar(bytes, true)
    expect(r.estado).toBe('errores')
    expect(await prismaBase.unidad.count()).toBe(1)
    expect(await prismaBase.persona.count({ where: { documento: '20123456' } })).toBe(0)
  })

  it('consorcista no puede importar', async () => {
    const vecino = (await crearUsuario('Vera')).id
    await habilitarEnConsorcio(vecino, consorcioId, 'consorcista')
    await expect(importar(await DOS_UNIDADES(), true, vecino)).rejects.toBeInstanceOf(
      RolInsuficiente,
    )
    expect(await prismaBase.unidad.count()).toBe(0)
  })

  it('96 unidades con dueño entran en una transacción', async () => {
    // 96 × 1.04166667 = 100.00000032: 64 de 1.04166667 y 32 de 1.04166666 suman 100 exacto.
    const filas = Array.from({ length: 96 }, (_, i) => {
      const coef = i < 64 ? '1.04166667' : '1.04166666'
      const n = String(i + 1).padStart(3, '0')
      return [`U${n}`, '', coef, `Nom${n}`, `Ape${n}`, String(30000000 + i), `d${n}@ejemplo.test`]
    })
    const r = await importar(await xlsx(filas), true)
    expect(r.estado).toBe('cargado')
    expect(await prismaBase.unidad.count({ where: { consorcioId } })).toBe(96)
    expect(await prismaBase.$queryRaw`SELECT 1 FROM "Ocupacion"`).toHaveLength(96)
  }, 30_000)
})
