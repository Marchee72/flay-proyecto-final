import { Pin, X } from 'lucide-react'

import { fechaParaMostrar } from '@/compartido/formato'
import type { NovedadDelConsorcio } from '@/aplicacion/comunicacion/novedades'

import { accionDescartarNovedad } from '../../../comunicacion/acciones'

const ESTADO: Record<NovedadDelConsorcio['estado'], { texto: string; clase: string }> = {
  programada: { texto: 'Programada', clase: 'etiqueta--pendiente' },
  vigente: { texto: 'Vigente', clase: 'etiqueta--rendido' },
  vencida: { texto: 'Vencida', clase: 'etiqueta--vencido' },
}

/**
 * Una novedad, en la seccion y en el inicio. «Descartar» la saca de la vista
 * de quien la descarta, en todos lados. Con `conEstado` es la vista de gestion
 * del administrador: todas, con su vigencia, y ahi descartar no cambiaria nada.
 */
export function TarjetaNovedad({
  novedad: n,
  consorcioId,
  conEstado = false,
  Titulo = 'h2',
}: {
  novedad: NovedadDelConsorcio
  consorcioId: string
  conEstado?: boolean
  /** `h3` cuando va dentro de otra seccion, como en el inicio. */
  Titulo?: 'h2' | 'h3'
}) {
  return (
    <article className="tarjeta">
      <Titulo>
        {n.fijada && <Pin className="icono" aria-label="Fijada" />} {n.titulo}
      </Titulo>
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
      {!conEstado && (
        <form action={accionDescartarNovedad}>
          <input type="hidden" name="consorcio" value={consorcioId} />
          <input type="hidden" name="novedad" value={n.id} />
          <button type="submit" className="boton boton--fantasma">
            <X className="icono" aria-hidden="true" />
            Descartar
          </button>
        </form>
      )}
    </article>
  )
}
