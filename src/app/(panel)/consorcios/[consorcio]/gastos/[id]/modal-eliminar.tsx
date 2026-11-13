'use client'

import { useActionState } from 'react'

import { BotonModal } from '../../../../modal'
import { accionEliminarGasto, type Resultado } from '../acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

/** «Eliminar» un gasto, con confirmación en modal (nunca `confirm()`). */
export function ModalEliminar({
  consorcioId,
  gastoId,
  importe,
}: {
  consorcioId: string
  gastoId: string
  /** Ya formateado para mostrar. */
  importe: string
}) {
  return (
    <BotonModal etiqueta="Eliminar" titulo="Eliminar gasto" variante="boton--peligro">
      <FormularioEliminar consorcioId={consorcioId} gastoId={gastoId} importe={importe} />
    </BotonModal>
  )
}

function FormularioEliminar({
  consorcioId,
  gastoId,
  importe,
}: {
  consorcioId: string
  gastoId: string
  importe: string
}) {
  const [estado, accion, enviando] = useActionState(accionEliminarGasto, SIN_ERROR)

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name="gasto" value={gastoId} />

      <p>¿Eliminar este gasto de {importe}?</p>

      {estado.mensaje !== '' && (
        <p className="error" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--peligro" type="submit" disabled={enviando}>
        {enviando ? 'Eliminando…' : 'Eliminar gasto'}
      </button>
    </form>
  )
}
