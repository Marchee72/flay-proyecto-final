'use server'

import { headers } from 'next/headers'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { HABILITACIONES, PROCESADOR_PAGOS, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { irAIngresar } from '@/app/ir-a-ingresar'
import { iniciarPagoEnLinea } from '@/aplicacion/pagos/iniciar-pago-en-linea'

export type ResultadoInicioPago = { mensaje: string; urlPago?: string; intentoId?: string }

/**
 * Server Action para iniciar el pago en linea de una expensa (`RF-28`, D-1, D-3).
 * Devuelve la URL de redireccion para abrir el checkout pro de Mercado Pago.
 */
export async function accionPagarExpensaEnLinea(
  _previo: ResultadoInicioPago,
  datos: FormData,
): Promise<ResultadoInicioPago> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()

  const consorcioId = String(datos.get('consorcio') ?? '')
  const detalleId = String(datos.get('detalle') ?? '')

  // Sin URL_PUBLICA, el origen del propio pedido: volver a `localhost:3000` desde
  // otro puerto o un despliegue de prueba dejaba al consorcista en ninguna parte.
  const cabeceras = await headers()
  const urlPublica =
    process.env.URL_PUBLICA ||
    `${cabeceras.get('x-forwarded-proto') ?? 'http'}://${cabeceras.get('host')}`
  const urlBaseRetorno = `${urlPublica}/consorcios/${consorcioId}/expensas/${detalleId}`

  try {
    const inicio = await iniciarPagoEnLinea(HABILITACIONES, RELOJ, PROCESADOR_PAGOS, {
      usuarioId,
      consorcioId,
      detalleLiquidacionId: detalleId,
      urlBaseRetorno,
    })
    return { mensaje: '', urlPago: inicio.urlPago, intentoId: inicio.intentoId }
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) {
      return { mensaje: error.mensajeParaUsuario }
    }
    throw error
  }
}
