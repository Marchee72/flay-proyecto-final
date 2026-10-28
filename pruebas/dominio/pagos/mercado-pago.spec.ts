import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProcesadorMercadoPago } from '@/infraestructura/pagos/mercado-pago'

const credenciales = { accessToken: 'TEST-1234' }

function respuestaPreferencia() {
  return new Response(
    JSON.stringify({
      id: 'pref_1',
      init_point: 'https://www.mercadopago.com.ar/checkout/start?pref_id=pref_1',
      sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/pay?pref_id=pref_1',
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

describe('ProcesadorMercadoPago.crearPreferencia', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('devuelve init_point aunque la respuesta traiga sandbox_init_point', async () => {
    const fetchFalso = vi.fn(async (_url: string, _opciones: RequestInit) => respuestaPreferencia())
    vi.stubGlobal('fetch', fetchFalso)

    const resultado = await new ProcesadorMercadoPago().crearPreferencia({
      credenciales,
      intentoId: 'intento-1',
      titulo: 'Expensas 09/2026 - 3B',
      importe: '1000.00',
      urlRetorno: 'https://flay.app/consorcios/c/expensas/d',
      urlNotificacion: 'https://flay.app/api/pagos/webhook?consorcio=c',
      venceEn: new Date('2026-10-29T12:00:00Z'),
    })

    expect(resultado.urlPago).toContain('mercadopago.com.ar/checkout')
    expect(resultado.urlPago).not.toContain('sandbox')
  })

  it('no envia back_urls, auto_return ni notification_url si la URL publica no es HTTPS', async () => {
    const fetchFalso = vi.fn(async (_url: string, _opciones: RequestInit) => respuestaPreferencia())
    vi.stubGlobal('fetch', fetchFalso)

    await new ProcesadorMercadoPago().crearPreferencia({
      credenciales,
      intentoId: 'intento-1',
      titulo: 'Expensas 09/2026 - 3B',
      importe: '1000.00',
      urlRetorno: 'http://localhost:3000/consorcios/c/expensas/d',
      urlNotificacion: 'http://localhost:3000/api/pagos/webhook?consorcio=c',
      venceEn: new Date('2026-10-29T12:00:00Z'),
    })

    const [, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    const cuerpo = JSON.parse(String(opciones.body)) as Record<string, unknown>
    expect(cuerpo).not.toHaveProperty('back_urls')
    expect(cuerpo).not.toHaveProperty('auto_return')
    expect(cuerpo).not.toHaveProperty('notification_url')
  })
})
