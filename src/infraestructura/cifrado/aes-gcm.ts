import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Cifrado autenticado simetrico AES-256-GCM para resguardo de credenciales
 * de pasarelas de pago (`RF-28`, punto 14.1).
 *
 * Formato empaquetado: `iv.tag.cifrado` (cada parte en Base64 URL-safe o estandar).
 */

const ALGORITMO = 'aes-256-gcm'
const LONGITUD_CLAVE_BYTES = 32
const LONGITUD_IV_BYTES = 12

function validarClave(claveBase64: string): Buffer {
  const buffer = Buffer.from(claveBase64, 'base64')
  if (buffer.length !== LONGITUD_CLAVE_BYTES) {
    throw new Error(
      `La clave de cifrado debe tener exactamente ${LONGITUD_CLAVE_BYTES} bytes (recibidos: ${buffer.length}).`,
    )
  }
  return buffer
}

export function cifrarTexto(textoPlano: string, claveBase64: string): string {
  const claveBuffer = validarClave(claveBase64)
  const iv = randomBytes(LONGITUD_IV_BYTES)

  const cipher = createCipheriv(ALGORITMO, claveBuffer, iv)
  const cifrado = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${iv.toString('base64')}.${tag.toString('base64')}.${cifrado.toString('base64')}`
}

export function descifrarTexto(empaquetado: string, claveBase64: string): string {
  const claveBuffer = validarClave(claveBase64)
  const partes = empaquetado.split('.')

  if (partes.length !== 3) {
    throw new Error('Formato de texto cifrado invalido. Se esperaba iv.tag.cifrado.')
  }

  const [ivBase64, tagBase64, cifradoBase64] = partes
  const iv = Buffer.from(ivBase64, 'base64')
  const tag = Buffer.from(tagBase64, 'base64')
  const cifrado = Buffer.from(cifradoBase64, 'base64')

  const decipher = createDecipheriv(ALGORITMO, claveBuffer, iv)
  decipher.setAuthTag(tag)

  const descifrado = Buffer.concat([decipher.update(cifrado), decipher.final()])
  return descifrado.toString('utf8')
}
