/**
 * La division y el piso de una unidad (`RF-18`): dos formas de dirigir una
 * novedad a un grupo del padron sin listarlo a mano.
 *
 * - Division: la columna de departamentos que comparten letra en todos los
 *   pisos —1A, 2A, 3A—, «se corta el agua de la columna A».
 * - Piso: la planta —3A, 3B, 3C son «el piso 3»; PB es su propio piso—,
 *   «se pinta el piso 3».
 *
 * Es la unica definicion: salen del nombre, asi que no hay que cargarlas
 * aparte. Una unidad sin letra final despues del piso (C1, Local 2, 1-27) no
 * tiene ni division ni piso.
 *
 * ponytail: se deducen del nombre; si algun edificio numera distinto, pasan a
 * ser campos de `Unidad`.
 */
const PISO_Y_LETRA = /^((?:\d+|PB))\s*[-°º]?\s*([A-Z])$/i

export function divisionDe(designacion: string): string | null {
  return PISO_Y_LETRA.exec(designacion.trim())?.[2].toUpperCase() ?? null
}

export function pisoDe(designacion: string): string | null {
  return PISO_Y_LETRA.exec(designacion.trim())?.[1].toUpperCase() ?? null
}
