'use client'

import { Trash2 } from 'lucide-react'
import { useActionState } from 'react'

import { BotonModal } from '../../../../modal'
import { accionEliminarGasto, type Resultado } from '../acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

/** «Eliminar» un gasto, con confirmación en modal (nunca `confirm()`). */
export function ModalEliminar({
  consorcioId,
  gastoId,
  importe,
  comprobantes = 0,
}: {
  consorcioId: string
  gastoId: string
  /** Ya formateado para mostrar. */
  importe: string
  /** Los que se borran con el gasto: se avisa antes de confirmar. */
  comprobantes?: number
}) {
  return (
    <BotonModal
      etiqueta={<Trash2 className="icono" aria-hidden="true" />}
      nombre="Eliminar gasto"
      claseBoton="boton--icono"
      titulo="Eliminar gasto"
      variante="boton--peligro"
    >
      <FormularioEliminar
        consorcioId={consorcioId}
        gastoId={gastoId}
        importe={importe}
        comprobantes={comprobantes}
      />
    </BotonModal>
  )
}

function FormularioEliminar({
  consorcioId,
  gastoId,
  importe,
  comprobantes,
}: {
  consorcioId: string
  gastoId: string
  importe: string
  comprobantes: number
}) {
  const [estado, accion, enviando] = useActionState(accionEliminarGasto, SIN_ERROR)

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name="gasto" value={gastoId} />

      <p>¿Eliminar este gasto de {importe}?</p>
      {comprobantes > 0 && (
        <p className="apagado">
          También se{' '}
          {comprobantes === 1 ? 'borra su comprobante' : `borran sus ${comprobantes} comprobantes`}.
          No se puede deshacer.
        </p>
      )}

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
