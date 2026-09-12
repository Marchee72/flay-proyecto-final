import { ErrorDeAplicacion } from '@/compartido/errores'

/**
 * Maquina de estados del reclamo (`RF-13`, `CU-08`, regla RN-11 § 7.2,
 * research R-09). Pura: `transicionar` en aplicacion es el unico que la usa
 * para cambiar un estado, y la base repite RN-11 con un CHECK para que un
 * UPDATE directo tampoco pueda saltarla (SC-004).
 */

export const ESTADOS_RECLAMO = [
  'abierto',
  'asignado',
  'en_curso',
  'resuelto',
  'cerrado',
  'rechazado',
] as const

export type EstadoReclamo = (typeof ESTADOS_RECLAMO)[number]

export const TRANSICIONES: Readonly<Record<EstadoReclamo, readonly EstadoReclamo[]>> = {
  abierto: ['asignado', 'rechazado'],
  // Quitar el responsable devuelve el reclamo a la bandeja.
  asignado: ['en_curso', 'rechazado', 'abierto'],
  en_curso: ['resuelto', 'asignado'],
  // El autor puede decir que no quedo resuelto.
  resuelto: ['cerrado', 'en_curso'],
  // La reapertura es una transicion mas, con su asiento; I-4 mide hasta el
  // ultimo cierre (caso limite de la spec).
  cerrado: ['abierto'],
  rechazado: [],
}

export const transicionValida = (desde: EstadoReclamo, hacia: EstadoReclamo): boolean =>
  TRANSICIONES[desde].includes(hacia)

/** Regla RN-11: solo el estado inicial admite no tener responsable. */
export const requiereResponsable = (estado: EstadoReclamo): boolean => estado !== 'abierto'

export const ETIQUETAS_ESTADO: Readonly<Record<EstadoReclamo, string>> = {
  abierto: 'Abierto',
  asignado: 'Asignado',
  en_curso: 'En curso',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
  rechazado: 'Rechazado',
}

export class TransicionDeReclamoInvalida extends ErrorDeAplicacion {
  constructor(desde: EstadoReclamo, hacia: EstadoReclamo) {
    super(
      `Un reclamo ${ETIQUETAS_ESTADO[desde].toLowerCase()} no puede pasar a ${ETIQUETAS_ESTADO[hacia].toLowerCase()}.`,
      'RF-13',
      { desde, hacia },
    )
  }
}

export class ReclamoSinResponsable extends ErrorDeAplicacion {
  constructor(hacia: EstadoReclamo) {
    super(
      `Para pasar el reclamo a ${ETIQUETAS_ESTADO[hacia].toLowerCase()} primero hay que asignarle un responsable.`,
      'RN-11',
      { hacia },
    )
  }
}

export function exigirTransicion(desde: EstadoReclamo, hacia: EstadoReclamo): void {
  if (!transicionValida(desde, hacia)) throw new TransicionDeReclamoInvalida(desde, hacia)
}
