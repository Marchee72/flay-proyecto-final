'use client'

import { useActionState } from 'react'

import { accionAltaConsorcio, type Resultado } from '../acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

/**
 * Alta de la cabecera. El padron se carga despues, en su propia pantalla: un
 * consorcio sin unidades es valido (FR-011c) y cargarlas es otra conversacion.
 */
export function FormularioConsorcio({
  administradoras,
}: {
  administradoras: readonly { id: string; razonSocial: string }[]
}) {
  const [estado, accion, enviando] = useActionState(accionAltaConsorcio, SIN_ERROR)
  const hayError = estado.mensaje !== ''

  return (
    <form action={accion} noValidate>
      <div className="campo">
        <label htmlFor="administradora">Administradora</label>
        <select
          key={estado.valores?.administradora ?? 'inicial'}
          id="administradora"
          name="administradora"
          defaultValue={estado.valores?.administradora}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-consorcio' : undefined}
        >
          {administradoras.map((administradora) => (
            <option key={administradora.id} value={administradora.id}>
              {administradora.razonSocial}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="nombre">Nombre</label>
        <input
          id="nombre"
          name="nombre"
          defaultValue={estado.valores?.nombre}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-consorcio' : undefined}
        />
      </div>

      <div className="campo">
        <label htmlFor="direccion">Dirección</label>
        <input
          id="direccion"
          name="direccion"
          defaultValue={estado.valores?.direccion}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-consorcio' : undefined}
        />
      </div>

      <div className="campo">
        <label htmlFor="localidad">Localidad</label>
        <input
          id="localidad"
          name="localidad"
          defaultValue={estado.valores?.localidad}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-consorcio' : undefined}
        />
      </div>

      <div className="campo">
        <label htmlFor="cuit">CUIT</label>
        <input
          id="cuit"
          name="cuit"
          defaultValue={estado.valores?.cuit}
          required
          inputMode="numeric"
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-consorcio' : undefined}
        />
      </div>

      {hayError && (
        <p className="error" id="error-consorcio" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Creando…' : 'Crear'}
      </button>
    </form>
  )
}
