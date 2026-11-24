import ExcelJS from 'exceljs'

import { filasDeCsv } from '@/compartido/csv'
import { ErrorDeAplicacion } from '@/compartido/errores'
import {
  MAX_BYTES,
  MAX_FILAS,
  type FilaLeida,
  type PlanillaLeida,
} from '@/dominio/importacion/planilla'

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
  if ('text' in v) return textoDeCelda(v.text as ExcelJS.CellValue) // hipervínculo
  return ''
}

function decodificarCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

const MAX_COLUMNAS = 64

async function filasDeXlsx(bytes: Uint8Array): Promise<PlanillaLeida> {
  const libro = new ExcelJS.Workbook()
  try {
    await libro.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  } catch {
    throw new ArchivoNoValido('No pudimos leer el archivo. ¿Es un Excel válido?')
  }
  const hoja = libro.worksheets[0]
  if (!hoja) throw new ArchivoNoValido('No pudimos leer el archivo. ¿Es un Excel válido?')
  // ponytail: ExcelJS infla el XML de la hoja entero antes de cualquier tope (bomba zip dentro de los
  // 500 KB); si hiciera falta, ExcelJS.stream.xlsx.WorkbookReader cortando en MAX_FILAS + 2.
  // Solo se recorren las filas con valor (eachRow) y el ancho sale del encabezado, no de la hoja.
  const ancho = Math.min(hoja.getRow(1).cellCount, MAX_COLUMNAS)
  let encabezados: string[] = []
  const filas: FilaLeida[] = []
  let vistas = 0
  hoja.eachRow((fila, r) => {
    if (++vistas > MAX_FILAS + 2)
      throw new ArchivoNoValido(`El archivo tiene más de ${MAX_FILAS} filas.`)
    const celdas = Array.from({ length: ancho }, (_, c) => textoDeCelda(fila.getCell(c + 1).value))
    if (r === 1) encabezados = celdas
    else filas.push({ numero: r, celdas })
  })
  return { encabezados, filas }
}

export async function leerPlanilla(
  bytes: Uint8Array,
  nombreArchivo: string,
): Promise<PlanillaLeida> {
  const ext = nombreArchivo.toLowerCase().match(/\.(xlsx|csv)$/)?.[1]
  if (!ext) throw new ArchivoNoValido('Subí un archivo .xlsx o .csv.')
  if (bytes.byteLength > MAX_BYTES) throw new ArchivoNoValido('El archivo pesa más de 500 KB.')
  if (ext === 'xlsx') return filasDeXlsx(bytes)
  const [encabezados = [], ...resto] = filasDeCsv(decodificarCsv(bytes))
  return { encabezados, filas: resto.map((celdas, i) => ({ numero: i + 2, celdas })) }
}
