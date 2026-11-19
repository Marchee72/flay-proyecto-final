'use client'

import { useActionState, useState } from 'react'

import { errorDeHorario, horaDesdeMinutos } from '@/aplicacion/reservas/horario-reglas'

import { BotonModal } from '../../../modal'
import { accionGuardarEspacio, type Resultado } from '../reservas/acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

type Espacio = {
  id: string
  nombre: string
  capacidadMaxima: number | null
  anticipacionMinimaHoras: number
  anticipacionMaximaDias: number
  duracionMaximaHoras: number
  reservasMaxMesUnidad: number
  horario: { apertura: number; cierre: number } | null
  rechazaConDeuda: boolean
}

/** Alta y edicion de un espacio comun con sus reglas (`RF-15`). */
export function ModalEspacio({ consorcioId, espacio }: { consorcioId: string; espacio?: Espacio }) {
  const titulo = espacio ? `Editar ${espacio.nombre}` : 'Nuevo espacio'
  return (
    <BotonModal
      etiqueta={espacio ? 'Editar' : 'Nuevo espacio'}
      titulo={titulo}
      variante={espacio ? 'boton--fantasma' : 'boton--primario'}
    >
      <FormularioEspacio consorcioId={consorcioId} espacio={espacio} />
    </BotonModal>
  )
}

function FormularioEspacio({ consorcioId, espacio }: { consorcioId: string; espacio?: Espacio }) {
  const [estado, accion, enviando] = useActionState(accionGuardarEspacio, SIN_ERROR)
  const hayError = estado.mensaje !== ''
  const sufijo = espacio?.id ?? 'nuevo'
  const [apertura, setApertura] = useState(
    espacio?.horario ? horaDesdeMinutos(espacio.horario.apertura) : '',
  )
  const [cierre, setCierre] = useState(
    espacio?.horario ? horaDesdeMinutos(espacio.horario.cierre) : '',
  )
  const errorHorario = errorDeHorario(apertura, cierre)
  // Las piezas del formulario, en el orden en que se dibujan.
  const ocultos = (
    <>
      <input type="hidden" name="consorcio" value={consorcioId} />
      {espacio && <input type="hidden" name="espacio" value={espacio.id} />}
    </>
  )
  const nombre = (
    <div className="campo">
      <label htmlFor={`nombre-${sufijo}`}>Nombre</label>
      <input
        id={`nombre-${sufijo}`}
        name="nombre"
        maxLength={80}
        required
        defaultValue={espacio?.nombre ?? ''}
        aria-invalid={hayError || undefined}
        aria-describedby={hayError ? `error-${sufijo}` : undefined}
      />
    </div>
  )
  const num = (
    id: string,
    etiqueta: string,
    valor: number | null | undefined,
    ayuda: string,
    unidad: string,
    requerido = true,
  ) => (
    <div className="campo campo--num">
      <label htmlFor={`${id}-${sufijo}`}>{etiqueta}</label>
      <span className="campo__caja">
        <input
          id={`${id}-${sufijo}`}
          name={id}
          type="number"
          min={0}
          inputMode="numeric"
          defaultValue={valor ?? ''}
          required={requerido}
          aria-describedby={`ayuda-${id}-${sufijo}`}
        />
        <span className="campo__unidad" aria-hidden="true">
          {unidad}
        </span>
      </span>
      <p className="ayuda" id={`ayuda-${id}-${sufijo}`}>
        {ayuda}
      </p>
    </div>
  )
  const numericos = [
    num(
      'capacidad',
      'Capacidad máxima',
      espacio?.capacidadMaxima,
      'Personas. Vacío si no hay tope.',
      'personas',
      false,
    ),
    num(
      'anticipacionMinima',
      'Anticipación mínima',
      espacio?.anticipacionMinimaHoras ?? 48,
      'Horas antes del inicio.',
      'horas',
    ),
    num(
      'anticipacionMaxima',
      'Anticipación máxima',
      espacio?.anticipacionMaximaDias ?? 60,
      'Días antes del inicio.',
      'días',
    ),
    num(
      'duracionMaxima',
      'Duración máxima',
      espacio?.duracionMaximaHoras ?? 8,
      'Horas seguidas.',
      'horas',
    ),
    num(
      'topeMensual',
      'Reservas por mes y unidad',
      espacio?.reservasMaxMesUnidad ?? 2,
      'Tope mensual por unidad.',
      'por mes',
    ),
  ]
  const horario = (
    <fieldset className="horario">
      <legend>Horario de uso</legend>
      <div className="horario__par">
        <div className="campo">
          <label htmlFor={`apertura-${sufijo}`}>Apertura</label>
          <input
            id={`apertura-${sufijo}`}
            name="apertura"
            type="time"
            value={apertura}
            onChange={(e) => setApertura(e.target.value)}
            aria-invalid={errorHorario ? true : undefined}
            aria-describedby={errorHorario ? `error-apertura-${sufijo}` : `ayuda-horario-${sufijo}`}
          />
        </div>
        <div className="campo">
          <label htmlFor={`cierre-${sufijo}`}>Cierre</label>
          <input
            id={`cierre-${sufijo}`}
            name="cierre"
            type="time"
            value={cierre}
            onChange={(e) => setCierre(e.target.value)}
            aria-invalid={errorHorario ? true : undefined}
            aria-describedby={errorHorario ? `error-apertura-${sufijo}` : `ayuda-horario-${sufijo}`}
          />
        </div>
      </div>
      {errorHorario && (
        <p className="error" id={`error-apertura-${sufijo}`}>
          {errorHorario}
        </p>
      )}
      <p className="ayuda" id={`ayuda-horario-${sufijo}`}>
        Vacío si se usa a cualquier hora. Si el cierre es antes que la apertura, cruza la
        medianoche.
      </p>
    </fieldset>
  )
  const deuda = (
    <div className="campo">
      <label htmlFor={`rechazaConDeuda-${sufijo}`}>
        <input
          id={`rechazaConDeuda-${sufijo}`}
          name="rechazaConDeuda"
          type="checkbox"
          defaultChecked={espacio?.rechazaConDeuda ?? true}
        />{' '}
        Rechazar reservas de unidades con deuda vencida
      </label>
    </div>
  )
  const pie = (
    <>
      {hayError && (
        <p className="error" id={`error-${sufijo}`} role="alert">
          {estado.mensaje}
        </p>
      )}
      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
    </>
  )

  return (
    <form action={accion} noValidate className="form-espacio">
      {ocultos}
      {nombre}
      {numericos}
      {horario}
      {deuda}
      {pie}
    </form>
  )
}
