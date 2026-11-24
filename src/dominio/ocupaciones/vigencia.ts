import { fechaParaMostrar } from '@/compartido/formato'

/**
 * Reglas de vigencia del inquilino (RN-23, RN-24).
 *
 * En la base la vigencia de una ocupacion es un `daterange` semiabierto
 * `[desde, hasta)`. En pantalla y en toda firma de aplicacion, «hasta» es
 * **inclusivo** («vive hasta el 28/02/2027»). La conversion vive solo aca y
 * la usa el repositorio de ocupaciones.
 */

export type TipoOcupacionVigencia = 'propietario' | 'inquilino'

/** Convierte un «hasta» inclusivo de pantalla al extremo exclusivo de `[desde, hasta)`. */
export function hastaSemiabierto(hasta: Date): Date {
  return new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate() + 1))
}

/** Convierte el extremo exclusivo de `[desde, hasta)` al último día inclusivo. */
export function hastaInclusivo(hasta: Date): Date {
  return new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate() - 1))
}

/**
 * RN-23: desde qué mes puede ver las liquidaciones quien ocupa la unidad.
 *
 * Si alguna de sus ocupaciones vigentes en la unidad es `propietario`, ve toda
 * la historia (`null`). Si solo es `inquilino`, ve desde el primer día del mes
 * de su ingreso más antiguo.
 */
export function visibleDesde(
  tipos: readonly TipoOcupacionVigencia[],
  desdes: readonly Date[],
): Date | null {
  if (tipos.includes('propietario') || desdes.length === 0) return null

  let masAntiguo = desdes[0]!
  for (let i = 1; i < desdes.length; i++) {
    if (desdes[i]!.getTime() < masAntiguo.getTime()) {
      masAntiguo = desdes[i]!
    }
  }

  return new Date(Date.UTC(masAntiguo.getUTCFullYear(), masAntiguo.getUTCMonth(), 1))
}

/** RN-23: si un período (año y mes) cae dentro de la ventana visible. */
export function periodoVisible(
  periodo: { anio: number; mes: number },
  desde: Date | null,
): boolean {
  if (desde === null) return true
  const anioDesde = desde.getUTCFullYear()
  const mesDesde = desde.getUTCMonth() + 1
  return periodo.anio > anioDesde || (periodo.anio === anioDesde && periodo.mes >= mesDesde)
}

/**
 * RN-24: hasta qué día (inclusivo) rige la habilitación de consorcista dadas
 * todas las ocupaciones de una persona en un consorcio.
 *
 * Si alguna ocupación no tiene fin (`null`), el acceso sigue abierto (`null`).
 * Si todas tienen fin, se cierra el último día (el máximo).
 */
export function finDelAcceso(hastas: readonly (Date | null)[]): Date | null {
  if (hastas.length === 0) {
    throw new Error('Se requiere al menos una ocupación para calcular el fin del acceso.')
  }

  let maximo: Date | null = null
  for (const hasta of hastas) {
    if (hasta === null) return null
    if (maximo === null || hasta.getTime() > maximo.getTime()) {
      maximo = hasta
    }
  }
  return maximo
}

/**
 * Validador puro para formularios y casos de uso (nota 28).
 * Vacío es válido (sin fecha de fin); igual al ingreso también (alquiler de un día).
 */
export function errorDeFinDeAlquiler(desdeIso: string, hastaIso: string): string | null {
  const desde = desdeIso.trim().slice(0, 10)
  const hasta = hastaIso.trim().slice(0, 10)
  if (!desde || !hasta) return null
  if (hasta < desde) {
    return `La fecha de fin no puede ser anterior al ingreso, el ${fechaParaMostrar(desde)}.`
  }
  return null
}
