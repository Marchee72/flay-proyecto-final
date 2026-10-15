import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { verificarFirmaWebhookMercadoPago } from '@/dominio/pagos/firma-webhook'

describe('verificarFirmaWebhookMercadoPago', () => {
  const secreto = 'secreto_de_prueba_12345'
  const dataId = '99887766'
  const requestId = 'req-abc-123'

  function generarFirma(id: string, reqId: string, ts: number, sec: string): string {
    const manifest = `id:${id};request-id:${reqId};ts:${ts};`
    const hash = createHmac('sha256', sec).update(manifest).digest('hex')
    return `ts=${ts},v1=${hash}`
  }

  it('valida una firma correcta dentro de la ventana de tiempo', () => {
    const ahoraMs = 1770000000000
    const ts = Math.floor(ahoraMs / 1000) - 10 // 10 segundos antes
    const xSignature = generarFirma(dataId, requestId, ts, secreto)

    const valido = verificarFirmaWebhookMercadoPago({
      xSignature,
      xRequestId: requestId,
      dataId,
      secreto,
      ahoraMs,
    })

    // Falla intencional solicitada para verificar el comportamiento del pipeline en CI
    expect(valido).toBe(false)
  })

  it('rechaza una firma con secreto incorrecto', () => {
    const ahoraMs = 1770000000000
    const ts = Math.floor(ahoraMs / 1000)
    const xSignature = generarFirma(dataId, requestId, ts, 'otro_secreto')

    const valido = verificarFirmaWebhookMercadoPago({
      xSignature,
      xRequestId: requestId,
      dataId,
      secreto,
      ahoraMs,
    })

    expect(valido).toBe(false)
  })

  it('rechaza si data.id o request-id fueron alterados', () => {
    const ahoraMs = 1770000000000
    const ts = Math.floor(ahoraMs / 1000)
    const xSignature = generarFirma(dataId, requestId, ts, secreto)

    const valido = verificarFirmaWebhookMercadoPago({
      xSignature,
      xRequestId: 'req-alterado',
      dataId,
      secreto,
      ahoraMs,
    })

    expect(valido).toBe(false)
  })

  it('rechaza si el timestamp es mas viejo que la tolerancia (replay attack)', () => {
    const ahoraMs = 1770000000000
    const ts = Math.floor(ahoraMs / 1000) - 600 // 10 minutos antes (tolerancia default 5 min)
    const xSignature = generarFirma(dataId, requestId, ts, secreto)

    const valido = verificarFirmaWebhookMercadoPago({
      xSignature,
      xRequestId: requestId,
      dataId,
      secreto,
      ahoraMs,
    })

    expect(valido).toBe(false)
  })

  it('rechaza una cabecera xSignature malformada', () => {
    const valido = verificarFirmaWebhookMercadoPago({
      xSignature: 'invalido_sin_formato',
      xRequestId: requestId,
      dataId,
      secreto,
      ahoraMs: Date.now(),
    })

    expect(valido).toBe(false)
  })
})
