'use client'

import { useActionState, useState } from 'react'

import { normalizarCuit } from '@/aplicacion/administradoras/cuit-reglas'

import { accionAltaAdministradora, type Resultado } from './acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

/** Alta de administradora (RF-01). El CUIT se valida al tipear y otra vez al guardar (nota 28). */
export function FormularioAdministradora() {
  const [estado, accion, enviando] = useActionState(accionAltaAdministradora, SIN_ERROR)
  const [cuit, setCuit] = useState<string | null>(null)
  const hayError = estado.mensaje !== ''
  // El texto del servidor vale hasta que se vuelve a tipear el CUIT.
  const errorDeCuit =
    cuit !== null && cuit.trim() !== '' && !normalizarCuit(cuit)
      ? 'El CUIT tiene que tener 11 dígitos.'
      : null

  return (
    <form action={accion} noValidate>
      <div className="campo">
        <label htmlFor="razonSocial">Razón social</label>
        <input
          id="razonSocial"
          name="razonSocial"
          required
          defaultValue={estado.valores?.razonSocial ?? ''}
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-administradora' : undefined}
        />
      </div>

      <div className="campo">
        <label htmlFor="cuit">CUIT</label>
        <input
          id="cuit"
          name="cuit"
          required
          inputMode="numeric"
          defaultValue={estado.valores?.cuit ?? ''}
          onChange={(e) => setCuit(e.target.value)}
          aria-invalid={errorDeCuit || hayError ? true : undefined}
          aria-describedby={
            [errorDeCuit ? 'error-cuit' : '', hayError ? 'error-administradora' : '']
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
        {errorDeCuit && (
          <p className="error" id="error-cuit">
            {errorDeCuit}
          </p>
        )}
      </div>

      {hayError && (
        <p className="error" id="error-administradora" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Creando…' : 'Crear administradora'}
      </button>
    </form>
  )
}
