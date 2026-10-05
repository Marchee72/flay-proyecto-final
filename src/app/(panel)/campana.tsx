'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  Bell,
  CalendarCheck,
  Check,
  Clock,
  FileText,
  Megaphone,
  MessageSquareWarning,
} from 'lucide-react'

import { avisar } from '@/app/avisos'

type Notificacion = {
  id: string
  tipo: string
  titulo: string
  cuerpo: string
  creadaEn: string
  leida: boolean
}

const CADA_MS = 20_000

const TIPOS: Record<string, { Icono: typeof Bell; tono: string }> = {
  liquidacion_publicada: { Icono: FileText, tono: 'aviso-tono--verde' },
  cambio_estado_reclamo: { Icono: MessageSquareWarning, tono: 'aviso-tono--ambar' },
  reserva_confirmada: { Icono: CalendarCheck, tono: 'aviso-tono--azul' },
  reserva_rechazada: { Icono: CalendarCheck, tono: 'aviso-tono--rojo' },
  vencimiento_proximo: { Icono: Clock, tono: 'aviso-tono--rojo' },
  novedad: { Icono: Megaphone, tono: 'aviso-tono--azul' },
}

/** «hace 3 min», «hace 2 h», «ayer», «24/09». */
function cuando(iso: string, ahora: number): string {
  const segundos = Math.max(0, (ahora - new Date(iso).getTime()) / 1000)
  if (segundos < 60) return 'recién'
  if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`
  if (segundos < 86_400) return `hace ${Math.floor(segundos / 3600)} h`
  if (segundos < 172_800) return 'ayer'
  const [, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}`
}

/**
 * La campana del panel (rediseño 013): contador de sin leer, panel con los
 * ultimos avisos. Cuando llega uno nuevo con la pestaña abierta lo saca por la
 * pila de avisos del layout raiz, la misma que usa el resto de la aplicacion.
 * Sondea cada 20 s solo con la pestaña visible, y al
 * volver a ella. Abrir el panel no marca nada: se marca al tocar un aviso o
 * con «Marcar todo como leído».
 */
