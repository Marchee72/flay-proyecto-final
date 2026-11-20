'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Ellipsis } from 'lucide-react'

/**
 * Menú de tres puntitos de una tarjeta: un `<details>` nativo que además se cierra
 * con un clic afuera y con Escape (el foco vuelve al disparador).
 */
export function MenuPuntos({ nombre, children }: { nombre: string; children: ReactNode }) {
  const menu = useRef<HTMLDetailsElement | null>(null)

  useEffect(() => {
    const afuera = (evento: PointerEvent) => {
      const el = menu.current
      if (el?.open && !el.contains(evento.target as Node)) el.open = false
    }
    const escape = (evento: KeyboardEvent) => {
      const el = menu.current
      if (evento.key !== 'Escape' || !el?.open) return
      el.open = false
      el.querySelector('summary')?.focus()
    }
    document.addEventListener('pointerdown', afuera)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', afuera)
      document.removeEventListener('keydown', escape)
    }
  }, [])

  return (
    <details ref={menu} className="menu-puntos">
      <summary role="button" className="boton boton--terciario boton--icono" aria-label={nombre}>
        <Ellipsis className="icono" aria-hidden="true" />
      </summary>
      <div className="menu-puntos__panel">{children}</div>
    </details>
  )
}
