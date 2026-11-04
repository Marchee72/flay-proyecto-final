import { textoAvance } from '@/compartido/avance-asamblea'
import type { PuntoVista, VistaAsamblea } from '@/aplicacion/asambleas/ver'

import { textoResultado } from './comunes'

const CLASE: Record<PuntoVista['estado'], string> = {
  cerrado: 'avance-orden__fila avance-orden__fila--tratado',
  abierto: 'avance-orden__fila avance-orden__fila--ahora',
  pendiente: 'avance-orden__fila',
}

const marca = (p: PuntoVista): string =>
  p.estado === 'cerrado' ? textoResultado(p) : p.estado === 'abierto' ? 'Ahora' : 'Falta'

/** El orden del día con su avance, para todos los que están en la sala (RF-31). */
export function AvanceOrden({ vista }: { vista: VistaAsamblea }) {
  return (
    <section className="tarjeta" aria-labelledby="avance-titulo">
      <h2 id="avance-titulo">Orden del día</h2>
      <p className="apagado">{textoAvance(vista.puntos)}</p>
      <ol className="avance-orden">
        {vista.puntos.map((p) => (
          <li
            key={p.id}
            className={CLASE[p.estado]}
            aria-current={p.estado === 'abierto' ? 'step' : undefined}
          >
            <span className="avance-orden__titulo">
              {p.orden}. {p.titulo}
            </span>
            <strong className="avance-orden__marca">{marca(p)}</strong>
          </li>
        ))}
      </ol>
    </section>
  )
}
