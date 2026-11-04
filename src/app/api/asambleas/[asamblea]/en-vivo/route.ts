import { ErrorDeAplicacion } from '@/compartido/errores'
import { permisoDeEscucha } from '@/aplicacion/asambleas/en-vivo'
import { AVISO_EN_VIVO, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

/**
 * El permiso para escuchar una asamblea en curso. 204: no hay servicio y la
 * pantalla queda en sondeo. Un error del servicio se relanza: el cliente reintenta.
 */
export async function GET(
  pedido: Request,
  { params }: { params: Promise<{ asamblea: string }> },
): Promise<Response> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return new Response('Iniciá sesión.', { status: 401 })

  const { asamblea: asambleaId } = await params
  const consorcioId = new URL(pedido.url).searchParams.get('consorcio') ?? ''
  try {
    const permiso = await permisoDeEscucha(HABILITACIONES, RELOJ, AVISO_EN_VIVO, {
      usuarioId,
      consorcioId,
      asambleaId,
    })
    if (!permiso) return new Response(null, { status: 204 })
    return Response.json(permiso, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion)
      return new Response('No encontramos esa asamblea.', { status: 404 })
    throw error
  }
}
