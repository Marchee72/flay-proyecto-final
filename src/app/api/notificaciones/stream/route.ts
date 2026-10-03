import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import {
  suscribirNotificaciones,
  type NotificacionEvento,
} from '@/aplicacion/comunicacion/eventos-notificaciones'

export const dynamic = 'force-dynamic'

/**
 * Canal Server-Sent Events (SSE) para entrega en tiempo real de notificaciones.
 * Cada cliente suscrito recibe sus avisos en el instante en que se emiten.
 */
export async function GET(pedido: Request) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) {
    return new Response('sin sesión', { status: 401 })
  }

  const encoder = new TextEncoder()
  let desuscribir: (() => void) | null = null
  let pingIntervalo: NodeJS.Timeout | null = null

  const stream = new ReadableStream({
    start(controller) {
      // Mensaje inicial de bienvenida / conexión
      controller.enqueue(encoder.encode(': conexion_establecida\n\n'))

      // Suscripción al bus de eventos
      desuscribir = suscribirNotificaciones(usuarioId, (evento: NotificacionEvento) => {
        try {
          const paquete = `data: ${JSON.stringify(evento.notificacion)}\n\n`
          controller.enqueue(encoder.encode(paquete))
        } catch {
          // Si el controlador cerró, la limpieza se hace en cancel()
        }
      })

      // Keepalive cada 15 segundos para evitar timeouts de proxies
      pingIntervalo = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          if (pingIntervalo) clearInterval(pingIntervalo)
        }
      }, 15_000)
    },
    cancel() {
      if (desuscribir) {
        desuscribir()
        desuscribir = null
      }
      if (pingIntervalo) {
        clearInterval(pingIntervalo)
        pingIntervalo = null
      }
    },
  })

  // Limpieza si el cliente aborta la conexión
  pedido.signal.addEventListener('abort', () => {
    if (desuscribir) {
      desuscribir()
      desuscribir = null
    }
    if (pingIntervalo) {
      clearInterval(pingIntervalo)
      pingIntervalo = null
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
