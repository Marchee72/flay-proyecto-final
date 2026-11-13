import { headers } from 'next/headers'

/**
 * Base de los enlaces que viajan por correo. `URL_PUBLICA` manda: las cabeceras
 * las escribe quien hace el pedido, y en una pantalla sin sesion eso permitiria
 * armar un enlace de restablecimiento hacia un sitio ajeno. Las cabeceras solo
 * quedan de respaldo para desarrollo local.
 */
export async function urlBase(): Promise<string> {
  if (process.env.URL_PUBLICA) return process.env.URL_PUBLICA.replace(/\/$/, '')

  const cabeceras = await headers()
  const protocolo = cabeceras.get('x-forwarded-proto') ?? 'http'
  return `${protocolo}://${cabeceras.get('host') ?? 'localhost:3000'}`
}
