import { ErrorDeAplicacion } from '@/compartido/errores'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { plantillaPara } from '@/aplicacion/importacion/plantilla'

/**
 * `GET /api/plantillas/{consorcio}/{padron|ocupantes}.xlsx` (RF-02, RF-03):
 * sesión, administrador del consorcio y 404 para todo lo demás (no se revela si
 * el consorcio existe).
 */
export async function GET(
  _pedido: Request,
  contexto: { params: Promise<{ consorcio: string; tipo: string }> },
): Promise<Response> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return new Response('Iniciá sesión para descargar.', { status: 401 })

  const { consorcio, tipo: pedido } = await contexto.params
  const tipo = pedido.replace(/\.xlsx$/, '')
  if (tipo !== 'padron' && tipo !== 'ocupantes') return new Response(null, { status: 404 })

  try {
    const { nombre, bytes } = await plantillaPara(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: consorcio,
      tipo,
    })
    return new Response(bytes as BodyInit, {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${nombre}"`,
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return new Response(null, { status: 404 })
    throw error
  }
}
