'use client'

import { useActionState, useEffect, useState } from 'react'

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
 *
 * `alExito` avisa cuando la apertura se confirmo (la accion no redirige):
 * el modal de «Abrir un mes» lo usa para cerrarse y mostrar el estado.
 */
export function FormularioPeriodo({
  consorcioId,
  anio,
  mes,
  alExito,
}: {
  consorcioId: string
  anio: number
  mes: number
  alExito?: () => void
}) {
  const [estado, accion, enviando] = useActionState(accionAbrirPeriodo, SIN_ERROR)
  const [enviado, setEnviado] = useState(false)
  const hayError = estado.mensaje !== ''

  useEffect(() => {
    if (enviado && !enviando && !hayError) alExito?.()
  }, [enviado, enviando, hayError, alExito])

  return (
    <form action={accion} noValidate className="fila-de-filtros" onSubmit={() => setEnviado(true)}>
      <input type="hidden" name="consorcio" value={consorcioId} />

      <div className="campo">
        <label htmlFor="mes">Mes</label>
        <select
          id="mes"
          name="mes"
          defaultValue={String(mes)}
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-periodo' : undefined}
        >
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
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-periodo' : undefined}
        />
      </div>

      {hayError && (
        <p className="error" id="error-periodo" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Abriendo…' : 'Abrir período'}
      </button>
    </form>
  )
}
