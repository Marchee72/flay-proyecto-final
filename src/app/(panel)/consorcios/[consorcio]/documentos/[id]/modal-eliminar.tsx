import { Trash2 } from 'lucide-react'

import { accionEliminarDocumento } from '../../../../comunicacion/acciones'
import { BotonModal } from '../../../../modal'

/** Baja del documento desde un modal de confirmación (`RF-19`): solo el administrador la ve. */
export function ModalEliminar({
  consorcioId,
  documentoId,
  titulo,
}: {
  consorcioId: string
  documentoId: string
  /** El nombre, para que en una tabla se sepa cuál se elimina. */
  titulo?: string
}) {
  return (
    <BotonModal
      etiqueta={<Trash2 className="icono" aria-hidden="true" />}
      nombre={titulo ? `Eliminar «${titulo}»` : 'Eliminar'}
      claseBoton="boton--icono"
      titulo={titulo ? `Eliminar «${titulo}»` : 'Eliminar el documento'}
      variante="boton--peligro"
    >
      <form action={accionEliminarDocumento}>
        <input type="hidden" name="consorcio" value={consorcioId} />
        <input type="hidden" name="documento" value={documentoId} />
        <p className="ayuda">
          Se borra el archivo y deja de aparecer en las consultas. No se puede deshacer.
        </p>
        <button className="boton boton--peligro" type="submit">
          Eliminar
        </button>
      </form>
    </BotonModal>
  )
}
