'use client'

import { unstable_rethrow } from 'next/navigation'
import { useRef } from 'react'

import type { PuntoVista, VistaAsamblea } from '@/aplicacion/asambleas/ver'
import { avisar } from '@/app/avisos'

import { accionNotas } from './acciones'

const ESPERA_MS = 1000

/**
 * Un `textarea` no controlado: el refresco en vivo de la sala no pisa lo que se
 * está escribiendo. Se guarda solo, para no perder texto si otra persona cierra
 * el punto mientras se anota.
 */
function CampoNota({ vista, punto }: { vista: VistaAsamblea; punto: PuntoVista }) {
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined)
  const guardado = useRef(punto.notas ?? '')

  const guardar = async (notas: string) => {
    clearTimeout(temporizador.current)
    const anterior = guardado.current
    if (notas === anterior) return
    guardado.current = notas
    const datos = new FormData()
    datos.set('consorcio', vista.consorcioId)
    datos.set('asamblea', vista.id)
    datos.set('punto', punto.id)
    datos.set('notas', notas)
    try {
      const resultado = await accionNotas(datos)
      if (resultado.ok) return
      avisar(resultado.error, 'problema')
    } catch (error) {
      unstable_rethrow(error)
      avisar('No se pudo guardar la nota: revisá la conexión.', 'problema')
    }
    guardado.current = anterior
  }

  return (
    <div className="campo campo--ancho">
      <label htmlFor={`notas-${punto.id}`}>Lo que se va debatiendo</label>
      <textarea
        id={`notas-${punto.id}`}
        rows={4}
        defaultValue={punto.notas ?? ''}
        onChange={(e) => {
          const notas = e.target.value
          clearTimeout(temporizador.current)
          temporizador.current = setTimeout(() => void guardar(notas), ESPERA_MS)
        }}
        onBlur={(e) => void guardar(e.target.value)}
      />
    </div>
  )
}

/**
 * Las notas de la reunión (RF-32): la fuente del borrador del acta. Están en
 * todos los puntos porque el debate ocurre antes de abrir la votación.
 */
export function NotasActa({ vista }: { vista: VistaAsamblea }) {
  const actual =
    vista.puntos.find((p) => p.estado === 'abierto') ??
    vista.puntos.find((p) => p.estado === 'pendiente')

  return (
    <section className="tarjeta" aria-labelledby="notas-titulo">
      <h2 id="notas-titulo">Notas para el acta</h2>
      <p className="ayuda">
        Solo las ven quien dirige y el secretario/a. Se guardan solas y no van al acta: al
        finalizar, la IA las usa para proponer el borrador de cada resumen.
      </p>
      {vista.puntos.map((p) => (
        <details key={p.id} className="sala__votos" open={p.id === actual?.id}>
          <summary>
            {p.orden}. {p.titulo}
          </summary>
          <CampoNota vista={vista} punto={p} />
        </details>
      ))}
    </section>
  )
}
