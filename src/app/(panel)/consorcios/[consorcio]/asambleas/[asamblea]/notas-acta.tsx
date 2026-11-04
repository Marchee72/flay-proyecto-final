'use client'

import { unstable_rethrow } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { PuntoVista, VistaAsamblea } from '@/aplicacion/asambleas/ver'
import { avisar } from '@/app/avisos'

import { accionNotas } from './acciones'

const ESPERA_MS = 1000

type AlPerder = (puntoId: string, texto: string) => void

/**
 * Un `textarea` no controlado: el refresco en vivo de la sala no pisa lo que se
 * está escribiendo. Se guarda solo, y al desaparecer intenta guardar lo último:
 * si el punto ya se cerró, la base lo rechaza y el texto vuelve por `alPerder`.
 */
function CampoNota({
  vista,
  punto,
  alPerder,
}: {
  vista: VistaAsamblea
  punto: PuntoVista
  alPerder: AlPerder
}) {
  const { consorcioId, id: asambleaId } = vista
  const puntoId = punto.id
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined)
  const guardado = useRef(punto.notas ?? '')
  const ultimo = useRef(punto.notas ?? '')
  const montado = useRef(true)

  const guardar = useCallback(
    async (notas: string) => {
      clearTimeout(temporizador.current)
      const anterior = guardado.current
      if (notas === anterior) return
      guardado.current = notas
      const datos = new FormData()
      datos.set('consorcio', consorcioId)
      datos.set('asamblea', asambleaId)
      datos.set('punto', puntoId)
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
      if (!montado.current) alPerder(puntoId, notas)
    },
    [consorcioId, asambleaId, puntoId, alPerder],
  )

  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
      void guardar(ultimo.current)
    }
  }, [guardar])

  return (
    <div className="campo campo--ancho">
      <label htmlFor={`notas-${puntoId}`}>Lo que se va debatiendo</label>
      <textarea
        id={`notas-${puntoId}`}
        rows={4}
        defaultValue={punto.notas ?? ''}
        onChange={(e) => {
          const notas = e.target.value
          ultimo.current = notas
          clearTimeout(temporizador.current)
          temporizador.current = setTimeout(() => void guardar(notas), ESPERA_MS)
        }}
        onBlur={(e) => void guardar(e.target.value)}
      />
    </div>
  )
}

/**
 * Las notas de la reunión (RF-32): la fuente del borrador del acta. Un punto se
 * debate al abrirlo, así que solo se escribe en el abierto; las de los cerrados
 * quedan para leer.
 */
export function NotasActa({ vista }: { vista: VistaAsamblea }) {
  const [perdidas, setPerdidas] = useState<Record<string, string>>({})
  const alPerder = useCallback<AlPerder>(
    (puntoId, texto) => setPerdidas((actuales) => ({ ...actuales, [puntoId]: texto })),
    [],
  )
  const abierto = vista.puntos.find((p) => p.estado === 'abierto')
  const cerradas = vista.puntos.filter((p) => p.estado === 'cerrado' && p.notas).reverse()

  return (
    <section className="tarjeta" aria-labelledby="notas-titulo">
      <h2 id="notas-titulo">Notas para el acta</h2>
      <p className="ayuda">
        Solo las ven quien dirige y el secretario/a. Se guardan solas y no van al acta: al
        finalizar, la IA las usa para proponer el borrador de cada resumen.
      </p>
      {abierto ? (
        <>
          <h3>
            {abierto.orden}. {abierto.titulo}
          </h3>
          <CampoNota key={abierto.id} vista={vista} punto={abierto} alPerder={alPerder} />
        </>
      ) : (
        <p className="apagado">
          No hay ningún punto abierto. Se escribe cuando se abra el próximo.
        </p>
      )}
      {Object.entries(perdidas).map(([puntoId, texto]) => (
        <div key={puntoId} className="campo campo--ancho aviso aviso--atencion">
          <label htmlFor={`perdida-${puntoId}`}>No se guardó: copialo</label>
          <textarea id={`perdida-${puntoId}`} rows={3} readOnly value={texto} />
        </div>
      ))}
      {cerradas.map((p) => (
        <div key={p.id} className="notas-acta__cerrada">
          <h3>
            {p.orden}. {p.titulo}
          </h3>
          <p className="ayuda">{p.notas}</p>
        </div>
      ))}
    </section>
  )
}
