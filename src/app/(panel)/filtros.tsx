'use client'

import { useEffect, useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'

/**
 * Filtros de un listado (RNF-01): en escritorio el formulario va en linea,
 * como siempre; en telefono queda detras de un chip «Filtros» y se abre como
 * hoja inferior, para que los datos aparezcan antes que los controles.
 *
 * Es un `<details>`: abierto al llegar (asi el servidor y el escritorio lo
 * muestran sin JavaScript) y se cierra al montar solo en telefono. Enviar el
 * formulario recarga la pagina, que vuelve a arrancar cerrado.
 */
export function Filtros({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(true)

  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) setAbierto(false)
  }, [])

  return (
    <details
      className="filtros"
      open={abierto}
      onToggle={(evento) => setAbierto(evento.currentTarget.open)}
      onKeyDown={(evento) => {
        if (evento.key === 'Escape') setAbierto(false)
      }}
    >
      <summary className="chip">
        <SlidersHorizontal className="icono" aria-hidden="true" />
        Filtros
      </summary>
      <div className="filtros__hoja">
        <div className="filtros__encabezado">
          <h2 className="modal__titulo">Filtros</h2>
          <button
            type="button"
            className="boton boton--cerrar"
            aria-label="Cerrar"
            onClick={() => setAbierto(false)}
          >
            <X className="icono" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </details>
  )
}