export function Campana() {
  const [datos, setDatos] = useState<{ noLeidas: number; notificaciones: Notificacion[] }>({
    noLeidas: 0,
    notificaciones: [],
  })
  const [abierto, setAbierto] = useState(false)
  const [soloSinLeer, setSoloSinLeer] = useState(false)
  const vistos = useRef<Set<string> | null>(null)
  const raiz = useRef<HTMLDivElement | null>(null)
  const panelId = useId()

  const abrir = useCallback(() => setAbierto(true), [])

  const consultar = useCallback(async () => {
    const respuesta = await fetch('/api/notificaciones', { cache: 'no-store' }).catch(() => null)
    if (!respuesta?.ok) return
    const nuevos: { noLeidas: number; notificaciones: Notificacion[] } = await respuesta.json()
    // La primera carga solo aprende lo que ya estaba: no es «nuevo».
    if (vistos.current) {
      const llegado = nuevos.notificaciones.find((n) => !n.leida && !vistos.current!.has(n.id))
      if (llegado) avisar(llegado.titulo, 'novedad', { etiqueta: 'Ver', alHacerClic: abrir })
    }
    vistos.current = new Set(nuevos.notificaciones.map((n) => n.id))
    setDatos(nuevos)
  }, [abrir])

  useEffect(() => {
    void consultar()
    const temporizador = setInterval(() => {
      if (!document.hidden) void consultar()
    }, CADA_MS)
    const alVolver = () => {
      if (!document.hidden) void consultar()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(temporizador)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [consultar])

  // Conexión en tiempo real por Server-Sent Events (SSE).
  // Al llegar una novedad u otro aviso, actualiza la campana y dispara el toast de inmediato.
  useEffect(() => {
    let fuente: EventSource | null = null
    try {
      fuente = new EventSource('/api/notificaciones/stream')
      fuente.onmessage = (evento) => {
        try {
          if (!evento.data || evento.data.startsWith(':')) return
          const notificacion: Notificacion = JSON.parse(evento.data)
          setDatos((previo) => {
            if (previo.notificaciones.some((n) => n.id === notificacion.id)) return previo
            return {
              noLeidas: previo.noLeidas + 1,
              notificaciones: [notificacion, ...previo.notificaciones],
            }
          })
          if (vistos.current) {
            vistos.current.add(notificacion.id)
          }
          avisar(notificacion.titulo, 'novedad', { etiqueta: 'Ver', alHacerClic: abrir })
        } catch {
          // Paquete no JSON o keepalive
        }
      }
    } catch {
      // Si el entorno no soporta EventSource, el sondeo periódico actúa de red
    }

    return () => {
      if (fuente) {
        fuente.close()
      }
    }
  }, [abrir])

  // El panel se cierra con Escape o tocando afuera.
  useEffect(() => {
    if (!abierto) return
    const afuera = (evento: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(evento.target as Node)) setAbierto(false)
    }
    const escape = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', afuera)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', afuera)
      document.removeEventListener('keydown', escape)
    }
  }, [abierto])

  const marcar = async (ids?: string[]) => {
    setDatos((previo) => ({
      noLeidas: ids ? Math.max(0, previo.noLeidas - ids.length) : 0,
      notificaciones: previo.notificaciones.map((n) =>
        !ids || ids.includes(n.id) ? { ...n, leida: true } : n,
      ),
    }))
    await fetch('/api/notificaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids ? { ids } : {}),
    }).catch(() => null)
  }

  const ahora = Date.now()
  const lista = soloSinLeer ? datos.notificaciones.filter((n) => !n.leida) : datos.notificaciones

  return (
    <div className="campana" ref={raiz}>
      <button
        type="button"
        className="panel__icono"
        aria-label={
          datos.noLeidas > 0 ? `Notificaciones, ${datos.noLeidas} sin leer` : 'Notificaciones'
        }
        aria-expanded={abierto}
        aria-controls={panelId}
        onClick={() => setAbierto(!abierto)}
      >
        <Bell className="icono" aria-hidden="true" />
        {datos.noLeidas > 0 && (
          <span className="campana__cuenta" aria-hidden="true">
            {datos.noLeidas > 9 ? '9+' : datos.noLeidas}
          </span>
        )}
      </button>

      <section
        id={panelId}
        className="campana__panel"
        aria-label="Notificaciones"
        hidden={!abierto}
      >
        <div className="campana__cabeza">
          <h2>Notificaciones</h2>
          <button
            type="button"
            className="boton boton--terciario"
            onClick={() => void marcar()}
            disabled={datos.noLeidas === 0}
          >
            <Check className="icono" aria-hidden="true" />
            Marcar todo como leído
          </button>
        </div>
        <div className="campana__filtro">
          <button type="button" aria-pressed={!soloSinLeer} onClick={() => setSoloSinLeer(false)}>
            Todas
          </button>
          <button type="button" aria-pressed={soloSinLeer} onClick={() => setSoloSinLeer(true)}>
            Sin leer
            {datos.noLeidas > 0 && <span className="campana__chip">{datos.noLeidas}</span>}
          </button>
        </div>
        {lista.length === 0 ? (
          <div className="campana__vacio">
            <span className="aviso-tono aviso-tono--verde">
              <Check className="icono" aria-hidden="true" />
            </span>
            <strong>Estás al día</strong>
            <span>{soloSinLeer ? 'No quedan avisos sin leer.' : 'Todavía no hay avisos.'}</span>
          </div>
        ) : (
          <ul className="campana__lista">
            {lista.map((n) => {
              const { Icono, tono } = TIPOS[n.tipo] ?? TIPOS.novedad!
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className={n.leida ? 'campana__item' : 'campana__item campana__item--nueva'}
                    onClick={() => (n.leida ? undefined : void marcar([n.id]))}
                  >
                    <span className={`aviso-tono ${tono}`}>
                      <Icono className="icono" aria-hidden="true" />
                    </span>
                    <span className="campana__texto">
                      <strong>{n.titulo}</strong>
                      <span>{n.cuerpo}</span>
                      <small>{cuando(n.creadaEn, ahora)}</small>
                    </span>
                    <span className="campana__punto" aria-hidden="true" />
                    <span className="oculto">{n.leida ? 'Leída' : 'Sin leer'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
