import { Building2 } from 'lucide-react'

import { elegirConsorcio } from './acciones'

export type ConsorcioOpcion = { id: string; nombre: string }

/**
 * Atajo de la barra para saltar a otro consorcio conservando la seccion
 * (`/consorcios/A/gastos` -> `/consorcios/B/gastos`). El contexto es la
 * ruta; esto solo la reescribe. Con un solo consorcio no hay nada que elegir.
 */
export function SelectorDeConsorcio({
  consorcios,
  activoId,
}: {
  consorcios: ConsorcioOpcion[]
  activoId?: string
}) {
  if (consorcios.length < 2) return null

  return (
    <form action={elegirConsorcio} className="selector-consorcio">
      <Building2 className="icono" aria-hidden="true" />
      <label className="oculto" htmlFor="consorcio-activo">
        Cambiar de consorcio
      </label>
      <select
        id="consorcio-activo"
        name="consorcio"
        aria-label="Cambiar de consorcio"
        defaultValue={activoId ?? ''}
      >
        {!activoId && <option value="">Elegir consorcio</option>}
        {consorcios.map((consorcio) => (
          <option key={consorcio.id} value={consorcio.id}>
            {consorcio.nombre}
          </option>
        ))}
      </select>
      <button className="boton boton--fantasma" type="submit">
        Ir
      </button>
    </form>
  )
}
