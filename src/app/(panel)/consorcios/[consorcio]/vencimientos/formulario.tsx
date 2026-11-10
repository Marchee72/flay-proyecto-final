'use client'

import { useActionState, useState, type ChangeEvent } from 'react'
import { Flag } from 'lucide-react'

import {
  errorDeDia,
  errorDeRecargo,
  errorDeTasaMora,
} from '@/aplicacion/consorcios/vencimientos-reglas'

import { accionGuardarVencimientos, type Resultado } from './acciones'

const SIN_RESULTADO: Resultado = { mensaje: '', ok: false }

interface EscalonVisible {
  diaDelMes: number
  recargoPorcentaje: string
}

const TITULOS = ['1er vencimiento', '2º vencimiento'] as const

type Campo = 'dia1' | 'recargo1' | 'dia2' | 'recargo2' | 'diaFirme' | 'tasaMora'
type Errores = Partial<Record<Campo, string>>

/**
 * Mensaje del campo mientras se escribe, o vacio si todavia no hay nada que
 * decir. Un campo vacio no se marca: la obligatoriedad la decide el guardado,
 * y avisar en cada borrado intermedio seria ruido.
 */
function errorDelCampo(campo: Campo, valor: string): string {
  if (valor === '') return ''

  switch (campo) {
    case 'dia1':
    case 'dia2':
    case 'diaFirme':
      return errorDeDia(valor) ?? ''
    case 'recargo1':
    case 'recargo2':
      return errorDeRecargo(valor) ?? ''
    case 'tasaMora':
      return errorDeTasaMora(valor) ?? ''
  }
}

/**
 * ABM de la regla de vencimientos escalonados (RF-08). El administrador piensa el
 * recargo como "lo que se cobra si se paga pasada esta fecha", así que cada fila
 * de vencimiento lleva su recargo; la última fila es el vencimiento en firme, sin
 * recargo, a partir del cual corre la mora. La acción traduce esto al modelo de
 * boleta (primer tramo base) antes de guardar.
 *
 * Los campos se validan al tipear con los **mismos** validadores que usa el
 * guardado (`vencimientos-reglas`): el aviso aparece antes del submit y no hay
 * dos reglas que se desincronicen. El servidor vuelve a validar todo, incluida
 * la coherencia entre mora y recargos: lo del cliente es una ayuda, no la
 * garantía.
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
  const hayErrorServidor = estado.mensaje !== '' && !estado.ok

  const [valores, setValores] = useState<Record<Campo, string>>({
    dia1: escalones[0] ? String(escalones[0].diaDelMes) : '',
    recargo1: escalones[0]?.recargoPorcentaje ?? '',
    dia2: escalones[1] ? String(escalones[1].diaDelMes) : '',
    recargo2: escalones[1]?.recargoPorcentaje ?? '',
    diaFirme: String(diaFirme),
    // Cero es el default de la base, no una tasa elegida: se muestra vacio para
    // que el administrador tenga que poner una.
    tasaMora: Number(tasaMoraMensual) > 0 ? String(Number(tasaMoraMensual)) : '',
  })
  const [errores, setErrores] = useState<Errores>({})

  const cambiar = (campo: Campo) => (evento: ChangeEvent<HTMLInputElement>) => {
    const valor = evento.target.value
    setValores((previos) => ({ ...previos, [campo]: valor }))
    setErrores((previos) => ({ ...previos, [campo]: errorDelCampo(campo, valor) }))
  }

  const invalido = (campo: Campo) => Boolean(errores[campo]) || hayErrorServidor || undefined

  const descritoPor = (campo: Campo, ayuda?: string) =>
    [
      errores[campo] ? `error-${campo}` : null,
      hayErrorServidor ? 'error-vencimientos' : null,
      ayuda,
    ]
      .filter(Boolean)
      .join(' ') || undefined

  const errorDelInput = (campo: Campo) =>
    errores[campo] ? (
      <p className="error" id={`error-${campo}`}>
        {errores[campo]}
      </p>
    ) : null

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />

      <p className="ayuda">
        El recargo de cada vencimiento se cobra si se paga <strong>pasada</strong> esa fecha. Antes
        del 1er vencimiento se paga el importe base. La tasa de mora tiene que ser mayor que el
        recargo más alto: si no, conviene dejar vencer.
      </p>

      <div className="escalera">
        {[0, 1].map((indice) => {
          const orden = indice + 1
          const campoDia = `dia${orden}` as Campo
          const campoRecargo = `recargo${orden}` as Campo
          return (
            <fieldset key={orden} className="tramo">
              <legend className="tramo__titulo">{TITULOS[indice]}</legend>
              <span className="tramo__numero" aria-hidden="true">
                {orden}
              </span>
              <div className="tramo__campos">
                <div className="campo">
                  <label htmlFor={campoDia}>Día del mes</label>
                  <input
                    id={campoDia}
                    name={campoDia}
                    type="number"
                    min={1}
                    max={28}
                    inputMode="numeric"
                    value={valores[campoDia]}
                    onChange={cambiar(campoDia)}
                    aria-invalid={invalido(campoDia)}
                    aria-describedby={descritoPor(campoDia)}
                  />
                  {errorDelInput(campoDia)}
                </div>
                <div className="campo">
                  <label htmlFor={campoRecargo}>Recargo %</label>
                  <input
                    id={campoRecargo}
                    name={campoRecargo}
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={valores[campoRecargo]}
                    onChange={cambiar(campoRecargo)}
                    placeholder="Opcional"
                    aria-invalid={invalido(campoRecargo)}
                    aria-describedby={descritoPor(campoRecargo)}
                  />
                  {errorDelInput(campoRecargo)}
                </div>
              </div>
            </fieldset>
          )
        })}

        <fieldset className="tramo">
          <legend className="tramo__titulo">Mora por pago fuera de término</legend>
          <div className="tramo__campos">
            <div className="campo">
              <label htmlFor="tasaMora">Tasa mensual %</label>
              <input
                id="tasaMora"
                name="tasaMora"
                type="number"
                min={0.01}
                max={99.99}
                step="0.01"
                inputMode="decimal"
                value={valores.tasaMora}
                onChange={cambiar('tasaMora')}
                placeholder="Ej. 3,5"
                required
                aria-invalid={invalido('tasaMora')}
                aria-describedby={descritoPor('tasaMora', 'ayuda-mora')}
              />
              {errorDelInput('tasaMora')}
            </div>
            <p className="tramo__nota" id="ayuda-mora">
              Corre desde el vencimiento en firme, sobre el capital impago y por mes completo
              vencido. Tiene que ser mayor que el recargo más alto.
            </p>
          </div>
        </fieldset>

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
                value={valores.diaFirme}
                onChange={cambiar('diaFirme')}
                required
                aria-invalid={invalido('diaFirme')}
                aria-describedby={descritoPor('diaFirme')}
              />
              {errorDelInput('diaFirme')}
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
