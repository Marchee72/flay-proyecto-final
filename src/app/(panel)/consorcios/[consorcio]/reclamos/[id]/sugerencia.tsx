'use client'

import { useActionState } from 'react'

import { accionResolverSugerencia, type Resultado } from '../acciones'
import { UrgenciaDeReclamo } from '../etiquetas'

const SIN_ERROR: Resultado = { mensaje: '' }

/**
 * La sugerencia del triage, aparte del reclamo y con sus dos salidas: aplicar
 * o descartar (`FR-027`). Ninguna cambia el estado.
 */
export function SugerenciaDeTriage({
  consorcioId,
  reclamoId,
  sugerencia,
}: {
  consorcioId: string
  reclamoId: string
  sugerencia: {
    rubro: { id: string; nombre: string } | null
    urgencia: string | null
    proveedor: { id: string; nombre: string } | null
    horasEstimadas: number | null
    confianza: string | null
    aceptada: boolean | null
  }
}) {
  const [estado, accion, enviando] = useActionState(accionResolverSugerencia, SIN_ERROR)

  return (
    <>
      <dl className="definiciones">
        <dt>Rubro</dt>
        <dd>{sugerencia.rubro?.nombre ?? '—'}</dd>
        <dt>Urgencia</dt>
        <dd>{sugerencia.urgencia ? <UrgenciaDeReclamo urgencia={sugerencia.urgencia} /> : '—'}</dd>
        <dt>Proveedor</dt>
        <dd>{sugerencia.proveedor?.nombre ?? '—'}</dd>
        <dt>Estimación</dt>
        <dd>{sugerencia.horasEstimadas != null ? `${sugerencia.horasEstimadas} h` : '—'}</dd>
      </dl>
      <p className="ayuda">
        Es una sugerencia: no cambia nada hasta que la apliques, y aun así el estado y el
        responsable los decidís vos.
        {sugerencia.confianza && ` Confianza ${sugerencia.confianza}.`}
      </p>
      {sugerencia.aceptada === null ? (
        <form action={accion} className="fila-acciones">
          <input type="hidden" name="consorcio" value={consorcioId} />
          <input type="hidden" name="reclamo" value={reclamoId} />
          <button
            className="boton boton--primario"
            type="submit"
            name="decision"
            value="aplicar"
            disabled={enviando}
          >
            Aplicar
          </button>
          <button
            className="boton boton--fantasma"
            type="submit"
            name="decision"
            value="descartar"
            disabled={enviando}
          >
            Descartar
          </button>
          {estado.mensaje && (
            <p className="error" role="alert">
              {estado.mensaje}
            </p>
          )}
        </form>
      ) : (
        <p className="apagado">{sugerencia.aceptada ? 'Aplicada.' : 'Descartada.'}</p>
      )}
    </>
  )
}
