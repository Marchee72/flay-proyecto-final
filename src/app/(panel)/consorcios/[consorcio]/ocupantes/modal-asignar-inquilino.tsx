'use client'

import { useActionState, useState } from 'react'

import { errorDeFinDeAlquiler } from '@/aplicacion/consorcios/inquilinos-reglas'
import { errorDeCorreo } from '@/aplicacion/identidad/correo-reglas'

import { BotonModal } from '../../../modal'
import { accionAsignarInquilino, type Resultado } from './acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

/** Modal para asignar un inquilino a una unidad funcional (RF-03, FR-008b). */
export function ModalAsignarInquilino({
  consorcioId,
  unidadId,
  designacion,
  volver,
  hoy,
}: {
  consorcioId: string
  unidadId: string
  designacion: string
  volver: 'unidades' | 'mis-unidades'
  hoy: string
}) {
  return (
    <BotonModal
      etiqueta="Asignar inquilino"
      titulo={`Asignar inquilino en ${designacion}`}
      variante="boton--fantasma"
    >
      <FormularioAsignarInquilino
        consorcioId={consorcioId}
        unidadId={unidadId}
        volver={volver}
        hoy={hoy}
      />
    </BotonModal>
  )
}

function FormularioAsignarInquilino({
  consorcioId,
  unidadId,
  volver,
  hoy,
}: {
  consorcioId: string
  unidadId: string
  volver: 'unidades' | 'mis-unidades'
  hoy: string
}) {
  const [estado, accion, enviando] = useActionState(accionAsignarInquilino, SIN_ERROR)
  const [desde, setDesde] = useState(estado.valores?.desde ?? hoy)
  const [hasta, setHasta] = useState(estado.valores?.hasta ?? '')
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null)
  const hayError = estado.mensaje !== ''
  const errorHasta = errorDeFinDeAlquiler(desde, hasta)

  const idDe = (campo: string) => `${campo}-${unidadId}`
  const idError = idDe('error-asignar')
  const idErrorCorreo = idDe('error-correo')
  const idErrorHasta = `error-hasta-${unidadId}`
  const idAyudaHasta = idDe('ayuda-hasta')

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name="unidad" value={unidadId} />
      <input type="hidden" name="volver" value={volver} />

      <div className="asig-lado">
        <div className="asig-panel asig-panel--persona">
          <p className="asig-panel__titulo">Inquilino</p>
          <div className="campo">
            <label htmlFor={idDe('nombre')}>Nombre</label>
            <input
              id={idDe('nombre')}
              name="nombre"
              defaultValue={estado.valores?.nombre}
              required
              autoComplete="given-name"
              aria-invalid={hayError || undefined}
              aria-describedby={hayError ? idError : undefined}
            />
          </div>

          <div className="campo">
            <label htmlFor={idDe('apellido')}>Apellido</label>
            <input
              id={idDe('apellido')}
              name="apellido"
              defaultValue={estado.valores?.apellido}
              required
              autoComplete="family-name"
              aria-invalid={hayError || undefined}
              aria-describedby={hayError ? idError : undefined}
            />
          </div>

          <div className="campo">
            <label htmlFor={idDe('correo')}>Correo</label>
            <input
              id={idDe('correo')}
              name="correo"
              type="email"
              defaultValue={estado.valores?.correo}
              required
              autoComplete="email"
              aria-invalid={hayError || errorCorreo !== null || undefined}
              aria-describedby={errorCorreo ? idErrorCorreo : hayError ? idError : undefined}
              onChange={(e) =>
                setErrorCorreo(e.target.value === '' ? null : errorDeCorreo(e.target.value))
              }
              onBlur={(e) => setErrorCorreo(errorDeCorreo(e.target.value))}
            />
            {errorCorreo && (
              <p className="error" id={idErrorCorreo}>
                {errorCorreo}
              </p>
            )}
          </div>
        </div>

        <div className="asig-panel asig-panel--contrato">
          <p className="asig-panel__titulo">Contrato</p>
          <div className="campo">
            <label htmlFor={idDe('desde')}>Desde</label>
            <input
              id={idDe('desde')}
              name="desde"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              required
              aria-invalid={hayError || undefined}
              aria-describedby={hayError ? idError : undefined}
            />
          </div>

          <div className="campo">
            <label htmlFor={idDe('hasta')}>Hasta</label>
            <input
              id={idDe('hasta')}
              name="hasta"
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              aria-invalid={errorHasta !== null || hayError || undefined}
              aria-describedby={
                errorHasta
                  ? `${idErrorHasta} ${idAyudaHasta}`
                  : hayError
                    ? `${idError} ${idAyudaHasta}`
                    : idAyudaHasta
              }
            />
            {errorHasta && (
              <p className="error" id={idErrorHasta}>
                {errorHasta}
              </p>
            )}
          </div>
          <p className="ayuda" id={idAyudaHasta}>
            Fin del contrato. Vacío: sin fecha.
          </p>
        </div>
      </div>

      {hayError && (
        <p className="error" id={idError} role="alert">
          {estado.mensaje}
        </p>
      )}

      <div className="asig-pie">
        <button className="boton boton--primario" type="submit" disabled={enviando}>
          {enviando ? 'Asignando…' : 'Asignar'}
        </button>
      </div>
    </form>
  )
}
