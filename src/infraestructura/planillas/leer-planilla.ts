import ExcelJS from 'exceljs'

import { filasDeCsv } from '@/compartido/csv'
import { ErrorDeAplicacion } from '@/compartido/errores'
import { MAX_BYTES, type FilaLeida, type PlanillaLeida } from '@/dominio/importacion/planilla'

export class ArchivoNoValido extends ErrorDeAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 'RF-02')
  }
}

const dos = (n: number) => String(n).padStart(2, '0')

function textoDeCelda(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date)
    return `${v.getUTCFullYear()}-${dos(v.getUTCMonth() + 1)}-${dos(v.getUTCDate())}`
  if ('richText' in v) return v.richText.map((r) => r.text).join('')
  if ('result' in v) return textoDeCelda(v.result as ExcelJS.CellValue)
  if ('text' in v) return String(v.text) // hipervínculo
  return ''
}

function decodificarCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

async function filasDeXlsx(bytes: Uint8Array): Promise<string[][]> {
  const libro = new ExcelJS.Workbook()
  try {
    await libro.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  } catch {
    throw new ArchivoNoValido('No pudimos leer el archivo. ¿Es un Excel válido?')
  }
  const hoja = libro.worksheets[0]
  if (!hoja) throw new ArchivoNoValido('No pudimos leer el archivo. ¿Es un Excel válido?')
  const filas: string[][] = []
  const columnas = hoja.columnCount
  for (let r = 1; r <= hoja.rowCount; r++) {
    const fila = hoja.getRow(r)
    filas.push(Array.from({ length: columnas }, (_, c) => textoDeCelda(fila.getCell(c + 1).value)))
  }
  return filas
}

export async function leerPlanilla(
  bytes: Uint8Array,
  nombreArchivo: string,
): Promise<PlanillaLeida> {
  const ext = nombreArchivo.toLowerCase().match(/\.(xlsx|csv)$/)?.[1]
  if (!ext) throw new ArchivoNoValido('Subí un archivo .xlsx o .csv.')
  if (bytes.byteLength > MAX_BYTES) throw new ArchivoNoValido('El archivo pesa más de 500 KB.')
  const todas = ext === 'xlsx' ? await filasDeXlsx(bytes) : filasDeCsv(decodificarCsv(bytes))
  const [encabezados = [], ...resto] = todas
  const filas: FilaLeida[] = resto.map((celdas, i) => ({ numero: i + 2, celdas }))
  return { encabezados, filas }
}
