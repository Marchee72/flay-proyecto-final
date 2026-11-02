'use client'

import { useEffect } from 'react'

/**
 * Al abrir un consorcio, lo recuerda como el ultimo usado. Va en un efecto a
 * proposito: una precarga dibuja el layout en el servidor pero no lo monta,
 * asi que solo cuenta el que de verdad se abrio. `keepalive` lo deja terminar
 * aunque se navegue enseguida. Si falla, `/` va al recordado anterior: nada
 * que avisar.
 */
export function RecordarConsorcio({ id }: { id: string }) {
  useEffect(() => {
    fetch('/api/consorcio-activo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consorcioId: id }),
      keepalive: true,
    }).catch(() => {})
  }, [id])
  return null
}
