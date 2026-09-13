import { TriangleAlert } from 'lucide-react'

import type { Alerta } from '@/aplicacion/indicadores/indicadores'

/** Las alertas de FR-023, como lista legible; sin alertas, una linea que lo dice. */
export function Alertas({ alertas }: { alertas: Alerta[] }) {
  if (alertas.length === 0) return <p className="ayuda">Sin alertas en este momento.</p>
  return (
    <ul className="alertas" aria-label="Alertas">
      {alertas.map((a, i) => (
        <li key={i} className="aviso aviso--atencion">
          <TriangleAlert className="icono" aria-hidden="true" />
          <span>{a.texto}</span>
        </li>
      ))}
    </ul>
  )
}

export const etiquetaDePeriodo = (anio: number, mes: number) =>
  `${String(mes).padStart(2, '0')}/${anio}`
