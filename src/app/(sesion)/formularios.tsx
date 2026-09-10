'use client'

import { useActionState } from 'react'

import { MINIMO_DE_CONTRASENA } from '@/compartido/contrasenas'

import { accionFijarContrasena, accionIngresar } from './acciones'

const SIN_ERROR = { mensaje: '' }

/**
 * Formularios de acceso. Cada campo lleva etiqueta visible, ayuda cuando hace
 * falta y el error **debajo del campo** (§3.4 de la guia de estilos); el error
 * se anuncia y el campo queda marcado como invalido para el lector de pantalla.
 */

function Error_({ mensaje, id }: { mensaje: string; id: string }) {
  return (
    <p className="error" id={id} role="alert">
      {mensaje}
    </p>
  )
}

export function FormularioIngreso() {
  const [estado, accion, enviando] = useActionState(accionIngresar, SIN_ERROR)
  const hayError = estado.mensaje !== ''

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
          aria-describedby={hayError ? 'error-ingreso' : undefined}
        />
      </div>

      <div className="campo">
        <label htmlFor="contrasena">Contraseña</label>
        <input
          id="contrasena"
          name="contrasena"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-ingreso' : undefined}
        />
      </div>

      {hayError && <Error_ id="error-ingreso" mensaje={estado.mensaje} />}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}

export function FormularioInvitacion({ credencial }: { credencial: string }) {
  const [estado, accion, enviando] = useActionState(accionFijarContrasena, SIN_ERROR)
  const hayError = estado.mensaje !== ''

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="credencial" value={credencial} />

      <div className="campo">
        <label htmlFor="contrasena">Contraseña nueva</label>
        <input
          id="contrasena"
          name="contrasena"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-invitacion ayuda-contrasena' : 'ayuda-contrasena'}
        />
        <p className="ayuda" id="ayuda-contrasena">
          Al menos {MINIMO_DE_CONTRASENA} caracteres. Nadie más la conoce, tampoco el administrador.
        </p>
      </div>

      <div className="campo">
        <label htmlFor="repeticion">Repetila</label>
        <input
          id="repeticion"
          name="repeticion"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-invitacion' : undefined}
        />
      </div>

      {hayError && <Error_ id="error-invitacion" mensaje={estado.mensaje} />}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar y entrar'}
      </button>
    </form>
  )
}
