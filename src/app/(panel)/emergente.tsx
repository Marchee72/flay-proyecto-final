'use client'

import { useEffect, useState } from 'react'
import { BadgeCheck, Siren, TriangleAlert, X } from 'lucide-react'

const ICONO = { verde: BadgeCheck, ambar: TriangleAlert, rojo: Siren }

/**
 * El resultado de una accion, como aviso emergente (toast) abajo a la
 * izquierda: reusa el `.emergente` de la campana, se va solo a los 8 s y se
 * puede cerrar antes. La pagina lo dibuja cuando ve su bandera en la URL
 * (`?guardado=1`, `?error=...`); antes ese mismo texto era una franja arriba.
 * El texto lo pone quien llama y el tono elige color e icono del semaforo
 * (guia §3.4): verde salio bien, ambar hay que mirar, rojo fallo.
 */
export function Emergente({
  tono,
  children,
}: {
  tono: 'verde' | 'ambar' | 'rojo'
  children: React.ReactNode
}) {
  const [visible, setVisible] = useState(true)
  const Icono = ICONO[tono]

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 8000)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  return (
    // Rojo es un fallo: se anuncia asertivo (`alert`); lo demas, cortes (`status`).
    <div className="emergente emergente--accion" role={tono === 'rojo' ? 'alert' : 'status'}>
      <span className={`aviso-tono aviso-tono--${tono}`}>
        <Icono className="icono" aria-hidden="true" />
      </span>
      <span className="emergente__texto">
        <strong>{children}</strong>
      </span>
      <button
        type="button"
        className="panel__icono"
        aria-label="Cerrar aviso"
        onClick={() => setVisible(false)}
      >
        <X className="icono" aria-hidden="true" />
      </button>
    </div>
  )
}
