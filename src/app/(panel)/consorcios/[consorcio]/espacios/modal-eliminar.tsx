'use client'

import { BotonModal } from '../../../modal'
import { accionEliminarEspacio } from '../reservas/acciones'

/** Eliminar un espacio comun (`RF-15`): confirmacion en modal; solo prospera sin reservas en el historial. */
export function ModalEliminar({
  consorcioId,
  espacio,
}: {
  consorcioId: string
  espacio: { id: string; nombre: string }
}) {
  return (
    <BotonModal etiqueta="Eliminar" titulo={`Eliminar ${espacio.nombre}`} variante="boton--peligro">
      <form action={accionEliminarEspacio}>
        <input type="hidden" name="consorcio" value={consorcioId} />
        <input type="hidden" name="espacio" value={espacio.id} />
        <p className="ayuda">
          Se elimina para siempre, junto con su historial de reservas. A quienes tengan reservas
          futuras se les avisa. Si querés conservar el historial, deshabilitalo en su lugar.
        </p>
        <button className="boton boton--peligro" type="submit">
          Eliminar espacio
        </button>
      </form>
    </BotonModal>
  )
}
