import { fechaParaMostrar } from '@/compartido/formato'
import type { VistaOcupantes } from '@/aplicacion/consorcios/inquilinos'

import { ModalAsignarInquilino } from './modal-asignar-inquilino'
import { ModalTerminarAlquiler } from './modal-terminar-alquiler'

/**
 * Celda reutilizable de inquilinos por unidad (RF-03). La comparten la tabla
 * de Unidades (administrador y consejo) y Mis unidades (propietario).
 */
export function CeldaInquilino({
  consorcioId,
  unidad,
  gestiona,
  volver,
  hoy,
}: {
  consorcioId: string
  unidad: Pick<VistaOcupantes['unidades'][number], 'unidadId' | 'designacion' | 'inquilinos'>
  gestiona: boolean
  volver: 'unidades' | 'mis-unidades'
  hoy: string
}) {
  const puedeAsignar = gestiona && unidad.inquilinos.every((i) => i.hasta !== null)

  if (unidad.inquilinos.length === 0 && !puedeAsignar) {
    return <span className="apagado">—</span>
  }

  return (
    <div className="celda-inquilino">
      {unidad.inquilinos.map((inquilino) => (
        <div key={inquilino.ocupacionId} className="celda-inquilino__fila">
          <span>
            {inquilino.nombre} · {fechaParaMostrar(inquilino.desde)} –{' '}
            {inquilino.hasta ? fechaParaMostrar(inquilino.hasta) : 'sin fecha'}
          </span>
          {gestiona && (
            <ModalTerminarAlquiler
              consorcioId={consorcioId}
              inquilino={inquilino}
              volver={volver}
              hoy={hoy}
            />
          )}
        </div>
      ))}
      {puedeAsignar && (
        <div className="celda-inquilino__fila">
          {unidad.inquilinos.length === 0 && <span className="apagado">—</span>}
          <ModalAsignarInquilino
            consorcioId={consorcioId}
            unidadId={unidad.unidadId}
            designacion={unidad.designacion}
            volver={volver}
            hoy={hoy}
          />
        </div>
      )}
    </div>
  )
}
