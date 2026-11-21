'use client'

import { useActionState, useState } from 'react'

import type { InquilinoDeUnidad } from '@/aplicacion/consorcios/inquilinos'
import { errorDeFinDeAlquiler } from '@/aplicacion/consorcios/inquilinos-reglas'

import { BotonModal } from '../../../modal'
import { accionTerminarAlquiler, type Resultado } from './acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

/** Modal para fijar o correr el último día de un alquiler (RF-03, RN-24). */
export function ModalTerminarAlquiler({
  consorcioId,
  inquilino,
  volver,
  hoy,
}: {
  consorcioId: string
  inquilino: InquilinoDeUnidad
  volver: 'unidades' | 'mis-unidades'
  hoy: string
}) {
  return (
    <BotonModal
      etiqueta="Terminar alquiler"
      titulo={`Terminar el alquiler de ${inquilino.nombre}`}
      variante="boton--fantasma"
    >
      <FormularioTerminarAlquiler
        consorcioId={consorcioId}
        inquilino={inquilino}
        volver={volver}
        hoy={hoy}
      />
    </BotonModal>
  )
}

function FormularioTerminarAlquiler({
  consorcioId,
  inquilino,
  volver,
  hoy,
}: {
  consorcioId: string
  inquilino: InquilinoDeUnidad
  volver: 'unidades' | 'mis-unidades'
  hoy: string
}) {
  const [estado, accion, enviando] = useActionState(accionTerminarAlquiler, SIN_ERROR)
  const valorInicial =
    estado.valores?.hasta ?? inquilino.hasta ?? (hoy >= inquilino.desde ? hoy : inquilino.desde)
  const [hasta, setHasta] = useState(valorInicial)
  const hayError = estado.mensaje !== ''
  const errorHasta = errorDeFinDeAlquiler(inquilino.desde, hasta)

  const idDe = (campo: string) => `${campo}-${inquilino.ocupacionId}`
  const idError = idDe('error-terminar')
  const idErrorHasta = `error-hasta-${inquilino.ocupacionId}`

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name="ocupacion" value={inquilino.ocupacionId} />
      <input type="hidden" name="volver" value={volver} />

      <p className="apagado">
        {inquilino.nombre} deja de tener acceso al consorcio desde el día siguiente, salvo que ocupe
        otra unidad.
      </p>

      <div className="campo">
        <label htmlFor={idDe('hasta')}>Último día</label>
        <input
          id={idDe('hasta')}
          name="hasta"
          type="date"
          min={inquilino.desde}
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          required
          aria-invalid={errorHasta !== null || hayError || undefined}
          aria-describedby={errorHasta ? idErrorHasta : hayError ? idError : undefined}
        />
        {errorHasta && (
          <p className="error" id={idErrorHasta}>
            {errorHasta}
          </p>
        )}
      </div>

      {hayError && (
        <p className="error" id={idError} role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Confirmar'}
      </button>
    </form>
  )
}
