import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { NoEncontrado } from '@/compartido/errores'
import type {
  AlmacenObjetos,
  PermisoDeSubida,
  TipoComprobante,
} from '@/dominio/contratos/almacen-objetos'

/**
 * Almacenamiento de objetos sobre Cloudflare R2 (FR-018b, FR-019, research R-05).
 *
 * R2 habla el protocolo S3, asi que el adaptador usa el SDK de S3 contra el
 * endpoint de R2. El puerto no expone «recibir bytes» del navegador: emite una
 * URL prefirmada de corta duracion y el navegador sube **directo**. No es una
 * optimizacion —la plataforma limita el cuerpo de un pedido muy por debajo de
 * los 25 MB que admite un comprobante—, asi que sin esto el requisito no se
 * cumple.
 *
 * El dominio no nombra al proveedor: lo consume por el puerto.
 */

const MINUTOS_DE_VALIDEZ = 10

function entorno(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) throw new Error(`Falta ${nombre}`)
  return valor
}

let clienteMemo: S3Client | null = null
function cliente(): S3Client {
  if (!clienteMemo) {
    clienteMemo = new S3Client({
      region: 'auto',
      endpoint: entorno('R2_ENDPOINT'),
      credentials: {
        accessKeyId: entorno('R2_ACCESS_KEY_ID'),
        secretAccessKey: entorno('R2_SECRET_ACCESS_KEY'),
      },
    })
  }
  return clienteMemo
}

const bucket = () => entorno('R2_BUCKET')

function esAusente(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } }
  return e.name === 'NotFound' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404
}

export const almacenR2: AlmacenObjetos = {
  async emitirPermisoDeSubida(
    clave: string,
    tipoContenido: TipoComprobante,
    bytesMaximos: number,
  ): Promise<PermisoDeSubida> {
    const vence = new Date(Date.now() + MINUTOS_DE_VALIDEZ * 60_000)

    // La URL prefirmada ata la clave y el tipo de contenido: el navegador debe
    // mandar ese `Content-Type` o la firma no valida.
    // ponytail: el PUT prefirmado no corta el tamano del lado del almacen (eso
    // lo da `createPresignedPost` con `content-length-range`). `bytesMaximos` se
    // valida al emitir el permiso y en el formulario, y quien sube esta
    // autenticado, no es subida anonima. Si hace falta cortarlo en el almacen,
    // migrar a POST firmado.
    void bytesMaximos
    const credencial = await getSignedUrl(
      cliente(),
      new PutObjectCommand({ Bucket: bucket(), Key: clave, ContentType: tipoContenido }),
      { expiresIn: MINUTOS_DE_VALIDEZ * 60 },
    )

    return { clave, credencial, vence }
  },

  /**
   * Los bytes del documento de expensa los produce el servidor, asi que aca si
   * atraviesan el proceso: son unos pocos kilobytes de PDF, no los 25 MB de un
   * comprobante (`003-liquidacion` research R-01).
   */
  async guardar(clave: string, bytes: Uint8Array, tipoContenido: 'application/pdf'): Promise<void> {
    await cliente().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: clave,
        Body: bytes,
        ContentType: tipoContenido,
      }),
    )
  },

  /**
   * Lectura autorizada. El comprobante no es publico: la direccion se resuelve
   * recien cuando alguien con habilitacion vigente lo pide (FR-018). A diferencia
   * de un almacen de URL publica, la URL prefirmada **vence**: `duracionSegundos`
   * se respeta de verdad.
   */
  async resolverLecturaAutorizada(
    clave: string,
    duracionSegundos: number,
    opciones?: { enLinea?: boolean },
  ): Promise<string> {
    // Un objeto registrado pero ausente del almacen (semilla sin token, baja
    // manual) es un «no encontrado» para quien mira, no una traza en pantalla.
    await cliente()
      .send(new HeadObjectCommand({ Bucket: bucket(), Key: clave }))
      .catch((error: unknown) => {
        if (esAusente(error)) throw new NoEncontrado('FR-018')
        throw error
      })

    return getSignedUrl(
      cliente(),
      new GetObjectCommand({
        Bucket: bucket(),
        Key: clave,
        ResponseContentDisposition: opciones?.enLinea ? 'inline' : 'attachment',
      }),
      { expiresIn: duracionSegundos },
    )
  },

  async eliminar(clave: string): Promise<void> {
    await cliente().send(new DeleteObjectCommand({ Bucket: bucket(), Key: clave }))
  },
}
