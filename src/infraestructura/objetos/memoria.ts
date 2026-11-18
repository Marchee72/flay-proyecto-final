import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'

/**
 * Almacen sin red para los e2e en CI, que no tiene R2 ni Neon (`FLAY_ALMACEN=memoria`).
 * La lectura devuelve una URL `data:` con los bytes: `fetch` la baja igual que una prefirmada.
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
    // Los documentos sembrados por los e2e no pasan por `guardar`: se ven vacíos.
    const bytes =
      guardados.get(clave) ?? (clave.startsWith('documentos/') ? new Uint8Array() : undefined)
    if (!bytes) throw new Error(`no existe ${clave}`)
    return `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`
  },
  async eliminar(clave) {
    guardados.delete(clave)
  },
}
