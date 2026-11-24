import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { COLUMNAS_OCUPANTES } from '@/dominio/importacion/ocupantes'
import { COLUMNAS_PADRON, validarPadron } from '@/dominio/importacion/padron'
import { plantillaOcupantes, plantillaPadron } from '@/infraestructura/planillas/plantillas'
import { leerPlanilla } from '@/infraestructura/planillas/leer-planilla'

const cargar = async (bytes: Uint8Array) => {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  return libro
}

describe('plantillas descargables (RF-02, RF-03)', () => {
  it('padrón: encabezados = títulos de COLUMNAS_PADRON en orden', async () => {
    const p = await leerPlanilla(await plantillaPadron(), 'padron.xlsx')
    expect(p.encabezados).toEqual(COLUMNAS_PADRON.map((c) => c.titulo))
  })

  it('padrón: la fila de ejemplo se ignora al validar', async () => {
    const p = await leerPlanilla(await plantillaPadron(), 'padron.xlsx')
    expect(p.filas.filter((f) => f.celdas.some((c) => c !== ''))).toHaveLength(1)
    const r = validarPadron(p, { unidadesExistentes: 0, archivado: false, personasConocidas: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores[0]!.mensaje).toBe('El archivo no tiene filas para cargar.')
  })

  it('padrón: columna Coeficiente con formato texto', async () => {
    const hoja = (await cargar(await plantillaPadron())).getWorksheet('Padrón')!
    const col = COLUMNAS_PADRON.findIndex((c) => c.clave === 'coeficiente') + 1
    expect(hoja.getColumn(col).numFmt).toBe('@')
    expect(hoja.getCell(3, col).numFmt).toBe('@')
  })

  it('padrón: hoja «Instrucciones» existe', async () => {
    const libro = await cargar(await plantillaPadron())
    expect(libro.getWorksheet('Instrucciones')).toBeDefined()
    expect(libro.worksheets[0]!.name).toBe('Padrón')
  })

  it('ocupantes: encabezados y desplegable de Unidad con las designaciones', async () => {
    const bytes = await plantillaOcupantes(['1A', '2B'])
    const p = await leerPlanilla(bytes, 'o.xlsx')
    expect(p.encabezados).toEqual(COLUMNAS_OCUPANTES.map((c) => c.titulo))
    const libro = await cargar(bytes)
    const hoja = libro.getWorksheet('Ocupantes')!
    expect(hoja.getCell('A3').dataValidation).toMatchObject({
      type: 'list',
      formulae: ['Listas!$A$1:$A$2'],
    })
    expect(hoja.getCell('B3').dataValidation.type).toBe('list')
    const listas = libro.getWorksheet('Listas')!
    expect(listas.state).toBe('hidden')
    expect(listas.getCell('A2').value).toBe('2B')
  })
})
