'use client'

import { useActionState } from 'react'

import { accionInvitar } from '../acciones'

const SIN_ERROR = { mensaje: '' }

/**
 * Alta de invitacion. Cada campo con etiqueta visible y el error debajo del
 * formulario (§3.4): quien invita no elige la contrasena, la elige el invitado.
 */
export function FormularioInvitar({
  consorcioId,
  roles,
  hoy,
}: {
  consorcioId: string
  roles: readonly { valor: string; etiqueta: string }[]
  hoy: string
}) {
  const [estado, accion, enviando] = useActionState(accionInvitar, SIN_ERROR)
  const hayError = estado.mensaje !== ''

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />

      <div className="campo">
        <label htmlFor="nombre">Nombre</label>
        <input
          id="nombre"
          name="nombre"
          required
          autoComplete="given-name"
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-invitacion' : undefined}
        />
      </div>

      <div className="campo">
        <label htmlFor="apellido">Apellido</label>
        <input
          id="apellido"
          name="apellido"
          required
          autoComplete="family-name"
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-invitacion' : undefined}
        />
      </div>

      <div className="campo">
        <label htmlFor="correo">Correo electrónico</label>
        <input
          id="correo"
          name="correo"
          type="email"
          required
          autoComplete="email"
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-invitacion ayuda-correo' : 'ayuda-correo'}
        />
        <p className="ayuda" id="ayuda-correo">
          A esta dirección va el enlace para fijar la contraseña. Vence en 72 horas.
        </p>
      </div>

      <div className="campo">
        <label htmlFor="rol">Rol</label>
        <select
          id="rol"
          name="rol"
          defaultValue="consorcista"
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-invitacion' : undefined}
        >
          {roles.map((rol) => (
            <option key={rol.valor} value={rol.valor}>
              {rol.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="vigenciaDesde">Habilitado desde</label>
        <input
          id="vigenciaDesde"
          name="vigenciaDesde"
          type="date"
          defaultValue={hoy}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-invitacion' : undefined}
        />
      </div>

      {hayError && (
        <p className="error" id="error-invitacion" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Invitando…' : 'Invitar'}
      </button>
    </form>
  )
}
