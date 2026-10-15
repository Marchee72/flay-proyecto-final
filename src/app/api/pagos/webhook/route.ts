import { NextResponse } from 'next/server'

import { PROCESADOR_PAGOS } from '@/aplicacion/dependencias'
import {
  FirmaWebhookInvalida,
  PasarelaNoConfiguradaWebhook,
  procesarWebhookPago,
} from '@/aplicacion/pagos/confirmar-pago-en-linea'
import { NoEncontrado } from '@/compartido/errores'

/**
 * Webhook de notificaciones de Mercado Pago (`RF-28`, D-4).
 *
 * Ruta: POST /api/pagos/webhook?consorcio=<consorcioId>
 *
 * 1. Resuelve el consorcio y las credenciales cifradas de su administradora.
 * 2. Valida la firma HMAC-SHA256 (x-signature, x-request-id) para evitar suplantaciones.
 * 3. Ejecuta confirmarPagoEnLinea() de forma idempotente y aislada.
 */
export async function POST(pedido: Request): Promise<NextResponse> {
  const { searchParams } = new URL(pedido.url)
  const consorcioId = searchParams.get('consorcio')

  if (!consorcioId) {
    return NextResponse.json({ error: 'El parametro consorcio es obligatorio.' }, { status: 400 })
  }

  let body: Record<string, unknown> | null = null
  try {
    body = (await pedido.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: 'Cuerpo de la solicitud no es un JSON valido.' },
      { status: 400 },
    )
  }

  try {
    const resultado = await procesarWebhookPago(PROCESADOR_PAGOS, {
      consorcioId,
      xSignature: pedido.headers.get('x-signature'),
      xRequestId: pedido.headers.get('x-request-id'),
      body,
    })

    return NextResponse.json(resultado, { status: 200 })
  } catch (error) {
    if (error instanceof NoEncontrado) {
      return NextResponse.json({ error: 'Consorcio no encontrado.' }, { status: 404 })
    }
    if (error instanceof FirmaWebhookInvalida) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    if (error instanceof PasarelaNoConfiguradaWebhook) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Error al procesar el pago notificado.' }, { status: 500 })
  }
}
