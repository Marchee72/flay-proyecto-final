'use client'

import { X } from 'lucide-react'

import { accionDescartarNovedad } from './acciones'

/**
 * «Descartar» tarda lo que tarda el servidor, asi que la fila se va antes: al
 * apretar se le pone `.descartandose` y la animacion corre mientras la accion
 * viaja. El descarte queda guardado (`NovedadDescartada`), de modo que no
 * vuelve a aparecer en el proximo ingreso.
 */
export function DescartarNovedad({
  consorcioId,
  novedadId,
  soloIcono = false,
}: {
  consorcioId: string
  novedadId: string
  /** En el resumen el boton es un aspa al costado; en la seccion lleva texto. */
  soloIcono?: boolean
}) {
  return (
    <form action={accionDescartarNovedad}>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name="novedad" value={novedadId} />
      <button
        type="submit"
        className={soloIcono ? 'boton boton--terciario boton--aspa' : 'boton boton--fantasma'}
        aria-label={soloIcono ? 'Descartar' : undefined}
        onClick={(evento) =>
          evento.currentTarget.closest('article')?.classList.add('descartandose')
        }
      >
        <X className="icono" aria-hidden="true" />
        {!soloIcono && 'Descartar'}
      </button>
    </form>
  )
}
