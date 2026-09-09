/**
 * Almacenamiento de comprobantes (FR-018b, FR-019).
 *
 * No expone «recibir bytes» a proposito: el archivo va del navegador al
 * almacenamiento y nunca atraviesa el servidor, porque la plataforma limita el
 * cuerpo de un pedido muy por debajo de los 25 MB que admite un comprobante.
 */
export const BYTES_MAXIMOS_COMPROBANTE = 26_214_400 // 25 MB

export const TIPOS_COMPROBANTE = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/tiff',
] as const

export type TipoComprobante = (typeof TIPOS_COMPROBANTE)[number]

/** Formatos que ningun navegador muestra: se ofrecen por descarga (FR-018c). */
export const TIPOS_SOLO_DESCARGA: readonly TipoComprobante[] = ['image/heic', 'image/tiff']

export interface PermisoDeSubida {
  clave: string
  credencial: string
  vence: Date
}

export interface AlmacenObjetos {
  emitirPermisoDeSubida(
    clave: string,
    tipoContenido: TipoComprobante,
    bytesMaximos: number,
  ): Promise<PermisoDeSubida>
  resolverLecturaAutorizada(clave: string, duracionSegundos: number): Promise<string>
  eliminar(clave: string): Promise<void>
}
