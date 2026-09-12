'use client'

import { useActionState } from 'react'

import { BotonModal } from '../modal'
import { accionReservar, type Resultado } from './acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

/** Alta de reserva en modal (`CU-09`), con `datetime-local` nativo: sin selector de fecha propio. */
export function ModalReserva({
  consorcioId,
  espacios,
  unidades,
  espacioInicial,
}: {
  consorcioId: string
  espacios: readonly { id: string; nombre: string; capacidadMaxima: number | null }[]
  unidades: readonly { id: string; designacion: string }[]
  espacioInicial?: string
}) {
  return (
    <BotonModal etiqueta="Reservar" titulo="Reservar un espacio">
      <FormularioReserva
        consorcioId={consorcioId}
        espacios={espacios}
        unidades={unidades}
        espacioInicial={espacioInicial}
      />
    </BotonModal>
  )
}

function FormularioReserva({
  consorcioId,
  espacios,
  unidades,
  espacioInicial,
}: {
  consorcioId: string
  espacios: readonly { id: string; nombre: string; capacidadMaxima: number | null }[]
  unidades: readonly { id: string; designacion: string }[]
  espacioInicial?: string
}) {
  const [estado, accion, enviando] = useActionState(accionReservar, SIN_ERROR)
  const hayError = estado.mensaje !== ''

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <div className="campo">
        <label htmlFor="espacio">Espacio</label>
        <select
          id="espacio"
          name="espacio"
          defaultValue={espacioInicial ?? espacios[0]?.id ?? ''}
          required
        >
          {espacios.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
              {e.capacidadMaxima ? ` (hasta ${e.capacidadMaxima} personas)` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="unidad">Unidad</label>
        <select id="unidad" name="unidad" required>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.designacion}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="desde">Desde</label>
        <input
          id="desde"
          name="desde"
          type="datetime-local"
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-reserva' : undefined}
        />
      </div>
      <div className="campo">
        <label htmlFor="hasta">Hasta</label>
        <input
          id="hasta"
          name="hasta"
          type="datetime-local"
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-reserva' : undefined}
        />
      </div>
      <div className="campo">
        <label htmlFor="personas">Cantidad de personas</label>
        <input id="personas" name="personas" type="number" min={1} inputMode="numeric" />
      </div>
      <div className="campo">
        <label htmlFor="observaciones">Observaciones</label>
        <input id="observaciones" name="observaciones" placeholder="Cumpleaños, reunión…" />
      </div>
      {hayError && (
        <p className="error" id="error-reserva" role="alert">
          {estado.mensaje}
        </p>
      )}
      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Reservando…' : 'Confirmar reserva'}
      </button>
    </form>
  )
}
