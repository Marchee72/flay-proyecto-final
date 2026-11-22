import ExcelJS from 'exceljs'

import { MAX_FILAS } from '@/dominio/importacion/planilla'
import { COLUMNAS_OCUPANTES } from '@/dominio/importacion/ocupantes'
import { COLUMNAS_PADRON } from '@/dominio/importacion/padron'
import { TIPOS_UNIDAD } from '@/dominio/unidades/tipo'

const EJEMPLO = 'Ejemplo — borrar esta fila'
const ULTIMA = MAX_FILAS + 1

const PIE_PERSONAS = [
  'DNI: 7 u 8 números (se aceptan puntos). Correo: una dirección válida.',
  'Una persona se reconoce por su correo y, si no tiene, por su DNI. Si ya está registrada con otro nombre, la fila se rechaza.',
  'Si una fila no tiene correo ni DNI, se crea una persona nueva cada vez: volver a importar el archivo la duplicaría.',
]

const REGLAS_GENERALES = [
  'No cambies los títulos de las columnas ni agregues otras: se reconocen por su título (sin importar mayúsculas ni acentos).',
  `Máximo ${MAX_FILAS} filas y 500 KB. Se lee solo la primera hoja. También podés guardar como .csv.`,
  'Las filas vacías se ignoran, y la fila que dice «Ejemplo» también si te olvidás de borrarla.',
  'Todo o nada: si una sola fila tiene un error, no se carga ninguna. Se te avisan todos los errores juntos, con el número de fila.',
  'Importar no invita a nadie ni envía correos: eso se hace después, desde «Invitar».',
]

function hojaDeInstrucciones(libro: ExcelJS.Workbook, lineas: string[]) {
  const hoja = libro.addWorksheet('Instrucciones')
  hoja.getColumn(1).width = 120
  lineas.forEach((l, i) => {
    const celda = hoja.getCell(i + 1, 1)
    celda.value = l
    celda.alignment = { wrapText: true, vertical: 'top' }
    if (i === 0) celda.font = { bold: true, size: 14 }
  })
}

// La de datos va primera: el lector toma la primera hoja.
function hojaDeDatos(
  libro: ExcelJS.Workbook,
  nombre: string,
  titulos: string[],
  ejemplo: string[],
) {
  const hoja = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] })
  hoja.addRow(titulos).font = { bold: true }
  hoja.addRow(ejemplo)
  titulos.forEach((_, i) => (hoja.getColumn(i + 1).width = 20))
  return hoja
}

async function aBytes(libro: ExcelJS.Workbook): Promise<Uint8Array> {
  return new Uint8Array(await libro.xlsx.writeBuffer())
}

/** Lista desplegable que apunta a un rango de la hoja oculta «Listas» (inline, tope de 255 caracteres). */
function conLista(hoja: ExcelJS.Worksheet, columna: number, formula: string) {
  for (let r = 2; r <= ULTIMA; r++)
    hoja.getCell(r, columna).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [formula],
    }
}

function hojaDeListas(libro: ExcelJS.Workbook, columnas: readonly (readonly string[])[]) {
  const listas = libro.addWorksheet('Listas', { state: 'hidden' })
  columnas.forEach((valores, c) =>
    valores.forEach((v, r) => (listas.getCell(r + 1, c + 1).value = v)),
  )
}

const rango = (columna: string, n: number) => `Listas!$${columna}$1:$${columna}$${Math.max(n, 1)}`

export async function plantillaPadron(): Promise<Uint8Array> {
  const libro = new ExcelJS.Workbook()
  const hoja = hojaDeDatos(
    libro,
    'Padrón',
    COLUMNAS_PADRON.map((c) => c.titulo),
    [EJEMPLO, 'departamento', '4,16666667', 'Ana', 'Pérez', '20123456', 'ana@ejemplo.com', ''],
  )
  hojaDeInstrucciones(libro, [
    'Cómo cargar el padrón de unidades',
    'Completá la hoja «Padrón», una unidad por fila, y subí el archivo. Solo se puede cargar el padrón de un consorcio que todavía no tiene unidades.',
    'Designación (obligatoria): el nombre de la unidad, por ejemplo 1A. No puede repetirse (1A y 1 a son la misma).',
    `Tipo (opcional): ${TIPOS_UNIDAD.join(', ')}. Si lo dejás vacío, es departamento.`,
    'Coeficiente (obligatorio): el porcentaje de la unidad, con hasta 8 decimales y coma o punto, por ejemplo 4,16666667. Tiene que ser mayor que cero.',
    'Los coeficientes de todas las unidades tienen que sumar exactamente 100. Si no cierra, te decimos cuánto falta o sobra. Nunca se redondea nada.',
    'Nombre, Apellido, DNI, Correo y Teléfono (opcionales): el dueño de la unidad. Un solo dueño por fila; si cargás cualquier dato de la persona, Nombre y Apellido son obligatorios.',
    ...PIE_PERSONAS,
    ...REGLAS_GENERALES,
  ])
  const iCoef = COLUMNAS_PADRON.findIndex((c) => c.clave === 'coeficiente') + 1
  const iTipo = COLUMNAS_PADRON.findIndex((c) => c.clave === 'tipo') + 1
  // Texto, no número: Excel guarda doubles y el coeficiente no puede pasar por uno.
  hoja.getColumn(iCoef).numFmt = '@'
  for (let r = 2; r <= ULTIMA; r++) hoja.getCell(r, iCoef).numFmt = '@'
  hojaDeListas(libro, [TIPOS_UNIDAD])
  conLista(hoja, iTipo, rango('A', TIPOS_UNIDAD.length))
  return aBytes(libro)
}

export async function plantillaOcupantes(designaciones: readonly string[]): Promise<Uint8Array> {
  const libro = new ExcelJS.Workbook()
  const hoja = hojaDeDatos(
    libro,
    'Ocupantes',
    COLUMNAS_OCUPANTES.map((c) => c.titulo),
    [EJEMPLO, 'inquilino', 'Luis', 'Paz'],
  )
  hojaDeInstrucciones(libro, [
    'Cómo cargar propietarios e inquilinos',
    'Completá la hoja «Ocupantes», un vínculo por fila, y subí el archivo. El consorcio tiene que tener el padrón cargado.',
    'Unidad (obligatoria): la designación exacta de una unidad del consorcio. Elegila de la lista desplegable.',
    'Vínculo (obligatorio): propietario o inquilino.',
    'Nombre y Apellido (obligatorios). DNI, Correo y Teléfono son opcionales.',
    'Desde (opcional): fecha de inicio, como AAAA-MM-DD o día/mes/año. Si la dejás vacía, es hoy.',
    'Hasta (opcional): último día, inclusive. Si la dejás vacía, no tiene fin. No puede ser anterior a Desde.',
    'Dos inquilinos de la misma unidad no pueden tener fechas que se pisen.',
    'Si subís otra vez algo que ya estaba cargado (misma persona, unidad y vínculo), no se duplica: cuenta como «ya estaban».',
    ...PIE_PERSONAS,
    ...REGLAS_GENERALES,
  ])
  hojaDeListas(libro, [designaciones, ['propietario', 'inquilino']])
  const col = (clave: string) => COLUMNAS_OCUPANTES.findIndex((c) => c.clave === clave) + 1
  conLista(hoja, col('unidad'), rango('A', designaciones.length))
  conLista(hoja, col('vinculo'), rango('B', 2))
  return aBytes(libro)
}
