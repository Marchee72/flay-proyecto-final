'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Refresca la vista de retorno mientras el pago sigue pendiente (`RF-28`).
 *
 * La pagina lo renderiza solo con estado pendiente: al acreditarse, deja de
 * mostrarse y el intervalo se limpia solo. Cubre el webhook demorado o ausente.
 */
export function SondeoPago({
  intentos = 20,
  intervaloMs = 3000,
}: {
  intentos?: number
  intervaloMs?: number
}) {
  const router = useRouter()

  useEffect(() => {
    let hechos = 0
    const id = setInterval(() => {
      hechos += 1
      router.refresh()
      if (hechos >= intentos) clearInterval(id)
    }, intervaloMs)

    return () => clearInterval(id)
  }, [router, intentos, intervaloMs])

  return null
}
