'use client'

import { useActionState } from 'react'

import { BotonModal } from '../../../modal'
import { accionQuitarAcceso, type Resultado } from './acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

/** «Quitar» un rol, con confirmación en modal (nunca `confirm()`): el acceso se cierra hoy. */
export function ModalQuitar({
  consorcioId,
  habilitacionId,
  nombre,
  rol,
}: {
  consorcioId: string
  habilitacionId: string
  nombre: string
  rol: string
}) {
  return (
    <BotonModal
      etiqueta={`Quitar ${rol}`}
      titulo={`Quitar acceso de ${rol}`}
      variante="boton--peligro"
    >
      <FormularioQuitar
        consorcioId={consorcioId}
        habilitacionId={habilitacionId}
        nombre={nombre}
        rol={rol}
      />
    </BotonModal>
  )
}

function FormularioQuitar({
  consorcioId,
  habilitacionId,
  nombre,
  rol,
}: {
  consorcioId: string
  habilitacionId: string
  nombre: string
  rol: string
}) {
  const [estado, accion, enviando] = useActionState(accionQuitarAcceso, SIN_ERROR)

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name="habilitacion" value={habilitacionId} />

      <p>
        ¿Quitarle a {nombre} el acceso de {rol} a este consorcio?
      </p>

      {estado.mensaje !== '' && (
        <p className="error" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--peligro" type="submit" disabled={enviando}>
        {enviando ? 'Quitando…' : 'Quitar acceso'}
      </button>
    </form>
  )
}
