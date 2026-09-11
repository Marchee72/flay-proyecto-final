'use client'

import { useActionState } from 'react'

import { accionRegistrarPago, type Resultado } from '../acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

export function FormularioPago({
  consorcioId,
  unidades,
  medios,
  hoy,
}: {
  consorcioId: string
  unidades: readonly { id: string; designacion: string }[]
  medios: readonly { valor: string; etiqueta: string }[]
  hoy: string
}) {
  const [estado, accion, enviando] = useActionState(accionRegistrarPago, SIN_ERROR)

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />

      <div className="campo">
        <label htmlFor="unidad">Unidad</label>
        <select id="unidad" name="unidad" required>
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
          aria-describedby="ayuda-importe"
        />
        <p className="ayuda" id="ayuda-importe">
          Con punto decimal y hasta dos decimales. Se imputa a lo más viejo primero; lo que sobre
          queda a favor de la unidad.
        </p>
      </div>

      <div className="campo">
        <label htmlFor="fecha">Fecha del pago</label>
        <input id="fecha" name="fecha" type="date" defaultValue={hoy} required />
      </div>

      <div className="campo">
        <label htmlFor="medio">Medio</label>
        <select id="medio" name="medio" defaultValue="transferencia">
          {medios.map((medio) => (
            <option key={medio.valor} value={medio.valor}>
              {medio.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="referencia">Referencia</label>
        <input id="referencia" name="referencia" placeholder="Número de operación" />
      </div>

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Registrando…' : 'Registrar pago'}
      </button>

      {estado.mensaje && (
        <p className="error" role="alert">
          {estado.mensaje}
        </p>
      )}
    </form>
  )
}
