import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'

/**
 * Un almacen de objetos en memoria para las pruebas de las funciones
 * asistidas: la clave es la direccion, y `bajar` devuelve lo guardado.
 */
export function almacenEnMemoria(archivos: Record<string, Uint8Array>): {
  almacen: AlmacenObjetos
  bajar: (direccion: string) => Promise<Uint8Array>
} {
  return {
    almacen: {
      async emitirPermisoDeSubida(clave) {
        return { clave, credencial: 'x', vence: new Date(Date.now() + 60_000) }
      },
      async guardar(clave, bytes) {
        archivos[clave] = bytes
      },
      async resolverLecturaAutorizada(clave) {
        return clave
      },
      async eliminar(clave) {
        delete archivos[clave]
      },
    },
    async bajar(direccion) {
      const bytes = archivos[direccion]
      if (!bytes) throw new Error(`no existe ${direccion}`)
      return bytes
    },
  }
}
