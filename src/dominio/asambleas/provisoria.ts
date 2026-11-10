import {
  alcanzaUmbral,
  conteo,
  type Cuenta,
  type Mayoria,
  type UnidadPadron,
  type Voto,
} from '@/dominio/asambleas/resultado'

/**
 * Estado de una decisión provisoria (CCyC art. 2060, FR-027 a FR-029, research
 * R-06). Es **derivado**: no lo escribe ninguna tarea programada, se calcula
 * igual en la pantalla y en el acta.
 *
 * El silencio del ausente es conformidad: cada unidad ausente con voto que no
 * se opuso suma como positiva. Vencido el plazo, si así se alcanza el umbral
 * sobre la totalidad en los dos cómputos, queda firme; si no, cae.
 */

export type EstadoDecision = 'firme' | 'provisoria' | 'caida'

export function estadoDecision(args: {
  provisorio: boolean
  vence: Date | null
  ahora: Date
  padron: UnidadPadron[]
  votos: Voto[]
  /** Unidades que se opusieron dentro del plazo. */
  oposiciones: string[]
  mayoria: Mayoria
}): EstadoDecision {
  if (!args.provisorio) return 'firme'
  if (!args.vence || args.ahora <= args.vence) return 'provisoria'

  const c = conteo(args.padron, args.votos, ['positivo'])
  const opuestas = new Set(args.oposiciones)
  let favor: Cuenta = c.porOpcion.positivo
  for (const u of args.padron) {
    if (u.presente || u.sinVoto || opuestas.has(u.unidadId)) continue
    favor = { unidades: favor.unidades + 1, coeficiente: favor.coeficiente.plus(u.coeficiente) }
  }
  return alcanzaUmbral(favor, c.baseTotal, args.mayoria) ? 'firme' : 'caida'
}
