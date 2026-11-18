'use client'

import { useId, useRef } from 'react'

/**
 * Detalle de períodos vencidos de un deudor como tooltip (`FR-029`, `RNF-01`).
 * Se abre al pasar el mouse, al enfocar o al tocar, y se cierra con Escape o
 * tocando afuera: es un `popover="auto"` nativo, que además deja uno solo
 * abierto a la vez. Los textos llegan ya formateados desde el servidor (los
 * importes viajan como cadena, § 14.1).
 */
export function DetallePeriodos({
  resumen,
  periodos,
}: {
  resumen: string
  periodos: { periodo: string; vence: string; saldo: string }[]
}) {
  const id = useId()
  const boton = useRef<HTMLButtonElement | null>(null)
  const globo = useRef<HTMLDivElement | null>(null)

  const mostrar = () => {
    const el = globo.current
    const ancla = boton.current
    if (!el || !ancla) return
    try {
      el.showPopover()
    } catch {
      return // ya estaba abierto
    }
    // Debajo del botón, sin salirse de la pantalla. `position: fixed` viene del CSS.
    const r = ancla.getBoundingClientRect()
    const izquierda = Math.max(8, Math.min(r.left, window.innerWidth - el.offsetWidth - 8))
    el.style.top = `${r.bottom + 4}px`
    el.style.left = `${izquierda}px`
  }
  const ocultar = () => {
    try {
      globo.current?.hidePopover()
    } catch {
      // ya estaba cerrado
    }
  }

  return (
    <>
      <button
        ref={boton}
        type="button"
        className="boton boton--terciario"
        aria-describedby={id}
        onMouseEnter={mostrar}
        onMouseLeave={ocultar}
        onFocus={mostrar}
        onBlur={ocultar}
        onClick={mostrar}
      >
        {resumen}
      </button>
      <div ref={globo} id={id} popover="auto" role="tooltip" className="tooltip">
        <ul className="lista-simple">
          {periodos.map((p) => (
            <li key={p.periodo}>
              <span>
                {p.periodo} <span className="ayuda">venció {p.vence}</span>
              </span>
              <span className="cifra">{p.saldo}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
