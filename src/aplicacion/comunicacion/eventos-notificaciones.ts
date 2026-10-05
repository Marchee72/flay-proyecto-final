import { EventEmitter } from 'node:events'

export interface NotificacionEvento {
  usuarioId: string
  notificacion: {
    id: string
    tipo: string
    titulo: string
    cuerpo: string
    creadaEn: string
    leida: boolean
  }
}

const GLOBAL_KEY = Symbol.for('flay.bus_notificaciones')

type GlobalConBus = typeof globalThis & {
  [GLOBAL_KEY]?: EventEmitter
}

function obtenerBus(): EventEmitter {
  const g = globalThis as GlobalConBus
  if (!g[GLOBAL_KEY]) {
    const emitter = new EventEmitter()
    emitter.setMaxListeners(200)
    g[GLOBAL_KEY] = emitter
  }
  return g[GLOBAL_KEY]
}

const bus = obtenerBus()

/** Emite una o más notificaciones para los usuarios destinatarios. */
export function emitirNotificaciones(eventos: readonly NotificacionEvento[]): void {
  for (const evento of eventos) {
    bus.emit(`usuario:${evento.usuarioId}`, evento)
  }
}

/** Suscribe a un usuario para recibir sus notificaciones en tiempo real. */
export function suscribirNotificaciones(
  usuarioId: string,
  alRecibir: (evento: NotificacionEvento) => void,
): () => void {
  const canal = `usuario:${usuarioId}`
  bus.on(canal, alRecibir)
  return () => {
    bus.off(canal, alRecibir)
  }
}
