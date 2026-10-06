import { z } from 'zod'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { ALMACEN, ASISTENCIA, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { conversar, type EventoAsistente } from '@/aplicacion/asistente/conversar'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

export const dynamic = 'force-dynamic'

const Cuerpo = z.object({
  consorcioId: z.string().min(1),
  conversacionId: z.string().nullable().optional(),
  texto: z.string().trim().min(1).max(2000),
  cartera: z.boolean().optional(),
})

/**
 * Un turno del asistente (RF-27) como flujo de eventos, uno JSON por linea. No es
 * SSE: `EventSource` solo hace GET y esto vive un turno, asi que no hay
 * reconexion ni keepalive que mantener. La autorizacion y el aislamiento los
 * hacen los casos de uso; aca solo se resuelve la sesion.
 */
export async function POST(pedido: Request) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return new Response('sin sesión', { status: 401 })

  const cuerpo = Cuerpo.safeParse(await pedido.json().catch(() => null))
  if (!cuerpo.success) return new Response('pedido inválido', { status: 400 })
  const datos = cuerpo.data

  const codificador = new TextEncoder()
  const flujo = new ReadableStream<Uint8Array>({
    async start(controlador) {
      const emitir = (evento: EventoAsistente) => {
        try {
          controlador.enqueue(codificador.encode(`${JSON.stringify(evento)}\n`))
        } catch {
          // El cliente se fue: no hay a quien contarle el resto.
        }
      }
      try {
        await conversar(
          ASISTENCIA,
          HABILITACIONES,
          RELOJ,
          ALMACEN,
          {
            usuarioId,
            consorcioId: datos.consorcioId,
            conversacionId: datos.conversacionId ?? undefined,
            texto: datos.texto,
            cartera: datos.cartera,
          },
          emitir,
        )
      } catch (error) {
        // Los encabezados ya salieron: el error viaja en el flujo, no como estado HTTP.
        if (error instanceof ErrorDeAplicacion) {
          emitir({ t: 'error', mensaje: error.mensajeParaUsuario })
        } else {
          console.error('[asistente]', error)
          emitir({ t: 'error', mensaje: 'No pude responder ahora. Probá de nuevo en un momento.' })
        }
      } finally {
        try {
          controlador.close()
        } catch {
          // ya cerrado por el cliente
        }
      }
    },
  })

  return new Response(flujo, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
