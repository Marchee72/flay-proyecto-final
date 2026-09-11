'use client'

import { useActionState } from 'react'

import { accionAltaProveedor } from './acciones'

const SIN_ERROR = { mensaje: '' }

/**
 * Alta de proveedor. El rubro habitual es una **sugerencia** al cargar un
 * gasto, no una restriccion: el electricista puede facturar una reparacion.
 */
export function FormularioProveedor({
  consorcioId,
  rubros,
}: {
  consorcioId: string
  rubros: readonly { id: string; etiqueta: string }[]
}) {
  const [estado, accion, enviando] = useActionState(accionAltaProveedor, SIN_ERROR)
  const hayError = estado.mensaje !== ''

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />

      <div className="campo">
        <label htmlFor="razonSocial">Razón social</label>
        <input
          id="razonSocial"
          name="razonSocial"
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-proveedor' : undefined}
        />
      </div>

      <div className="campo">
        <label htmlFor="cuit">CUIT</label>
        <input
          id="cuit"
          name="cuit"
          inputMode="numeric"
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-proveedor ayuda-cuit' : 'ayuda-cuit'}
        />
        <p className="ayuda" id="ayuda-cuit">
          No se puede editar después: identifica al proveedor.
        </p>
      </div>

      <div className="campo">
        <label htmlFor="rubro">Rubro habitual</label>
        <select
          id="rubro"
          name="rubro"
          defaultValue=""
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-proveedor' : undefined}
        >
          <option value="">Sin rubro habitual</option>
          {rubros.map((rubro) => (
            <option key={rubro.id} value={rubro.id}>
              {rubro.etiqueta}
            </option>
          ))}
        </select>
      </div>

      {hayError && (
        <p className="error" id="error-proveedor" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Agregar proveedor'}
      </button>
    </form>
  )
}
