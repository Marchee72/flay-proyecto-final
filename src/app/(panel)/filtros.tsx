'use client'

import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'

/**
 * Filtros de un listado (RNF-01): en escritorio el formulario va en linea,
 * como siempre; en telefono queda detras de un chip «Filtros» y se abre como
 * hoja inferior, para que los datos aparezcan antes que los controles.
 *
 * Es un `<details>`: abierto al llegar (asi el servidor y el escritorio lo
 * muestran sin JavaScript) y se cierra al montar solo en telefono. Enviar el
 * formulario recarga la pagina, que vuelve a arrancar cerrado.
 *
 * En escritorio y con JavaScript el filtro se aplica al cambiar el control
 * (evento `change` nativo): el `<select>`, el mes y la fecha al elegir; el
 * texto al salir del campo o con Enter. El boton «Filtrar» sobra entonces y se
 * esconde (`data-auto`). En la hoja del telefono se siguen tocando varios
 * filtros y recien el boton aplica, para no cerrar la hoja en cada cambio; sin
 * JavaScript el boton es la unica forma y siempre esta.
 */
export function Filtros({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(true)
  const [auto, setAuto] = useState(false)
  const raiz = useRef<HTMLDetailsElement | null>(null)

  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      setAbierto(false)
      return
    }
    setAuto(true)
    const detalle = raiz.current
    if (!detalle) return
    const alCambiar = (evento: Event) => {
      ;(evento.target as HTMLElement).closest('form')?.requestSubmit()
    }
    detalle.addEventListener('change', alCambiar)
    return () => detalle.removeEventListener('change', alCambiar)
  }, [])

  return (
    <details
      ref={raiz}
      className="filtros"
      data-auto={auto || undefined}
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
