'use client'

import { useActionState, useState } from 'react'

import { errorDeCorreo } from '@/aplicacion/identidad/correo-reglas'

import { accionPedirEnlace, type Resultado } from '../acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

/** La respuesta es siempre la misma: no revela si el correo tiene cuenta. */
const RESPUESTA =
  'Si ese correo tiene cuenta en Flay, te mandamos un enlace para elegir una contraseña nueva. Revisá también el correo no deseado.'

export function FormularioRecuperar() {
  const [estado, accion, enviando] = useActionState(accionPedirEnlace, SIN_ERROR)
  const [errorAlTipear, setErrorAlTipear] = useState<string | null | undefined>(undefined)
  const mensaje = errorAlTipear === undefined ? estado.mensaje : (errorAlTipear ?? '')
  const hayError = mensaje !== ''

  return (
    <form action={accion} noValidate>
      <div className="campo">
        <label htmlFor="correo">Correo electrónico</label>
        <input
          id="correo"
          name="correo"
          type="email"
          autoComplete="username"
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-correo' : undefined}
          onChange={(e) =>
            setErrorAlTipear(e.target.value === '' ? null : errorDeCorreo(e.target.value))
          }
        />
        {hayError && (
          <p className="error" id="error-correo">
            {mensaje}
          </p>
        )}
      </div>

      {estado.enviado && !hayError && (
        <p className="aviso" role="status">
          {RESPUESTA}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Mandarme el enlace'}
      </button>
    </form>
  )
}
