import { ErrorDeAplicacion } from '@/compartido/errores'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { icsDeAsamblea } from '@/aplicacion/asambleas/ver'

/**
 * El `.ics` de una asamblea (FR-007, research R-08), para Apple y Outlook. Con
 * sesión y autorizado contra el consorcio, como cualquier lectura. El `UID`
 * es el de la asamblea: descargarlo de nuevo actualiza el mismo evento.
 */
export async function GET(
  pedido: Request,
  { params }: { params: Promise<{ asamblea: string }> },
): Promise<Response> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return new Response('Iniciá sesión para descargar el evento.', { status: 401 })

  const { asamblea: asambleaId } = await params
  const consorcioId = new URL(pedido.url).searchParams.get('consorcio') ?? ''
  try {
    const ics = await icsDeAsamblea(HABILITACIONES, RELOJ, { usuarioId, consorcioId, asambleaId })
    return new Response(ics, {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'attachment; filename="asamblea.ics"',
      },
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion)
      return new Response('No encontramos esa asamblea.', { status: 404 })
    throw error
  }
}
