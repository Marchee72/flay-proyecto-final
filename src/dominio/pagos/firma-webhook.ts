import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verificacion de firma de notificaciones webhook de Mercado Pago (`RF-28`).
 *
 * Mercado Pago envia en `x-signature` partes separadas por coma:
 * `ts=1700000000,v1=hash_hex`
 *
 * El manifiesto a firmar con HMAC-SHA256 es:
 * `id:[data.id];request-id:[x-request-id];ts:[ts];`
 * Los pares cuyo valor no viene se omiten (asi lo hace el validador oficial).
 */

const TOLERANCIA_SEGUNDOS_DEFAULT = 300 // 5 minutos

export interface ParametrosFirmaWebhook {
  xSignature: string | null | undefined
  xRequestId: string | null | undefined
  dataId: string | null | undefined
  secreto: string
  ahoraMs?: number
  toleranciaSegundos?: number
}

export function verificarFirmaWebhookMercadoPago(params: ParametrosFirmaWebhook): boolean {
  const {
    xSignature,
    xRequestId,
    dataId,
    secreto,
    ahoraMs = Date.now(),
    toleranciaSegundos = TOLERANCIA_SEGUNDOS_DEFAULT,
  } = params

  if (!xSignature || !secreto) {
    return false
  }

  // Parsear ts y v1 de x-signature
  const partes = xSignature.split(',')
  let tsStr: string | null = null
  let v1Hash: string | null = null

  for (const parte of partes) {
    const [clave, valor] = parte.trim().split('=')
    if (clave === 'ts') tsStr = valor
    if (clave === 'v1') v1Hash = valor
  }

  if (!tsStr || !v1Hash) {
    return false
  }

  const tsNum = Number(tsStr)
  if (Number.isNaN(tsNum)) {
    return false
  }

  // Validar tolerancia temporal contra ataques de replay
  const ahoraSegundos = Math.floor(ahoraMs / 1000)
  if (Math.abs(ahoraSegundos - tsNum) > toleranciaSegundos) {
    return false
  }

  // Construir manifiesto (los pares ausentes se omiten, como el validador oficial)
  const manifest =
    [dataId ? `id:${dataId}` : null, xRequestId ? `request-id:${xRequestId}` : null, `ts:${tsStr}`]
      .filter((parte): parte is string => parte !== null)
      .join(';') + ';'

  // Calcular HMAC
  const hmac = createHmac('sha256', secreto).update(manifest).digest('hex')

  // Comparacion en tiempo constante para prevenir ataques de temporizacion
  const bufferEsperado = Buffer.from(hmac, 'utf8')
  const bufferRecibido = Buffer.from(v1Hash, 'utf8')

  if (bufferEsperado.length !== bufferRecibido.length) {
    return false
  }

  return timingSafeEqual(bufferEsperado, bufferRecibido)
}
