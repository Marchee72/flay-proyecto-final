'use client'

import { useActionState } from 'react'

import { BotonModal } from '../modal'
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
  const campo = (
    id: string,
    etiqueta: string,
    valor: number | null | undefined,
    ayuda: string,
    requerido = true,
  ) => (
    <div className="campo">
      <label htmlFor={`${id}-${sufijo}`}>{etiqueta}</label>
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
      <p className="ayuda" id={`ayuda-${id}-${sufijo}`}>
        {ayuda}
      </p>
    </div>
  )

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      {espacio && <input type="hidden" name="espacio" value={espacio.id} />}
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
      {campo(
        'capacidad',
        'Capacidad máxima',
        espacio?.capacidadMaxima,
        'Personas. Vacío si no hay tope.',
        false,
      )}
      {campo(
        'anticipacionMinima',
        'Anticipación mínima',
        espacio?.anticipacionMinimaHoras ?? 48,
        'Horas antes del inicio.',
      )}
      {campo(
        'anticipacionMaxima',
        'Anticipación máxima',
        espacio?.anticipacionMaximaDias ?? 60,
        'Días antes del inicio.',
      )}
      {campo(
        'duracionMaxima',
        'Duración máxima',
        espacio?.duracionMaximaHoras ?? 8,
        'Horas seguidas.',
      )}
      {campo(
        'topeMensual',
        'Reservas por mes y unidad',
        espacio?.reservasMaxMesUnidad ?? 2,
        'Tope mensual por unidad.',
      )}
      {hayError && (
        <p className="error" id={`error-${sufijo}`} role="alert">
          {estado.mensaje}
        </p>
      )}
      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}
