'use client'

import { useActionState } from 'react'

import { BotonModal } from '../modal'
import { accionRegistrarReclamo, type Resultado } from './acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

/** Alta de reclamo en modal (`CU-07`), desde el telefono primero. */
export function ModalReclamo({
  consorcioId,
  unidades,
  urgencias,
}: {
  consorcioId: string
  unidades: readonly { id: string; designacion: string }[]
  urgencias: readonly { valor: string; etiqueta: string }[]
}) {
  return (
    <BotonModal etiqueta="Nuevo reclamo" titulo="Nuevo reclamo">
      <FormularioReclamo consorcioId={consorcioId} unidades={unidades} urgencias={urgencias} />
    </BotonModal>
  )
}

export function FormularioReclamo({
  consorcioId,
  unidades,
  urgencias,
}: {
  consorcioId: string
  unidades: readonly { id: string; designacion: string }[]
  urgencias: readonly { valor: string; etiqueta: string }[]
}) {
  const [estado, accion, enviando] = useActionState(accionRegistrarReclamo, SIN_ERROR)
  const hayError = estado.mensaje !== ''

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />

      <div className="campo">
        <label htmlFor="titulo">Qué pasa</label>
        <input
          id="titulo"
          name="titulo"
          maxLength={140}
          required
          placeholder="Filtración en la cocina"
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-reclamo' : undefined}
        />
      </div>

      <div className="campo">
        <label htmlFor="descripcion">Detalle</label>
        <textarea
          id="descripcion"
          name="descripcion"
          rows={4}
          required
          placeholder="Dónde está, desde cuándo, qué probaste."
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-reclamo' : undefined}
        />
      </div>

      <div className="campo">
        <label htmlFor="unidad">Unidad</label>
        <select id="unidad" name="unidad" defaultValue="">
          <option value="">Área común (sin unidad)</option>
          {unidades.map((unidad) => (
            <option key={unidad.id} value={unidad.id}>
              {unidad.designacion}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="urgencia">Urgencia</label>
        <select id="urgencia" name="urgencia" defaultValue="media">
          {urgencias.map((urgencia) => (
            <option key={urgencia.valor} value={urgencia.valor}>
              {urgencia.etiqueta}
            </option>
          ))}
        </select>
        <p className="ayuda">Crítica es agua, gas, electricidad, ascensor o seguridad.</p>
      </div>

      {hayError && (
        <p className="error" id="error-reclamo" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Registrando…' : 'Registrar reclamo'}
      </button>
    </form>
  )
}
