'use client'

import { useActionState, useState } from 'react'

import { errorDeCorreo } from '@/aplicacion/identidad/correo-reglas'

import { accionInvitar } from './acciones'

const SIN_ERROR = { mensaje: '' }

/**
 * Alta de invitacion. Cada campo con etiqueta visible y el error debajo del
 * formulario (§3.4): quien invita no elige la contrasena, la elige el invitado.
 */
export function FormularioInvitar({
  consorcioId,
  roles,
  hoy,
  unidades,
}: {
  consorcioId: string
  roles: readonly { valor: string; etiqueta: string }[]
  hoy: string
  unidades: readonly { id: string; designacion: string }[]
}) {
  const [rol, setRol] = useState('consorcista')
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null)
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
          aria-invalid={hayError || errorCorreo !== null || undefined}
          aria-describedby={
            errorCorreo
              ? 'error-correo ayuda-correo'
              : hayError
                ? 'error-invitacion ayuda-correo'
                : 'ayuda-correo'
          }
          onChange={(e) =>
            setErrorCorreo(e.target.value === '' ? null : errorDeCorreo(e.target.value))
          }
          onBlur={(e) => setErrorCorreo(errorDeCorreo(e.target.value))}
        />
        {errorCorreo && (
          <p className="error" id="error-correo">
            {errorCorreo}
          </p>
        )}
        <p className="ayuda" id="ayuda-correo">
          A esta dirección va el enlace para fijar la contraseña. Vence en 72 horas.
        </p>
      </div>

      <div className="campo">
        <label htmlFor="rol">Rol</label>
        <select
          id="rol"
          name="rol"
          value={rol}
          onChange={(e) => setRol(e.target.value)}
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

      {rol === 'consorcista' && (
        <>
          <div className="campo">
            <label htmlFor="unidad">Unidad</label>
            <select id="unidad" name="unidad" defaultValue="">
              <option value="">Sin unidad por ahora</option>
              {unidades.map((unidad) => (
                <option key={unidad.id} value={unidad.id}>
                  {unidad.designacion}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="tipoOcupacion">Es</label>
            <select id="tipoOcupacion" name="tipoOcupacion" defaultValue="propietario">
              <option value="propietario">Propietario</option>
              <option value="inquilino">Inquilino</option>
            </select>
          </div>
        </>
      )}

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
