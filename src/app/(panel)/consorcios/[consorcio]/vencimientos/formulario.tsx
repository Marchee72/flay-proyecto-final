'use client'

import { useActionState } from 'react'
import { Flag } from 'lucide-react'

import { accionGuardarVencimientos, type Resultado } from './acciones'

const SIN_RESULTADO: Resultado = { mensaje: '', ok: false }

interface EscalonVisible {
  diaDelMes: number
  recargoPorcentaje: string
}

const TITULOS = ['1er vencimiento', '2º vencimiento'] as const

/**
 * ABM de la regla de vencimientos escalonados (RF-08). El administrador piensa el
 * recargo como "lo que se cobra si se paga pasada esta fecha", así que cada fila
 * de vencimiento lleva su recargo; la última fila es el vencimiento en firme, sin
 * recargo, a partir del cual corre la mora. La acción traduce esto al modelo de
 * boleta (primer tramo base) antes de guardar.
 */
export function FormularioVencimientos({
  consorcioId,
  escalones,
  diaFirme,
  tasaMoraMensual,
}: {
  consorcioId: string
  escalones: readonly EscalonVisible[]
  diaFirme: number
  tasaMoraMensual: string
}) {
  const [estado, accion, enviando] = useActionState(accionGuardarVencimientos, SIN_RESULTADO)
  const hayError = estado.mensaje !== '' && !estado.ok

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />

      <p className="ayuda">
        El recargo de cada vencimiento se cobra si se paga <strong>pasada</strong> esa fecha. Antes
        del 1er vencimiento se paga el importe base. La mora mensual del consorcio es{' '}
        {tasaMoraMensual} %: el recargo más alto tiene que ser menor, si no conviene dejar vencer.
      </p>

      <div className="escalera">
        {[0, 1].map((indice) => {
          const escalon = escalones[indice]
          const orden = indice + 1
          return (
            <fieldset key={orden} className="tramo">
              <legend className="tramo__titulo">{TITULOS[indice]}</legend>
              <span className="tramo__numero" aria-hidden="true">
                {orden}
              </span>
              <div className="tramo__campos">
                <div className="campo">
                  <label htmlFor={`dia${orden}`}>Día del mes</label>
                  <input
                    id={`dia${orden}`}
                    name={`dia${orden}`}
                    type="number"
                    min={1}
                    max={28}
                    inputMode="numeric"
                    defaultValue={escalon?.diaDelMes ?? ''}
                    aria-invalid={hayError || undefined}
                  />
                </div>
                <div className="campo">
                  <label htmlFor={`recargo${orden}`}>Recargo %</label>
                  <input
                    id={`recargo${orden}`}
                    name={`recargo${orden}`}
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    defaultValue={escalon ? escalon.recargoPorcentaje : ''}
                    placeholder="Opcional"
                  />
                </div>
              </div>
            </fieldset>
          )
        })}

        <fieldset className="tramo tramo--firme">
          <legend className="tramo__titulo">Vence en firme</legend>
          <span className="tramo__numero" aria-hidden="true">
            <Flag className="icono" aria-hidden="true" />
          </span>
          <div className="tramo__campos">
            <div className="campo">
              <label htmlFor="diaFirme">Día del mes</label>
              <input
                id="diaFirme"
                name="diaFirme"
                type="number"
                min={1}
                max={28}
                inputMode="numeric"
                defaultValue={diaFirme}
                required
                aria-invalid={hayError || undefined}
              />
            </div>
            <p className="tramo__nota">A partir de esta fecha la expensa vence y corre la mora.</p>
          </div>
        </fieldset>
      </div>

      {estado.mensaje &&
        (estado.ok ? (
          <p className="aviso aviso--exito" role="status">
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
