'use client'

import { useActionState } from 'react'

import { accionAltaConsorcio } from '../acciones'

const SIN_ERROR = { mensaje: '' }

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

  return (
    <form action={accion} noValidate>
      <div className="campo">
        <label htmlFor="administradora">Administradora</label>
        <select id="administradora" name="administradora" required>
          {administradoras.map((administradora) => (
            <option key={administradora.id} value={administradora.id}>
              {administradora.razonSocial}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="nombre">Nombre</label>
        <input id="nombre" name="nombre" required />
      </div>

      <div className="campo">
        <label htmlFor="direccion">Dirección</label>
        <input id="direccion" name="direccion" required />
      </div>

      <div className="campo">
        <label htmlFor="localidad">Localidad</label>
        <input id="localidad" name="localidad" required />
      </div>

      <div className="campo">
        <label htmlFor="cuit">CUIT</label>
        <input id="cuit" name="cuit" required inputMode="numeric" />
      </div>

      {estado.mensaje && (
        <p className="error" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Creando…' : 'Crear consorcio'}
      </button>
    </form>
  )
}
