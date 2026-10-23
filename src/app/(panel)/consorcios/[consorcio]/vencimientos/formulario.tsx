'use client'

import { useActionState } from 'react'

import { accionGuardarVencimientos, type Resultado } from './acciones'

const SIN_RESULTADO: Resultado = { mensaje: '', ok: false }

interface TramoVisible {
  orden: number
  diaDelMes: number
  recargoPorcentaje: string
}

/**
 * ABM de la regla de vencimientos. Tres filas: la 1ª es el base (recargo 0) y es
 * obligatoria; las 2ª y 3ª son opcionales (se cargan con su día para activarse).
 */
export function FormularioVencimientos({
  consorcioId,
  tramos,
  tasaMoraMensual,
}: {
  consorcioId: string
  tramos: readonly TramoVisible[]
  tasaMoraMensual: string
}) {
  const [estado, accion, enviando] = useActionState(accionGuardarVencimientos, SIN_RESULTADO)
  const porOrden = (orden: number) => tramos.find((t) => t.orden === orden)
  const hayError = estado.mensaje !== '' && !estado.ok

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />

      <p className="ayuda">
        La mora mensual del consorcio es {tasaMoraMensual} %: el recargo del último vencimiento
        tiene que ser menor, si no conviene dejar vencer antes que pagarlo.
      </p>

      {[1, 2, 3].map((orden) => {
        const tramo = porOrden(orden)
        const esBase = orden === 1
        return (
          <fieldset key={orden} className="campo-grupo">
            <legend>{esBase ? '1er vencimiento (base)' : `${orden}º vencimiento`}</legend>
            <div className="campo">
              <label htmlFor={`dia${orden}`}>Día del mes</label>
              <input
                id={`dia${orden}`}
                name={`dia${orden}`}
                type="number"
                min={1}
                max={28}
                inputMode="numeric"
                defaultValue={tramo?.diaDelMes ?? ''}
                required={esBase}
                aria-invalid={hayError || undefined}
              />
            </div>
            {esBase ? (
              <p className="ayuda">Sin recargo: es el importe base de la expensa.</p>
            ) : (
              <div className="campo">
                <label htmlFor={`recargo${orden}`}>Recargo %</label>
                <input
                  id={`recargo${orden}`}
                  name={`recargo${orden}`}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  defaultValue={tramo && orden > 1 ? tramo.recargoPorcentaje : ''}
                  placeholder="Dejar vacío si no se usa"
                />
              </div>
            )}
          </fieldset>
        )
      })}

      {estado.mensaje &&
        (estado.ok ? (
          <p className="aviso" role="status">
            {estado.mensaje}
          </p>
        ) : (
          <p className="error" id="error-vencimientos" role="alert">
            {estado.mensaje}
          </p>
        ))}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}
