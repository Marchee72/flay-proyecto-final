import { head } from '@vercel/blob'
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'

import type {
  AlmacenObjetos,
  PermisoDeSubida,
  TipoComprobante,
} from '@/dominio/contratos/almacen-objetos'

/**
 * Almacenamiento de objetos (FR-018b, FR-019, research R-05).
 *
 * El puerto no expone «recibir bytes» y esta implementacion tampoco puede:
 * emite un permiso de corta duracion y el navegador sube **directo**. No es una
 * optimizacion —la plataforma limita el cuerpo de un pedido muy por debajo de
 * los 25 MB que admite un comprobante—, asi que sin esto el requisito no se
 * cumple.
 *
 * El dominio no nombra al proveedor: lo consume por el puerto.
 */

const MINUTOS_DE_VALIDEZ = 10

const token = () => {
  const valor = process.env.BLOB_READ_WRITE_TOKEN
  if (!valor) throw new Error('Falta BLOB_READ_WRITE_TOKEN')
  return valor
}

export const almacenBlob: AlmacenObjetos = {
  async emitirPermisoDeSubida(
    clave: string,
    tipoContenido: TipoComprobante,
    bytesMaximos: number,
  ): Promise<PermisoDeSubida> {
    const vence = new Date(Date.now() + MINUTOS_DE_VALIDEZ * 60_000)

    // El limite viaja **dentro** del permiso: si el navegador manda de mas, lo
    // corta el almacenamiento y no la buena fe del formulario.
    const credencial = await generateClientTokenFromReadWriteToken({
      token: token(),
      pathname: clave,
      validUntil: vence.getTime(),
      allowedContentTypes: [tipoContenido],
      maximumSizeInBytes: bytesMaximos,
      addRandomSuffix: false,
    })

    return { clave, credencial, vence }
  },

  /**
   * Lectura autorizada. El comprobante no es publico: la direccion se resuelve
   * recien cuando alguien con habilitacion vigente lo pide (FR-018).
   */
  async resolverLecturaAutorizada(clave: string): Promise<string> {
    const objeto = await head(clave, { token: token() })
    // ponytail: la direccion que devuelve el almacenamiento no vence. Quien
    // pide pasa antes por la habilitacion vigente, pero una direccion filtrada
    // sigue sirviendo. Cerrarlo del todo es almacen privado con direccion
    // firmada (`presignUrl`), que necesita el flujo de credencial delegada.
    return objeto.downloadUrl
  },

  async eliminar(clave: string): Promise<void> {
    const { del } = await import('@vercel/blob')
    await del(clave, { token: token() })
  },
}
