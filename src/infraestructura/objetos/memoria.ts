import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'

/**
 * Almacen sin red para los e2e en CI, que no tiene R2 ni Neon (`FLAY_ALMACEN=memoria`).
 * ponytail: la direccion de lectura no sirve bytes; si un e2e necesita bajar el archivo, servirlo desde una ruta.
 */
const guardados = new Map<string, Uint8Array>()

export const almacenEnMemoria: AlmacenObjetos = {
  async emitirPermisoDeSubida(clave) {
    return { clave, credencial: 'memoria', vence: new Date(Date.now() + 60_000) }
  },
  async guardar(clave, bytes) {
    guardados.set(clave, bytes)
  },
  async resolverLecturaAutorizada(clave) {
    return `/memoria/${encodeURIComponent(clave)}`
  },
  async eliminar(clave) {
    guardados.delete(clave)
  },
}
