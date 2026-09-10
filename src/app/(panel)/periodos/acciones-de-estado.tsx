'use client'

import { useActionState } from 'react'

import {
  accionAnularLiquidacion,
  accionCerrarPeriodo,
  accionLiquidarPeriodo,
  type Resultado,
} from './acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

/**
 * Los botones de estado del período, uno por fila de la tabla (`CU-03`).
 *
 * Cada uno es su propio formulario: así el mensaje de error aparece **en la
 * fila que falló** y no arriba de todo, que con doce períodos en pantalla es la
 * diferencia entre entender qué pasó y adivinarlo (RNF-10).
 */
export function BotonCerrar({ consorcioId, periodoId }: { consorcioId: string; periodoId: string }) {
  return (
    <Boton
      accion={accionCerrarPeriodo}
      consorcioId={consorcioId}
      campo="periodo"
      valor={periodoId}
      etiqueta="Cerrar"
      trabajando="Cerrando…"
    />
  )
}

export function BotonLiquidar({
  consorcioId,
  periodoId,
}: {
  consorcioId: string
  periodoId: string
}) {
  return (
    <Boton
      accion={accionLiquidarPeriodo}
      consorcioId={consorcioId}
      campo="periodo"
      valor={periodoId}
      etiqueta="Liquidar"
      trabajando="Liquidando…"
      primario
    />
  )
}

export function BotonAnular({
  consorcioId,
  liquidacionId,
}: {
  consorcioId: string
  liquidacionId: string
}) {
  return (
    <Boton
      accion={accionAnularLiquidacion}
      consorcioId={consorcioId}
      campo="liquidacion"
      valor={liquidacionId}
      etiqueta="Anular"
      trabajando="Anulando…"
    />
  )
}

function Boton({
  accion,
  consorcioId,
  campo,
  valor,
  etiqueta,
  trabajando,
  primario = false,
}: {
  accion: (previo: Resultado, datos: FormData) => Promise<Resultado>
  consorcioId: string
  campo: string
  valor: string
  etiqueta: string
  trabajando: string
  primario?: boolean
}) {
  const [estado, enviar, enCurso] = useActionState(accion, SIN_ERROR)

  return (
    <form action={enviar}>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name={campo} value={valor} />

      <button
        className={`boton ${primario ? 'boton--primario' : 'boton--fantasma'}`}
        type="submit"
        disabled={enCurso}
      >
        {enCurso ? trabajando : etiqueta}
      </button>

      {estado.mensaje && (
        <p className="error" role="alert">
          {estado.mensaje}
        </p>
      )}
    </form>
  )
}
