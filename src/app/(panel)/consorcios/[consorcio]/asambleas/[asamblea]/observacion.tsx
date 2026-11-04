'use client'

import { useTransition } from 'react'

import type { VistaAsamblea } from '@/aplicacion/asambleas/ver'

import { accionObservacion } from './acciones'
import { Ocultos } from './comunes'
import { notificarResultado } from './direccion'

/**
 * La observación de cada presente (RF-32). El `textarea` no es controlado para
 * que el refresco en vivo no pise lo que se escribe, y va por `onSubmit` porque
 * `<form action>` lo vaciaría antes de que llegue el texto guardado.
 */
export function Observacion({ vista }: { vista: VistaAsamblea }) {
  const [guardando, iniciar] = useTransition()

  return (
    <section className="tarjeta" aria-labelledby="observacion-titulo">
      <h2 id="observacion-titulo">Tu observación</h2>
      <p className="ayuda">
        Escribí lo que quieras que se tenga en cuenta para el acta. Solo la leen quienes la
        redactan.
      </p>
      <form
        onSubmit={(evento) => {
          evento.preventDefault()
          const datos = new FormData(evento.currentTarget)
          iniciar(async () => {
            await notificarResultado(accionObservacion(datos))
          })
        }}
      >
        <Ocultos vista={vista} />
        <div className="campo campo--ancho">
          <textarea
            name="texto"
            aria-labelledby="observacion-titulo"
            rows={4}
            maxLength={1000}
            defaultValue={vista.yo.miObservacion}
          />
        </div>
        <button className="boton boton--primario" type="submit" disabled={guardando}>
          Guardar observación
        </button>
      </form>
    </section>
  )
}
