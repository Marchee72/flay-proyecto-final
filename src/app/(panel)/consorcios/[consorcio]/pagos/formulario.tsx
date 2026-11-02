'use client'

import { useActionState } from 'react'

import { accionRegistrarPago, type Resultado } from './acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

export function FormularioPago({
  consorcioId,
  unidades,
  medios,
  hoy,
  unidadInicial,
  vuelta,
}: {
  consorcioId: string
  unidades: readonly { id: string; designacion: string }[]
  medios: readonly { valor: string; etiqueta: string }[]
  hoy: string
  /** Desde la expensa, la unidad ya elegida. */
  unidadInicial?: string
  /** Adonde volver con exito; la accion lo valida dentro del consorcio. */
  vuelta?: string
}) {
  const [estado, accion, enviando] = useActionState(accionRegistrarPago, SIN_ERROR)
  const hayError = estado.mensaje !== ''

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      {vuelta && <input type="hidden" name="vuelta" value={vuelta} />}

      <div className="campo">
        <label htmlFor="unidad">Unidad</label>
        <select
          id="unidad"
          name="unidad"
          defaultValue={unidadInicial}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-pago' : undefined}
        >
          {unidades.map((unidad) => (
            <option key={unidad.id} value={unidad.id}>
              {unidad.designacion}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="importe">Importe</label>
        <input
          id="importe"
          name="importe"
          className="cifra"
          inputMode="decimal"
          placeholder="0.00"
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-pago ayuda-importe' : 'ayuda-importe'}
        />
        <p className="ayuda" id="ayuda-importe">
          Con coma o punto decimal y hasta dos decimales. Se imputa a lo más viejo primero; lo que
          sobre queda a favor de la unidad.
        </p>
      </div>

      <div className="campo">
        <label htmlFor="fecha">Fecha del pago</label>
        <input
          id="fecha"
          name="fecha"
          type="date"
          defaultValue={hoy}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-pago' : undefined}
        />
      </div>

      <div className="campo">
        <label htmlFor="medio">Medio</label>
        <select
          id="medio"
          name="medio"
          defaultValue="transferencia"
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-pago' : undefined}
        >
          {medios.map((medio) => (
            <option key={medio.valor} value={medio.valor}>
              {medio.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="referencia">Referencia</label>
        <input
          id="referencia"
          name="referencia"
          placeholder="Número de operación"
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-pago' : undefined}
        />
      </div>

      {hayError && (
        <p className="error" id="error-pago" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Registrando…' : 'Registrar'}
      </button>
    </form>
  )
}
