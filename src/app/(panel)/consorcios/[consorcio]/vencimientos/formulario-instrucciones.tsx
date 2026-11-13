'use client'

import { useActionState, useState } from 'react'

import {
  errorDeInstrucciones,
  MAXIMO_INSTRUCCIONES,
} from '@/aplicacion/consorcios/instrucciones-reglas'

import { accionGuardarInstrucciones, type ResultadoInstrucciones } from './acciones'

const SIN_RESULTADO: ResultadoInstrucciones = { mensaje: '' }

/**
 * Como se paga por fuera de la pasarela (RF-09). Form propio, aparte del de
 * vencimientos: guarda solo esto. El limite se avisa al tipear con el mismo
 * validador que usa el guardado (nota 28).
 */
export function FormularioInstrucciones({
  consorcioId,
  inicial,
}: {
  consorcioId: string
  inicial: string
}) {
  const [estado, accion, enviando] = useActionState(accionGuardarInstrucciones, SIN_RESULTADO)
  const [texto, setTexto] = useState(estado.valores?.instrucciones ?? inicial)
  const errorDeCampo = errorDeInstrucciones(texto)
  const hayErrorServidor = estado.mensaje !== ''
  const descritoPor = [
    errorDeCampo ? 'error-instrucciones' : null,
    hayErrorServidor ? 'error-guardado' : null,
    'contador-instrucciones',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <div className="campo">
        <label htmlFor="instrucciones">Instrucciones de pago</label>
        <textarea
          id="instrucciones"
          name="instrucciones"
          rows={5}
          maxLength={MAXIMO_INSTRUCCIONES}
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="Ej. Transferí al alias alvear.100 y mandá el comprobante. Horario: lunes a viernes de 9 a 13."
          aria-invalid={Boolean(errorDeCampo) || hayErrorServidor || undefined}
          aria-describedby={descritoPor}
        />
        <p className="ayuda" id="contador-instrucciones">
          {texto.length} / {MAXIMO_INSTRUCCIONES}
        </p>
        {errorDeCampo && (
          <p className="error" id="error-instrucciones">
            {errorDeCampo}
          </p>
        )}
      </div>

      {hayErrorServidor && (
        <p className="error" id="error-guardado" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}
