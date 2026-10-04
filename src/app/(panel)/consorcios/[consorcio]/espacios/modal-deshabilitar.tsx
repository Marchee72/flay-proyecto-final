'use client'

import { useActionState } from 'react'

import { BotonModal } from '../../../modal'
import { accionDeshabilitarEspacio, type Resultado } from '../reservas/acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

/**
 * Deshabilitar un espacio comun desde un modal (`RF-15`): motivo (reforma,
 * suspensión…) y una fecha de fin opcional. Avisa que las reservas de la
 * ventana se cancelan. El alta/edición viven en `ModalEspacio`; esto es la
 * acción de riesgo, aparte.
 */
export function ModalDeshabilitar({
  consorcioId,
  espacio,
}: {
  consorcioId: string
  espacio: { id: string; nombre: string }
}) {
  return (
    <BotonModal
      etiqueta="Deshabilitar"
      titulo={`Deshabilitar ${espacio.nombre}`}
      variante="boton--peligro"
    >
      <FormularioDeshabilitar consorcioId={consorcioId} espacio={espacio} />
    </BotonModal>
  )
}

function FormularioDeshabilitar({
  consorcioId,
  espacio,
}: {
  consorcioId: string
  espacio: { id: string; nombre: string }
}) {
  const [estado, accion, enviando] = useActionState(accionDeshabilitarEspacio, SIN_ERROR)
  const hayError = estado.mensaje !== ''
  const sufijo = espacio.id

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name="espacio" value={espacio.id} />
      <p className="ayuda">
        Las reservas confirmadas que caigan en el período se cancelan y se avisa a quien las hizo.
      </p>
      <div className="campo">
        <label htmlFor={`motivo-${sufijo}`}>Motivo</label>
        <textarea
          id={`motivo-${sufijo}`}
          name="motivo"
          rows={2}
          maxLength={200}
          required
          placeholder="Reforma del salón, suspensión por daños…"
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? `error-${sufijo}` : undefined}
        />
      </div>
      <div className="campo">
        <label htmlFor={`hasta-${sufijo}`}>Hasta (opcional)</label>
        <input id={`hasta-${sufijo}`} name="hasta" type="date" />
        <p className="ayuda">Dejalo vacío si no sabés cuándo vuelve a habilitarse.</p>
      </div>
      {hayError && (
        <p className="error" id={`error-${sufijo}`} role="alert">
          {estado.mensaje}
        </p>
      )}
      <button className="boton boton--peligro" type="submit" disabled={enviando}>
        {enviando ? 'Deshabilitando…' : 'Deshabilitar espacio'}
      </button>
    </form>
  )
}
