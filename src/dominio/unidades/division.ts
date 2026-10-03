/**
 * La division de una unidad (`RF-18`): la columna de departamentos que
 * comparten letra en todos los pisos —1A, 2A, 3A—, a la que la administracion
 * le puede dirigir una novedad («se corta el agua de la columna A»).
 *
 * Es la unica definicion: sale del nombre, asi que no hay que cargarla aparte.
 * Una unidad sin letra final despues del piso (C1, Local 2, 1-27) no tiene
 * division.
 *
 * ponytail: se deduce del nombre; si algun edificio numera distinto, pasa a
 * ser un campo de `Unidad`.
 */
const CON_DIVISION = /^(?:\d+|PB)\s*[-°º]?\s*([A-Z])$/i
const CON_PISO = /^(\d+|PB)\s*[-°º]?\s*(?:[A-Z])?$/i

export function divisionDe(designacion: string): string | null {
  return CON_DIVISION.exec(designacion.trim())?.[1].toUpperCase() ?? null
}

export function pisoDe(designacion: string): string | null {
  const coincidencia = CON_PISO.exec(designacion.trim())
  return coincidencia ? coincidencia[1].toUpperCase() : null
}

export interface DesgloseDesignacion {
  categoria: number
  piso: number
  resto: string
}

/**
 * Desglosa la designación de una unidad para ordenamiento físico por piso:
 * - Subsuelos (SS, SS1, Subsuelo): categoría -1, piso negativo.
 * - Planta Baja (PB, PB A, PB 1): categoría 0, piso 0.
 * - Pisos numéricos (1A, 2B, 10A, Piso 3): categoría 1, piso numérico.
 * - Otras unidades (Cocheras, Bauleras, Locales, U1): categoría 2, orden natural.
 */
export function desglosarDesignacion(designacion: string): DesgloseDesignacion {
  const d = designacion.trim()

  const matchSS = /^(?:SS|SUBSUELO)\s*[-°º]?\s*(\d+)?(.*)$/i.exec(d)
  if (matchSS) {
    const num = matchSS[1] ? parseInt(matchSS[1], 10) : 1
    return { categoria: -1, piso: -num, resto: (matchSS[2] ?? '').trim() }
  }

  const matchPB = /^(?:PB|PLANTA\s*BAJA)\s*[-°º]?\s*(.*)$/i.exec(d)
  if (matchPB) {
    return { categoria: 0, piso: 0, resto: (matchPB[1] ?? '').trim() }
  }

  const matchPisoTexto = /^PISO\s*(\d+)\s*(.*)$/i.exec(d)
  if (matchPisoTexto) {
    return {
      categoria: 1,
      piso: parseInt(matchPisoTexto[1], 10),
      resto: (matchPisoTexto[2] ?? '').trim(),
    }
  }

  const matchPiso = /^(\d+)\s*[-°º/]?\s*(.*)$/i.exec(d)
  if (matchPiso) {
    return { categoria: 1, piso: parseInt(matchPiso[1], 10), resto: (matchPiso[2] ?? '').trim() }
  }

  return { categoria: 2, piso: 9999, resto: d }
}

export function compararDesignaciones(a: string, b: string): number {
  const da = desglosarDesignacion(a)
  const db = desglosarDesignacion(b)

  if (da.categoria !== db.categoria) {
    return da.categoria - db.categoria
  }

  if (da.piso !== db.piso) {
    return da.piso - db.piso
  }

  return da.resto.localeCompare(db.resto, undefined, { numeric: true, sensitivity: 'base' })
}

/** Ordena cualquier colección con `designacion` por piso físico de forma ascendente. */
export function ordenarUnidades<T extends { designacion: string }>(unidades: readonly T[]): T[] {
  return [...unidades].sort((a, b) => compararDesignaciones(a.designacion, b.designacion))
}

