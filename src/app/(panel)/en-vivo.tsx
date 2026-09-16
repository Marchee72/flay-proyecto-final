'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Refresca la pagina cada pocos segundos mientras esta montado. Se monta solo
 * cuando hay algo en proceso, asi que deja de sondear al terminar; con la
 * pestaña oculta no pide nada.
 *
 * No solo mira: cada refresco es un pedido al panel, y el armazon del panel
 * drena la cola en `after()`. Mientras la pestaña esta abierta, el sondeo es
 * lo que hace avanzar la extraccion; sin cron ni proceso aparte (FR-006b).
 */
export function EnVivo({ cadaMs = 3000 }: { cadaMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const tic = () => {
      if (!document.hidden) router.refresh()
    }
    const temporizador = setInterval(tic, cadaMs)
    return () => clearInterval(temporizador)
  }, [router, cadaMs])
  return null
}
