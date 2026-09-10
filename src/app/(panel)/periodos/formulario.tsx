'use client'

import { useActionState } from 'react'

import { accionAbrirPeriodo } from './acciones'

const SIN_ERROR = { mensaje: '' }

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/**
 * Apertura de un periodo. **Solo eso** (FR-024): cerrar, liquidar y anular son
 * alcance de `003-liquidacion`, y por eso no hay ningun boton mas.
 */
export function FormularioPeriodo({
  consorcioId,
  anio,
  mes,
}: {
  consorcioId: string
  anio: number
  mes: number
}) {
  const [estado, accion, enviando] = useActionState(accionAbrirPeriodo, SIN_ERROR)

  return (
    <form action={accion} noValidate className="fila-de-filtros">
      <input type="hidden" name="consorcio" value={consorcioId} />

      <div className="campo">
        <label htmlFor="mes">Mes</label>
        <select id="mes" name="mes" defaultValue={String(mes)}>
          {MESES.map((nombre, indice) => (
            <option key={nombre} value={indice + 1}>
              {nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="anio">Año</label>
        <input
          id="anio"
          name="anio"
          className="cifra"
          inputMode="numeric"
          defaultValue={String(anio)}
          required
        />
      </div>

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Abriendo…' : 'Abrir período'}
      </button>

      {estado.mensaje && (
        <p className="error" role="alert">
          {estado.mensaje}
        </p>
      )}
    </form>
  )
}
