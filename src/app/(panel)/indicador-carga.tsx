'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Barra superior delgada que reacciona instantáneamente a los clics de navegación (<Link>)
 * dentro de la aplicación, confirmando visualmente al usuario que la acción fue registrada
 * mientras Next.js resuelve la página en segundo plano (RNF-06).
 */
export function IndicadorCarga() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [cargando, setCargando] = useState(false)

  // Cada vez que cambia la ruta o los parámetros, la navegación finalizó
  useEffect(() => {
    setCargando(false)
  }, [pathname, searchParams])

  useEffect(() => {
    const alHacerClic = (evento: MouseEvent) => {
      const objetivo = (evento.target as HTMLElement).closest('a')
      if (!objetivo || objetivo.target === '_blank' || evento.defaultPrevented) return
      if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return

      const urlDestino = objetivo.getAttribute('href')
      if (
        !urlDestino ||
        urlDestino.startsWith('#') ||
        urlDestino.startsWith('mailto:') ||
        urlDestino.startsWith('tel:')
      ) {
        return
      }

      try {
        const destino = new URL(urlDestino, window.location.href)
        if (destino.origin === window.location.origin) {
          const actual = window.location.pathname + window.location.search
          const siguiente = destino.pathname + destino.search
          if (actual !== siguiente) {
            setCargando(true)
          }
        }
      } catch {
        // Enlace relativo inválido; el navegador lo resolverá
      }
    }

    document.addEventListener('click', alHacerClic, { capture: true })
    return () => document.removeEventListener('click', alHacerClic, { capture: true })
  }, [])

  if (!cargando) return null

  return (
    <div className="barra-carga" role="progressbar" aria-label="Cargando página" aria-busy="true">
      <div className="barra-carga__progreso" />
    </div>
  )
}
