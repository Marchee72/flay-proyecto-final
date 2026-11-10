import { ErrorDeAplicacion } from '@/compartido/errores'

/**
 * Máquinas de estado de la asamblea, del punto del orden del día y del acta
 * (016, data-model). Puras: los casos de uso las consultan antes de escribir,
 * y la base repite la regla en un disparador para que un UPDATE directo
 * tampoco pueda saltarla (research R-02).
 */

export const ESTADOS_ASAMBLEA = [
  'borrador',
  'convocada',
  'en_curso',
  'finalizada',
  'acta_firmada',
  'cancelada',
] as const
export type EstadoAsamblea = (typeof ESTADOS_ASAMBLEA)[number]
export type AccionAsamblea = 'convocar' | 'abrir' | 'finalizar' | 'cancelar' | 'firmar_acta'

export type EstadoPunto = 'pendiente' | 'abierto' | 'cerrado'
export type AccionPunto = 'abrir' | 'cerrar'

export type EstadoActa = 'en_redaccion' | 'a_firmar' | 'firmada'
export type AccionActa = 'enviar' | 'completar_firmas'

export const ETIQUETAS_ASAMBLEA: Readonly<Record<EstadoAsamblea, string>> = {
  borrador: 'Borrador',
  convocada: 'Convocada',
  en_curso: 'En curso',
  finalizada: 'Finalizada',
  acta_firmada: 'Acta firmada',
  cancelada: 'Cancelada',
}

const VERBOS: Readonly<Record<AccionAsamblea | AccionPunto | AccionActa, string>> = {
  convocar: 'convocarse',
  abrir: 'abrirse',
  finalizar: 'finalizarse',
  cancelar: 'cancelarse',
  firmar_acta: 'cerrar su acta',
  cerrar: 'cerrarse',
  enviar: 'enviarse a firmar',
  completar_firmas: 'quedar firmada',
}

export class TransicionInvalida extends ErrorDeAplicacion {
  constructor(sujeto: string, estado: string, accion: keyof typeof VERBOS, motivo?: string) {
    super(
      `${sujeto} ${estado.toLowerCase()} no puede ${VERBOS[accion]}.${motivo ? ` ${motivo}` : ''}`,
      'RF-31',
      { estado, accion },
    )
  }
}

const ASAMBLEA: Readonly<Record<EstadoAsamblea, Partial<Record<AccionAsamblea, EstadoAsamblea>>>> =
  {
    borrador: { convocar: 'convocada' },
    convocada: { abrir: 'en_curso', cancelar: 'cancelada' },
    en_curso: { finalizar: 'finalizada', cancelar: 'cancelada' },
    finalizada: { firmar_acta: 'acta_firmada' },
    acta_firmada: {},
    cancelada: {},
  }

export function transicionAsamblea(
  desde: EstadoAsamblea,
  accion: AccionAsamblea,
  contexto: { constituida?: boolean } = {},
): EstadoAsamblea {
  const hacia = ASAMBLEA[desde][accion]
  const etiqueta = ETIQUETAS_ASAMBLEA[desde]
  if (!hacia) throw new TransicionInvalida('Una asamblea', etiqueta, accion)
  if (desde === 'en_curso' && accion === 'cancelar' && contexto.constituida) {
    throw new TransicionInvalida(
      'Una asamblea',
      'constituida',
      accion,
      'Ya sesionó: hay que terminar de tratar el orden del día y finalizarla.',
    )
  }
  if (accion === 'finalizar' && !contexto.constituida) {
    throw new TransicionInvalida(
      'Una asamblea',
      'sin constituir',
      accion,
      'Si no alcanzó el quórum, se cancela.',
    )
  }
  return hacia
}

const PUNTO: Readonly<Record<EstadoPunto, Partial<Record<AccionPunto, EstadoPunto>>>> = {
  pendiente: { abrir: 'abierto' },
  abierto: { cerrar: 'cerrado' },
  cerrado: {},
}

const ETIQUETAS_PUNTO: Readonly<Record<EstadoPunto, string>> = {
  pendiente: 'pendiente',
  abierto: 'abierto',
  cerrado: 'cerrado',
}

export function transicionPunto(desde: EstadoPunto, accion: AccionPunto): EstadoPunto {
  const hacia = PUNTO[desde][accion]
  if (!hacia) throw new TransicionInvalida('Un punto', ETIQUETAS_PUNTO[desde], accion)
  return hacia
}

const ACTA: Readonly<Record<EstadoActa, Partial<Record<AccionActa, EstadoActa>>>> = {
  en_redaccion: { enviar: 'a_firmar' },
  a_firmar: { completar_firmas: 'firmada' },
  firmada: {},
}

const ETIQUETAS_ACTA: Readonly<Record<EstadoActa, string>> = {
  en_redaccion: 'en redacción',
  a_firmar: 'a firmar',
  firmada: 'firmada',
}

export function transicionActa(desde: EstadoActa, accion: AccionActa): EstadoActa {
  const hacia = ACTA[desde][accion]
  if (!hacia) throw new TransicionInvalida('Un acta', ETIQUETAS_ACTA[desde], accion)
  return hacia
}
