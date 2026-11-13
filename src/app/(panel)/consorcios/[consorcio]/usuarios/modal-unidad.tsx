'use client'

import { useActionState } from 'react'

import { BotonModal } from '../../../modal'
import { accionAsignarUnidad, type Resultado } from './acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

type Unidades = readonly { id: string; designacion: string }[]

/** «Asignar unidad» a una persona de la nómina (RF-03). */
export function ModalUnidad({
  consorcioId,
  personaId,
  nombre,
  unidades,
  hoy,
}: {
  consorcioId: string
  personaId: string
  nombre: string
  unidades: Unidades
  hoy: string
}) {
  return (
    <BotonModal
      etiqueta="Asignar unidad"
      titulo={`Asignar unidad a ${nombre}`}
      variante="boton--fantasma"
    >
      <FormularioUnidad
        consorcioId={consorcioId}
        personaId={personaId}
        unidades={unidades}
        hoy={hoy}
      />
    </BotonModal>
  )
}

function FormularioUnidad({
  consorcioId,
  personaId,
  unidades,
  hoy,
}: {
  consorcioId: string
  personaId: string
  unidades: Unidades
  hoy: string
}) {
  const [estado, accion, enviando] = useActionState(accionAsignarUnidad, SIN_ERROR)
  const hayError = estado.mensaje !== ''
  // Un diálogo por fila: los ids llevan la persona para no repetirse en la página.
  const idDe = (campo: string) => `${campo}-${personaId}`
  const idError = idDe('error-unidad')

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name="persona" value={personaId} />

      <div className="campo">
        <label htmlFor={idDe('unidad')}>Unidad</label>
        <select
          key={estado.valores?.unidad ?? 'inicial'}
          id={idDe('unidad')}
          name="unidad"
          defaultValue={estado.valores?.unidad}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? idError : undefined}
        >
          {unidades.map((unidad) => (
            <option key={unidad.id} value={unidad.id}>
              {unidad.designacion}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor={idDe('tipo')}>Es</label>
        <select
          key={estado.valores?.tipoOcupacion ?? 'inicial'}
          id={idDe('tipo')}
          name="tipoOcupacion"
          defaultValue={estado.valores?.tipoOcupacion ?? 'propietario'}
        >
          <option value="propietario">Propietario</option>
          <option value="inquilino">Inquilino</option>
        </select>
      </div>

      <div className="campo">
        <label htmlFor={idDe('desde')}>Desde</label>
        <input
          id={idDe('desde')}
          name="desde"
          type="date"
          defaultValue={estado.valores?.desde ?? hoy}
          required
        />
      </div>

      {hayError && (
        <p className="error" id={idError} role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Asignando…' : 'Asignar'}
      </button>
    </form>
  )
}
