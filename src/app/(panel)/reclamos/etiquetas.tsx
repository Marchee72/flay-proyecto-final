import {
  BadgeCheck,
  Circle,
  CircleDot,
  Flame,
  Minus,
  Siren,
  TriangleAlert,
  UserCheck,
  Wrench,
  XCircle,
} from 'lucide-react'

import { ETIQUETAS_ESTADO } from '@/aplicacion/reclamos/estados'

/**
 * Estado y urgencia del reclamo: color + icono + palabra, nunca color solo
 * (guia § 3.2). Solo presentacion.
 */

const ESTADO: Record<string, { clase: string; Icono: typeof Circle }> = {
  abierto: { clase: 'etiqueta--propietario', Icono: CircleDot },
  asignado: { clase: 'etiqueta--pendiente', Icono: UserCheck },
  en_curso: { clase: 'etiqueta--pendiente', Icono: Wrench },
  resuelto: { clase: 'etiqueta--rendido', Icono: BadgeCheck },
  cerrado: { clase: 'etiqueta--rendido', Icono: BadgeCheck },
  rechazado: { clase: 'etiqueta--vencido', Icono: XCircle },
}

export function EstadoDeReclamo({ estado }: { estado: string }) {
  const { clase, Icono } = ESTADO[estado] ?? { clase: 'etiqueta--pendiente', Icono: Circle }
  return (
    <span className={`etiqueta ${clase}`}>
      <Icono className="icono" aria-hidden="true" />
      {ETIQUETAS_ESTADO[estado as keyof typeof ETIQUETAS_ESTADO] ?? estado}
    </span>
  )
}

const URGENCIA: Record<string, { clase: string; texto: string; Icono: typeof Circle }> = {
  baja: { clase: 'urgencia--aldia', texto: 'Baja', Icono: Minus },
  media: { clase: 'urgencia--ordinaria', texto: 'Media', Icono: Circle },
  alta: { clase: 'urgencia--alta', texto: 'Alta', Icono: TriangleAlert },
  critica: { clase: 'urgencia--urgente', texto: 'Crítica', Icono: Flame },
}

export function UrgenciaDeReclamo({ urgencia }: { urgencia: string }) {
  const { clase, texto, Icono } = URGENCIA[urgencia] ?? {
    clase: 'urgencia--ordinaria',
    texto: urgencia,
    Icono: Siren,
  }
  return (
    <span className={`urgencia ${clase}`}>
      <Icono className="icono" aria-hidden="true" />
      {texto}
    </span>
  )
}
