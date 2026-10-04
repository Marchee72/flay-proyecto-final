'use client'

import { X } from 'lucide-react'

import { accionDescartarNovedad } from './acciones'

/**
 * El aspa de la fila de novedades del inicio: la saca de ahi para quien la
 * aprieta (en la seccion Novedades sigue estando, que es el archivo).
 *
 * El descarte tarda lo que tarda el servidor, asi que la fila se va antes: al
 * apretar se le pone `.descartandose` al `<article>` y la animacion corre
 * mientras la accion viaja. Queda guardado en `NovedadDescartada`, de modo que
 * no vuelve a aparecer en el proximo ingreso.
 */
export function DescartarNovedad({
  consorcioId,
  novedadId,
}: {
  consorcioId: string
  novedadId: string
}) {
  return (
    <form action={accionDescartarNovedad}>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name="novedad" value={novedadId} />
      <button
        type="submit"
        className="boton boton--terciario boton--aspa"
        aria-label="Descartar"
        onClick={(evento) =>
          evento.currentTarget.closest('article')?.classList.add('descartandose')
        }
      >
        <X className="icono" aria-hidden="true" />
      </button>
    </form>
  )
}
