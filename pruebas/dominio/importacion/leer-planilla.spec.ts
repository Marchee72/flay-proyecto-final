import ExcelJS from 'exceljs'
import { describe, expect, test } from 'vitest'

import { ArchivoNoValido, leerPlanilla } from '@/infraestructura/planillas/leer-planilla'

async function xlsx(filas: unknown[][]): Promise<Uint8Array> {
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet('Hoja1')
  filas.forEach((f) => hoja.addRow(f))
  return new Uint8Array(await libro.xlsx.writeBuffer())
}
const bytes = (s: string) => new TextEncoder().encode(s)

describe('leerPlanilla', () => {
  test('xlsx: celda de texto se lee tal cual', async () => {
    const r = await leerPlanilla(
      await xlsx([
        ['Designación', 'Coeficiente'],
        ['1A', '1,04166667'],
      ]),
      'a.xlsx',
    )
    expect(r.encabezados).toEqual(['Designación', 'Coeficiente'])
    expect(r.filas).toEqual([{ numero: 2, celdas: ['1A', '1,04166667'] }])
  })
  test('xlsx: celda numérica se lee por su representación más corta', async () => {
    const r = await leerPlanilla(
      await xlsx([
        ['D', 'C'],
        ['1A', 1.04166667],
      ]),
      'a.xlsx',
    )
    expect(r.filas[0]!.celdas[1]).toBe('1.04166667')
  })
  test('xlsx: celda fecha → AAAA-MM-DD por componentes UTC', async () => {
    const r = await leerPlanilla(
      await xlsx([
        ['D', 'F'],
        ['1A', new Date(Date.UTC(2026, 10, 1))],
      ]),
      'a.xlsx',
    )
    expect(r.filas[0]!.celdas[1]).toBe('2026-11-01')
  })
  test('xlsx: celda fórmula se lee por su resultado', async () => {
    const r = await leerPlanilla(
      await xlsx([
        ['D', 'C'],
        ['1A', { formula: '1+1', result: 2 }],
      ]),
      'a.xlsx',
    )
    expect(r.filas[0]!.celdas[1]).toBe('2')
  })
  test('csv con ; y BOM', async () => {
    const r = await leerPlanilla(bytes('﻿Designación;Coeficiente\r\n1A;1,5\r\n'), 'a.csv')
    expect(r.encabezados).toEqual(['Designación', 'Coeficiente'])
    expect(r.filas).toEqual([{ numero: 2, celdas: ['1A', '1,5'] }])
  })
  test('csv con , y comillas con separador adentro', async () => {
    const r = await leerPlanilla(bytes('D,C\n"1A, piso 1","a ""b"""\n'), 'a.csv')
    expect(r.filas[0]!.celdas).toEqual(['1A, piso 1', 'a "b"'])
  })
  test('csv en Windows-1252: «Designación» se reconoce', async () => {
    const b = new Uint8Array([
      ...[...'Designaci'].map((c) => c.charCodeAt(0)),
      0xf3,
      0x6e,
      0x3b,
      0x43,
      0x0a,
      0x31,
      0x3b,
      0x32,
    ])
    const r = await leerPlanilla(b, 'a.csv')
    expect(r.encabezados[0]).toBe('Designación')
  })
  test('extensión no admitida', async () => {
    await expect(leerPlanilla(bytes('x'), 'a.pdf')).rejects.toMatchObject({
      mensajeParaUsuario: 'Subí un archivo .xlsx o .csv.',
    })
  })
  test('más de 500 KB', async () => {
    const e = await leerPlanilla(new Uint8Array(500 * 1024 + 1), 'a.csv').catch((x) => x)
    expect(e).toBeInstanceOf(ArchivoNoValido)
    expect(e.mensajeParaUsuario).toBe('El archivo pesa más de 500 KB.')
  })
  test('xlsx: una celda lejana (XFD1048576) no cuelga el lector', async () => {
    const libro = new ExcelJS.Workbook()
    const hoja = libro.addWorksheet('Hoja1')
    hoja.addRow(['D', 'C'])
    hoja.getCell('XFD1048576').value = 'x'
    const b = new Uint8Array(await libro.xlsx.writeBuffer())
    const t0 = Date.now()
    const r = await leerPlanilla(b, 'a.xlsx').catch((x) => x)
    expect(Date.now() - t0).toBeLessThan(3000)
    // la fila lejana conserva su número real
    expect(r.filas).toEqual([{ numero: 1048576, celdas: ['', ''] }])
  })
  test('xlsx: más de 2000 filas se rechaza', async () => {
    const filas: unknown[][] = [['D', 'C']]
    for (let i = 0; i < 2003; i++) filas.push([`u${i}`, '1'])
    await expect(leerPlanilla(await xlsx(filas), 'a.xlsx')).rejects.toMatchObject({
      mensajeParaUsuario: 'El archivo tiene más de 2000 filas.',
    })
  })
  test('xlsx: hipervínculo con texto enriquecido se lee como texto', async () => {
    const r = await leerPlanilla(
      await xlsx([
        ['D', 'C'],
        ['1A', { text: { richText: [{ text: 'a' }, { text: 'b' }] }, hyperlink: 'http://x' }],
      ]),
      'a.xlsx',
    )
    expect(r.filas[0]!.celdas[1]).toBe('ab')
  })
  test('xlsx corrupto', async () => {
    await expect(leerPlanilla(bytes('no es un zip'), 'a.xlsx')).rejects.toMatchObject({
      mensajeParaUsuario: 'No pudimos leer el archivo. ¿Es un Excel válido?',
      codigo: 'RF-02',
    })
  })
})
