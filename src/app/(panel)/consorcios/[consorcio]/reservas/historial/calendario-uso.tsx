import { TablaDesplazable } from '../../../../tabla-desplazable'
import type { Calendario } from './calendario'

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/**
 * Calendario de uso de los espacios comunes (RF-15): grilla mensual con las
 * reservas de cada día y los días deshabilitados sombreados, con su motivo. Es
 * el panorama; la tabla de abajo da el detalle. Desplaza a lo ancho en teléfono
 * (RNF-01) para no romper la grilla de siete columnas.
 */
export function CalendarioUso({ calendario }: { calendario: Calendario }) {
  return (
    <TablaDesplazable tabIndex={0} role="region" aria-label="Calendario de uso">
      <table className="calendario">
        <thead>
          <tr>
            {DIAS.map((d) => (
              <th key={d} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {calendario.semanas.map((semana, i) => (
            <tr key={i}>
              {semana.map((dia, j) =>
                dia.fecha === null ? (
                  <td key={j} className="calendario__vacio" aria-hidden="true" />
                ) : (
                  <td
                    key={j}
                    className={`calendario__dia${dia.deshabilitado ? ' calendario__dia--off' : ''}${
                      dia.hoy ? ' calendario__dia--hoy' : ''
                    }`}
                  >
                    <span className="calendario__numero">{dia.dia}</span>
                    {dia.deshabilitado && (
                      <span className="calendario__off" title={dia.motivos.join(' · ')}>
                        Deshabilitado{dia.motivos.length > 0 && `: ${dia.motivos.join(' · ')}`}
                      </span>
                    )}
                    <ul className="calendario__eventos">
                      {dia.reservas.map((r) => (
                        <li
                          key={r.id}
                          className={`calendario__evento${
                            r.estado === 'cancelada' || r.estado === 'rechazada'
                              ? ' calendario__evento--anulado'
                              : ''
                          }`}
                        >
                          <span className="calendario__hora">{r.hora}</span> {r.espacio} ·{' '}
                          {r.unidad}
                        </li>
                      ))}
                    </ul>
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </TablaDesplazable>
  )
}
