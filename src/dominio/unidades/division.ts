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

export function divisionDe(designacion: string): string | null {
  return CON_DIVISION.exec(designacion.trim())?.[1].toUpperCase() ?? null
}
