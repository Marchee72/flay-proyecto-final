'use client'

import { useActionState, useId } from 'react'

import { accionAltaProveedor, accionEditarProveedor, type Resultado } from './acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

/**
 * Alta o edicion de proveedor. El rubro habitual es una **sugerencia** al
 * cargar un gasto, no una restriccion: el electricista puede facturar una
 * reparacion. Con `proveedor` el CUIT se muestra y no se edita.
 *
 * Los ids llevan un prefijo propio: la lista monta un dialogo por fila y los
 * ids repetidos romperian el `for` de cada etiqueta.
 */
export function FormularioProveedor({
  consorcioId,
  rubros,
  proveedor,
}: {
  consorcioId: string
  rubros: readonly { id: string; etiqueta: string }[]
  proveedor?: {
    id: string
    razonSocial: string
    cuit: string
    rubroHabitualId: string | null
    telefono: string | null
    correo: string | null
  }
}) {
  const [estado, accion, enviando] = useActionState(
    proveedor ? accionEditarProveedor : accionAltaProveedor,
    SIN_ERROR,
  )
  const hayError = estado.mensaje !== ''
  const p = useId()
  const idError = `${p}-error`
  const idAyudaCuit = `${p}-ayuda-cuit`

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      {proveedor && <input type="hidden" name="proveedor" value={proveedor.id} />}

      <div className="campo">
        <label htmlFor={`${p}-razonSocial`}>Razón social</label>
        <input
          id={`${p}-razonSocial`}
          name="razonSocial"
          defaultValue={estado.valores?.razonSocial ?? proveedor?.razonSocial}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? idError : undefined}
        />
      </div>

      <div className="campo">
        <label htmlFor={`${p}-cuit`}>CUIT</label>
        {proveedor ? (
          <>
            <input
              id={`${p}-cuit`}
              value={proveedor.cuit}
              readOnly
              aria-describedby={idAyudaCuit}
            />
            <p className="ayuda" id={idAyudaCuit}>
              El CUIT no se cambia: si está mal, cargá el proveedor de nuevo.
            </p>
          </>
        ) : (
          <>
            <input
              id={`${p}-cuit`}
              name="cuit"
              defaultValue={estado.valores?.cuit}
              inputMode="numeric"
              pattern="[0-9 \-]{11,13}"
              required
              aria-invalid={hayError || undefined}
              aria-describedby={hayError ? `${idError} ${idAyudaCuit}` : idAyudaCuit}
            />
            <p className="ayuda" id={idAyudaCuit}>
              11 dígitos, con o sin guiones. No se puede editar después: identifica al proveedor y
              no puede haber dos iguales en el consorcio.
            </p>
          </>
        )}
      </div>

      <div className="campo">
        <label htmlFor={`${p}-rubro`}>Rubro habitual</label>
        <select
          key={estado.valores?.rubro ?? 'inicial'}
          id={`${p}-rubro`}
          name="rubro"
          defaultValue={estado.valores?.rubro ?? proveedor?.rubroHabitualId ?? ''}
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? idError : undefined}
        >
          <option value="">Sin rubro habitual</option>
          {rubros.map((rubro) => (
            <option key={rubro.id} value={rubro.id}>
              {rubro.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor={`${p}-telefono`}>Teléfono</label>
        <input
          id={`${p}-telefono`}
          name="telefono"
          type="tel"
          autoComplete="off"
          defaultValue={estado.valores?.telefono ?? proveedor?.telefono ?? ''}
        />
        <p className="ayuda">Opcional. Aparece en los contactos útiles del resumen.</p>
      </div>

      <div className="campo">
        <label htmlFor={`${p}-correo`}>Correo</label>
        <input
          id={`${p}-correo`}
          name="correo"
          type="email"
          autoComplete="off"
          defaultValue={estado.valores?.correo ?? proveedor?.correo ?? ''}
        />
      </div>

      {hayError && (
        <p className="error" id={idError} role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : proveedor ? 'Guardar' : 'Agregar'}
      </button>
    </form>
  )
}
