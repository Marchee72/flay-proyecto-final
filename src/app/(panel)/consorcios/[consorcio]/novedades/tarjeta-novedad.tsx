import { Pin } from 'lucide-react'

import { fechaParaMostrar } from '@/compartido/formato'
import type { NovedadDelConsorcio } from '@/aplicacion/comunicacion/novedades'

import { UrgenciaDeReclamo } from '../reclamos/etiquetas'

const ESTADO: Record<NovedadDelConsorcio['estado'], { texto: string; clase: string }> = {
  programada: { texto: 'Programada', clase: 'etiqueta--pendiente' },
  vigente: { texto: 'Vigente', clase: 'etiqueta--rendido' },
  vencida: { texto: 'Vencida', clase: 'etiqueta--vencido' },
}

/**
 * Una novedad en la seccion Novedades. Se muestra plegada —titulo, severidad y
 * a quien va— y se abre con un clic para leer el cuerpo (`<details>` nativo).
 * El borde izquierdo lleva el color de la severidad, con la pastilla al lado
 * para no depender del color solo (guia § 3.2).
 *
 * La seccion es el archivo completo: no se descarta desde aca (descartar vive
 * en el inicio y solo lo quita de ahi). Con `conEstado` es la vista de gestion
 * del administrador: todas, con su vigencia.
 */
export function TarjetaNovedad({
  novedad: n,
  conEstado = false,
  Titulo = 'h2',
}: {
  novedad: NovedadDelConsorcio
  conEstado?: boolean
  /** `h3` cuando va dentro de otra seccion, como en el inicio. */
  Titulo?: 'h2' | 'h3'
}) {
  return (
    <details className={`tarjeta novedad novedad--${n.severidad}`}>
      <summary className="novedad__resumen">
        <Titulo>
          {n.fijada && <Pin className="icono" aria-label="Fijada" />} {n.titulo}
        </Titulo>
        <UrgenciaDeReclamo urgencia={n.severidad} />
      </summary>
      <p className="ayuda">
        {fechaParaMostrar(n.publicadaEn)}
        {n.destinatario && ` · Para: ${n.destinatario}`}
        {conEstado && (
          <>
            {' · '}
            <span className={`etiqueta ${ESTADO[n.estado].clase}`}>
              {ESTADO[n.estado].texto}
            </span>{' '}
            del {fechaParaMostrar(n.vigenteDesde)} al {fechaParaMostrar(n.vigenteHasta)}
          </>
        )}
      </p>
      <p style={{ whiteSpace: 'pre-line' }}>{n.cuerpo}</p>
    </details>
  )
}
