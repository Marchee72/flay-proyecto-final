/**
 * Planilla leída a cadenas (RF-02, RF-03): ningún número ni fecha de Excel pasa
 * por aquí con otro tipo que texto. Reconocer columnas es de dominio; leer el
 * archivo es de infraestructura.
 */
export const MAX_BYTES = 500 * 1024
export const MAX_FILAS = 2000

/** `numero` es la fila de la planilla (el encabezado es la 1). */
export interface FilaLeida {
  numero: number
  celdas: string[]
}
export interface PlanillaLeida {
  encabezados: string[]
  filas: FilaLeida[]
}
export interface ErrorDeFila {
  fila: number | null
  columna?: string
  mensaje: string
}
export type Validacion<T> = { ok: true; valor: T } | { ok: false; errores: ErrorDeFila[] }
export interface Columna {
  clave: string
  titulo: string
  obligatoria: boolean
}

/** Minúsculas, sin acentos, espacios colapsados y recortados. */
export function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function esFilaDeEjemplo(fila: FilaLeida): boolean {
  return normalizarTexto(fila.celdas[0] ?? '').startsWith('ejemplo')
}

export function columnasDe(
  planilla: PlanillaLeida,
  esquema: readonly Columna[],
): Validacion<{ valor: (fila: FilaLeida, clave: string) => string; filas: FilaLeida[] }> {
  const errores: ErrorDeFila[] = []
  const posicion = new Map<string, number>()
  planilla.encabezados.forEach((crudo, i) => {
    const norm = normalizarTexto(crudo)
    if (norm === '') return
    const col = esquema.find((c) => normalizarTexto(c.titulo) === norm)
    if (!col) {
      errores.push({ fila: 1, mensaje: `La columna «${crudo.trim()}» no es de la plantilla.` })
    } else if (posicion.has(col.clave)) {
      errores.push({ fila: 1, mensaje: `La columna «${col.titulo}» está repetida.` })
    } else posicion.set(col.clave, i)
  })
  for (const c of esquema) {
    if (c.obligatoria && !posicion.has(c.clave))
      errores.push({ fila: 1, mensaje: `Falta la columna «${c.titulo}».` })
  }
  if (errores.length) return { ok: false, errores }

  const filas = planilla.filas.filter(
    (f) => f.celdas.some((c) => c.trim() !== '') && !esFilaDeEjemplo(f),
  )
  if (filas.length > MAX_FILAS)
    return {
      ok: false,
      errores: [{ fila: null, mensaje: `El archivo tiene más de ${MAX_FILAS} filas.` }],
    }
  if (filas.length === 0)
    return {
      ok: false,
      errores: [{ fila: null, mensaje: 'El archivo no tiene filas para cargar.' }],
    }
  const valor = (fila: FilaLeida, clave: string) => {
    const i = posicion.get(clave)
    return i === undefined ? '' : (fila.celdas[i] ?? '').trim()
  }
  return { ok: true, valor: { valor, filas } }
}
