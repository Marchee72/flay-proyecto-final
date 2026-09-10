import { ErrorDeAplicacion } from '@/compartido/errores'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { pedirPermisoDeSubida } from '@/aplicacion/gastos/comprobantes'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

/**
 * Permiso de subida de un comprobante (FR-018, FR-018b).
 *
 * Es una ruta y no una accion de servidor porque el navegador la llama antes de
 * subir, con el peso y el tipo del archivo ya elegidos, y necesita la respuesta
 * para decidir si sigue. Verifica habilitacion, tipo y tamano **antes** de
 * emitir el permiso: un archivo de 26 MB se rechaza sin haber viajado.
 *
 * El archivo no pasa por aca. Lo que sale es un permiso de corta duracion.
 */
export async function POST(pedido: Request): Promise<Response> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return json({ mensaje: 'Iniciá sesión para subir comprobantes.' }, 401)

  let cuerpo: Record<string, unknown>
  try {
    cuerpo = (await pedido.json()) as Record<string, unknown>
  } catch {
    return json({ mensaje: 'El pedido no se entiende.' }, 400)
  }

  try {
    const permiso = await pedirPermisoDeSubida(ALMACEN, HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: String(cuerpo.consorcio ?? ''),
      gastoId: String(cuerpo.gasto ?? ''),
      tipoContenido: String(cuerpo.tipoContenido ?? ''),
      bytes: Number(cuerpo.bytes ?? 0),
      nombre: String(cuerpo.nombre ?? 'comprobante'),
    })

    return json(permiso, 200)
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) {
      return json({ mensaje: error.mensajeParaUsuario }, 422)
    }
    throw error
  }
}

const json = (cuerpo: unknown, status: number) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
