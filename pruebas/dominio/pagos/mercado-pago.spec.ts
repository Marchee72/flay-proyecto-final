import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorProcesadorPago, ProcesadorMercadoPago } from '@/infraestructura/pagos/mercado-pago'

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

function datosPreferencia(urlRetorno: string, urlNotificacion: string) {
  return {
    credenciales,
    intentoId: 'intento-1',
    titulo: 'Expensas 09/2026 - 3B',
    importe: '1000.00',
    urlRetorno,
    urlNotificacion,
    venceEn: new Date('2026-10-29T12:00:00Z'),
  }
}

describe('ProcesadorMercadoPago.crearPreferencia', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('devuelve init_point aunque la respuesta traiga sandbox_init_point', async () => {
    const fetchFalso = vi.fn<(url: string, opciones: RequestInit) => Promise<Response>>()
    fetchFalso.mockResolvedValue(respuestaPreferencia())
    vi.stubGlobal('fetch', fetchFalso)

    const resultado = await new ProcesadorMercadoPago().crearPreferencia(
      datosPreferencia(
        'https://flay.app/consorcios/c/expensas/d',
        'https://flay.app/api/pagos/webhook?consorcio=c',
      ),
    )

    expect(resultado.urlPago).toContain('mercadopago.com.ar/checkout')
    expect(resultado.urlPago).not.toContain('sandbox')
  })

  it('no envia back_urls, auto_return ni notification_url si la URL publica no es HTTPS', async () => {
    const fetchFalso = vi.fn<(url: string, opciones: RequestInit) => Promise<Response>>()
    fetchFalso.mockResolvedValue(respuestaPreferencia())
    vi.stubGlobal('fetch', fetchFalso)

    await new ProcesadorMercadoPago().crearPreferencia(
      datosPreferencia(
        'http://localhost:3000/consorcios/c/expensas/d',
        'http://localhost:3000/api/pagos/webhook?consorcio=c',
      ),
    )

    const [, opciones] = fetchFalso.mock.calls[0]!
    const cuerpo = JSON.parse(String(opciones.body)) as Record<string, unknown>
    expect(cuerpo).not.toHaveProperty('back_urls')
    expect(cuerpo).not.toHaveProperty('auto_return')
    expect(cuerpo).not.toHaveProperty('notification_url')
  })
})

describe('ProcesadorMercadoPago.consultarPago', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('consulta con timeout para no colgar la vista de retorno', async () => {
    const fetchFalso = vi.fn<(url: string, opciones: RequestInit) => Promise<Response>>()
    fetchFalso.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'approved',
          transaction_amount: 100,
          external_reference: 'intento-1',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchFalso)

    await new ProcesadorMercadoPago().consultarPago({ credenciales, pagoExternoId: '123' })

    const [, opciones] = fetchFalso.mock.calls[0]!
    expect(opciones.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('ProcesadorMercadoPago.buscarPagosPorReferencia', () => {
  afterEach(() => vi.unstubAllGlobals())

  function respuestaBusqueda(results: unknown[], status = 200) {
    return new Response(JSON.stringify({ results }), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }

  it('consulta /v1/payments/search por external_reference, del mas reciente al mas viejo', async () => {
    const fetchFalso = vi.fn<(url: string, opciones: RequestInit) => Promise<Response>>()
    fetchFalso.mockResolvedValue(respuestaBusqueda([]))
    vi.stubGlobal('fetch', fetchFalso)

    await new ProcesadorMercadoPago().buscarPagosPorReferencia({
      credenciales,
      referenciaExterna: 'intento-1',
    })

    const [url, opciones] = fetchFalso.mock.calls[0]
    expect(url).toContain('/v1/payments/search')
    expect(url).toContain('external_reference=intento-1')
    expect(url).toContain('sort=date_created')
    expect(url).toContain('criteria=desc')
    expect((opciones.headers as Record<string, string>).Authorization).toBe('Bearer TEST-1234')
  })

  it('traduce cada resultado a PagoEncontrado', async () => {
    const fetchFalso = vi.fn<(url: string, opciones: RequestInit) => Promise<Response>>()
    fetchFalso.mockResolvedValue(
      respuestaBusqueda([
        { id: 111, status: 'approved' },
        { id: 222, status: 'in_process' },
        { id: 333, status: 'rejected' },
      ]),
    )
    vi.stubGlobal('fetch', fetchFalso)

    const pagos = await new ProcesadorMercadoPago().buscarPagosPorReferencia({
      credenciales,
      referenciaExterna: 'intento-1',
    })

    expect(pagos).toEqual([
      { pagoExternoId: '111', estado: 'aprobado' },
      { pagoExternoId: '222', estado: 'pendiente' },
      { pagoExternoId: '333', estado: 'rechazado' },
    ])
  })

  it('sin resultados devuelve una lista vacia', async () => {
    const fetchFalso = vi.fn<(url: string, opciones: RequestInit) => Promise<Response>>()
    fetchFalso.mockResolvedValue(respuestaBusqueda([]))
    vi.stubGlobal('fetch', fetchFalso)

    await expect(
      new ProcesadorMercadoPago().buscarPagosPorReferencia({
        credenciales,
        referenciaExterna: 'intento-1',
      }),
    ).resolves.toEqual([])
  })

  it('un error HTTP lanza ErrorProcesadorPago', async () => {
    const fetchFalso = vi.fn<(url: string, opciones: RequestInit) => Promise<Response>>()
    fetchFalso.mockResolvedValue(new Response('boom', { status: 500 }))
    vi.stubGlobal('fetch', fetchFalso)

    await expect(
      new ProcesadorMercadoPago().buscarPagosPorReferencia({
        credenciales,
        referenciaExterna: 'intento-1',
      }),
    ).rejects.toBeInstanceOf(ErrorProcesadorPago)
  })
})
