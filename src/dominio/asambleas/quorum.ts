import type { Decimal } from '@/compartido/dinero'

/**
 * Quórum y convocatoria que rige (FR-017, art. 20 del reglamento, research
 * R-11). Lo decide el reloj, no quien dirige: en primera convocatoria hace
 * falta más de la mitad de los coeficientes; media hora después, sesiona con
 * los presentes, siempre que haya al menos una unidad que pueda votar.
 */

export type Convocatoria = 'primera' | 'segunda'

export const MINUTOS_HASTA_SEGUNDA = 30

export const segundaConvocatoria = (fechaHora: Date): Date =>
  new Date(fechaHora.getTime() + MINUTOS_HASTA_SEGUNDA * 60_000)

/** Más de la mitad, sin dividir: `presente × 2 > total`. */
export const hayQuorumDePrimera = (presente: Decimal, total: Decimal): boolean =>
  presente.times(2).greaterThan(total)

export function puedeConstituir(args: {
  ahora: Date
  fechaHora: Date
  coeficientePresente: Decimal
  coeficienteTotal: Decimal
  presentesConVoto: number
}): { puede: true; rige: Convocatoria } | { puede: false; motivo: 'antes_de_hora' | 'sin_quorum' } {
  if (args.ahora < args.fechaHora) return { puede: false, motivo: 'antes_de_hora' }
  if (args.presentesConVoto === 0) return { puede: false, motivo: 'sin_quorum' }
  if (hayQuorumDePrimera(args.coeficientePresente, args.coeficienteTotal)) {
    return { puede: true, rige: 'primera' }
  }
  if (args.ahora >= segundaConvocatoria(args.fechaHora)) return { puede: true, rige: 'segunda' }
  return { puede: false, motivo: 'sin_quorum' }
}
