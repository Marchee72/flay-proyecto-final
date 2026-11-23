'use client'

import { useEffect, useRef } from 'react'
import { CalendarPlus, ChevronDown } from 'lucide-react'

/**
 * «Agregar al calendario»: un `<details>` nativo con un enlace por calendario
 * (FR-007). Apple y cualquier otro leen el `.ics`. Se cierra con un clic afuera
 * y con Escape, igual que el menú de tres puntos.
 */
export function MenuCalendario({
  enlaces,
  icsHref,
}: {
  enlaces: { google: string; outlook: string; microsoft365: string; yahoo: string }
  icsHref: string
}) {
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

  const externos = [
    ['Google Calendar', enlaces.google],
    ['Outlook', enlaces.outlook],
    ['Microsoft 365', enlaces.microsoft365],
    ['Yahoo Calendar', enlaces.yahoo],
  ] as const

  return (
    <details ref={menu} className="menu-calendario">
      <summary role="button" className="boton boton--fantasma">
        <CalendarPlus className="icono" aria-hidden="true" />
        Agregar al calendario
        <ChevronDown className="icono" aria-hidden="true" />
      </summary>
      <div className="menu-calendario__panel">
        {externos.map(([nombre, href]) => (
          <a key={nombre} href={href} target="_blank" rel="noopener noreferrer">
            {nombre}
          </a>
        ))}
        <a href={icsHref}>Apple Calendar y otros (.ics)</a>
      </div>
    </details>
  )
}
