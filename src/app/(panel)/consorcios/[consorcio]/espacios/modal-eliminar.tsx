'use client'

import { BotonModal } from '../../../modal'
import { accionEliminarEspacio } from '../reservas/acciones'

/** Eliminar un espacio comun (`RF-15`): confirmacion en modal; sin reservas se borra, con reservas se archiva (`RN-22`). */
export function ModalEliminar({
  consorcioId,
  espacio,
}: {
  consorcioId: string
  espacio: { id: string; nombre: string; reservasEnHistorial: number }
}) {
  const archiva = espacio.reservasEnHistorial > 0
  const etiqueta = archiva ? 'Archivar' : 'Eliminar'
  return (
    <BotonModal etiqueta="Eliminar" titulo={`Eliminar ${espacio.nombre}`} variante="boton--peligro">
      <form action={accionEliminarEspacio}>
        <input type="hidden" name="consorcio" value={consorcioId} />
        <input type="hidden" name="espacio" value={espacio.id} />
        <p className="ayuda">
          {archiva
            ? `Tiene ${espacio.reservasEnHistorial} reservas en su historial: se va a archivar y lo vas a encontrar en Eliminados, desde donde podés restaurarlo.`
            : 'Este espacio no tiene reservas: se va a borrar definitivamente.'}
          {archiva && ' A quienes tengan reservas futuras se les avisa.'}
        </p>
        <button className="boton boton--peligro" type="submit">
          {etiqueta}
        </button>
      </form>
    </BotonModal>
  )
}
