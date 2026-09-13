import { ErrorDeAplicacion } from '@/compartido/errores'
import {
  PREFIJOS,
  pedirPermisoDeObjeto,
  type PrefijoDeObjeto,
} from '@/aplicacion/comunicacion/objetos'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

/**
 * Permiso de subida directa para documentos del consorcio y comprobantes
 * sueltos (`004-servicios` T058). Misma forma que `/api/comprobantes/permiso`:
 * el navegador la llama con tipo y peso, y sube solo si la respuesta es un
 * permiso. El archivo no pasa por aca.
 */
export async function POST(pedido: Request): Promise<Response> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return json({ mensaje: 'Iniciá sesión para subir archivos.' }, 401)

  let cuerpo: Record<string, unknown>
  try {
    cuerpo = (await pedido.json()) as Record<string, unknown>
  } catch {
    return json({ mensaje: 'El pedido no se entiende.' }, 400)
  }

  const prefijo = String(cuerpo.prefijo ?? '')
  if (!(prefijo in PREFIJOS)) return json({ mensaje: 'El pedido no se entiende.' }, 400)

  try {
    const permiso = await pedirPermisoDeObjeto(ALMACEN, HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: String(cuerpo.consorcio ?? ''),
      prefijo: prefijo as PrefijoDeObjeto,
      tipoContenido: String(cuerpo.tipoContenido ?? ''),
      bytes: Number(cuerpo.bytes ?? 0),
      nombre: String(cuerpo.nombre ?? 'archivo'),
    })
    return json(permiso, 200)
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return json({ mensaje: error.mensajeParaUsuario }, 422)
    throw error
  }
}

const json = (cuerpo: unknown, status: number) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })
