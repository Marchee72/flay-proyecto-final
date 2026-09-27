'use client'

import { ChevronsUpDown } from 'lucide-react'

import { elegirConsorcio } from './acciones'

export type ConsorcioOpcion = { id: string; nombre: string; direccion: string }

/**
 * El consorcio activo encabeza el panel y es, a la vez, el atajo para saltar
 * a otro conservando la seccion (`/consorcios/A/gastos` ->
 * `/consorcios/B/gastos`). Una tarjeta con las iniciales, el nombre y la
 * direccion enteros (el lateral viejo los cortaba); el `<select>` nativo la
 * cubre entera, transparente, asi el teclado, el lector de pantalla y el
 * telefono usan el control de siempre. Con un solo consorcio es solo la
 * tarjeta.
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
  const tarjeta = (
    <>
      <span className="selector-consorcio__insignia" aria-hidden="true">
        {siglas(activo?.nombre ?? '')}
      </span>
      <span className="selector-consorcio__texto">
        <span className="selector-consorcio__nombre">{activo?.nombre}</span>
        <span className="selector-consorcio__direccion">{activo?.direccion}</span>
      </span>
    </>
  )

  if (consorcios.length < 2) return <div className="selector-consorcio">{tarjeta}</div>

  return (
    <form action={elegirConsorcio} className="selector-consorcio">
      {tarjeta}
      <ChevronsUpDown className="icono selector-consorcio__flecha" aria-hidden="true" />
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
      <button className="oculto" type="submit">
        Ir
      </button>
    </form>
  )
}

/** «Pellegrini 1234» → «PE»; «San Martin 7890» → «SM». */
function siglas(nombre: string): string {
  const palabras = nombre.split(/\s+/).filter((p) => /^\p{L}/u.test(p))
  if (palabras.length >= 2) return (palabras[0]![0]! + palabras[1]![0]!).toUpperCase()
  return (palabras[0] ?? nombre).slice(0, 2).toUpperCase()
}
