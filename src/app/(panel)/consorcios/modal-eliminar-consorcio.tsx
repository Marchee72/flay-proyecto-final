import { Archive, Trash2 } from 'lucide-react'

import type { PreviaDeEliminarConsorcio } from '@/aplicacion/consorcios/archivar-consorcio'

import { BotonModal } from '../modal'
import { accionEliminarConsorcio } from './acciones'

/** Texto de lo que va a pasar, o del motivo por el que hoy no se puede (RN-22). */
function bloqueo(previa: PreviaDeEliminarConsorcio): string | null {
  if (previa.accion === 'borrar') return null
  if (previa.pagosEnCurso > 0)
    return `Hay ${previa.pagosEnCurso} pagos en línea sin confirmar; podés archivar cuando terminen.`
  if (previa.asambleasEnCurso > 0)
    return 'Hay una asamblea convocada o en curso; podés archivar cuando termine.'
  if (previa.actasSinFirmar > 0)
    return 'Hay un acta de asamblea esperando firmas; podés archivar cuando esté firmada.'
  return null
}

/** Eliminar el consorcio: sin movimiento se borra; con historia se archiva en solo lectura (`RN-22`). */
export function ModalEliminarConsorcio({
  consorcioId,
  previa,
}: {
  consorcioId: string
  previa: PreviaDeEliminarConsorcio
}) {
  const motivo = bloqueo(previa)
  const borra = previa.accion === 'borrar'
  return (
    <BotonModal
      etiqueta={
        <>
          {borra ? (
            <Trash2 className="icono" aria-hidden="true" />
          ) : (
            <Archive className="icono" aria-hidden="true" />
          )}
          {borra ? 'Eliminar' : 'Archivar'}
        </>
      }
      titulo={borra ? 'Eliminar consorcio' : 'Archivar consorcio'}
      variante="boton--peligro"
      claseBoton="menu-puntos__item"
    >
      <form action={accionEliminarConsorcio}>
        <input type="hidden" name="consorcio" value={consorcioId} />
        <p className="ayuda">
          {motivo ??
            (borra
              ? 'Este consorcio no tiene movimiento: se va a borrar definitivamente junto con su padrón, espacios, proveedores y accesos.'
              : 'Tiene historia: se va a archivar y quedará en solo lectura para todos. Lo encontrás en Archivados, desde donde podés restaurarlo. Las reservas futuras se cancelan y se avisan.')}
        </p>
        <button className="boton boton--peligro" type="submit" disabled={motivo !== null}>
          {borra ? 'Eliminar' : 'Archivar'}
        </button>
      </form>
    </BotonModal>
  )
}
