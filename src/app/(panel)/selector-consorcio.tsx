'use client'

import { Building2, ChevronsUpDown } from 'lucide-react'

import { elegirConsorcio } from './acciones'

export type ConsorcioOpcion = { id: string; nombre: string }

/**
 * El consorcio activo encabeza el lateral y es, a la vez, el atajo para
 * saltar a otro conservando la seccion (`/consorcios/A/gastos` ->
 * `/consorcios/B/gastos`). Un solo control nombra y cambia: nada de repetir
 * el nombre en un titulo aparte. Con un solo consorcio es solo el nombre.
 *
 * Elegir ya navega: el boton «Ir» queda solo para cuando no hay JavaScript,
 * oculto a la vista pero enviable.
 */
export function SelectorDeConsorcio({
  consorcios,
  activoId,
}: {
  consorcios: ConsorcioOpcion[]
  activoId: string
}) {
  const activo = consorcios.find((c) => c.id === activoId)

  if (consorcios.length < 2)
    return (
      <p className="selector-consorcio">
        <Building2 className="icono" aria-hidden="true" />
        <span className="selector-consorcio__nombre">{activo?.nombre}</span>
      </p>
    )

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
        defaultValue={activoId}
        onChange={(evento) => evento.currentTarget.form?.requestSubmit()}
      >
        {consorcios.map((consorcio) => (
          <option key={consorcio.id} value={consorcio.id}>
            {consorcio.nombre}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="icono selector-consorcio__flecha" aria-hidden="true" />
      <button className="oculto" type="submit">
        Ir
      </button>
    </form>
  )
}
