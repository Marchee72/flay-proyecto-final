import type { VistaAsamblea } from '@/aplicacion/asambleas/ver'

type Estado = VistaAsamblea['estado']

const ETIQUETA: Record<Estado, { texto: string; clase: string }> = {
  borrador: { texto: 'Borrador', clase: 'etiqueta--pendiente' },
  convocada: { texto: 'Convocada', clase: 'etiqueta--info' },
  en_curso: { texto: 'En curso', clase: 'etiqueta--info' },
  finalizada: { texto: 'Finalizada', clase: 'etiqueta--rendido' },
  acta_firmada: { texto: 'Acta firmada', clase: 'etiqueta--rendido' },
  cancelada: { texto: 'Cancelada', clase: 'etiqueta--vencido' },
}

export function EtiquetaEstado({ estado }: { estado: Estado }) {
  return <span className={`etiqueta ${ETIQUETA[estado].clase}`}>{ETIQUETA[estado].texto}</span>
}
