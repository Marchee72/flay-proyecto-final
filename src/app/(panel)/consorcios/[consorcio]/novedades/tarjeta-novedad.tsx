import { Pin } from 'lucide-react'

import { fechaParaMostrar } from '@/compartido/formato'
import type { NovedadDelConsorcio } from '@/aplicacion/comunicacion/novedades'

import { DescartarNovedad } from '../../../comunicacion/descartar-novedad'

const ESTADO: Record<NovedadDelConsorcio['estado'], { texto: string; clase: string }> = {
  programada: { texto: 'Programada', clase: 'etiqueta--pendiente' },
  vigente: { texto: 'Vigente', clase: 'etiqueta--rendido' },
  vencida: { texto: 'Vencida', clase: 'etiqueta--vencido' },
}

/**
 * Una novedad en su seccion. «Descartar» la saca de la vista de quien la
 * descarta, en todos lados. Con `conEstado` es la vista de gestion del
 * administrador: todas, con su vigencia, y ahi descartar no cambiaria nada.
 */
export function TarjetaNovedad({
  novedad: n,
  consorcioId,
  conEstado = false,
}: {
  novedad: NovedadDelConsorcio
  consorcioId: string
  conEstado?: boolean
}) {
  return (
    <article className="tarjeta">
      <h2>
        {n.fijada && <Pin className="icono" aria-label="Fijada" />} {n.titulo}
      </h2>
      <p className="ayuda">
        {fechaParaMostrar(n.publicadaEn)}
        {n.destinatario && ` · Para: ${n.destinatario}`}
        {conEstado && (
          <>
            {' · '}
            <span className={`etiqueta ${ESTADO[n.estado].clase}`}>
              {ESTADO[n.estado].texto}
            </span>{' '}
            {n.vigenteHasta
              ? `del ${fechaParaMostrar(n.vigenteDesde)} al ${fechaParaMostrar(n.vigenteHasta)}`
              : `desde el ${fechaParaMostrar(n.vigenteDesde)} (sin vencimiento)`}
          </>
        )}
      </p>
      <p style={{ whiteSpace: 'pre-line' }}>{n.cuerpo}</p>
      {!conEstado && <DescartarNovedad consorcioId={consorcioId} novedadId={n.id} />}
    </article>
  )
}
