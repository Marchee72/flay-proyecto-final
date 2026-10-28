import { ErrorDeAplicacion } from '@/compartido/errores'
import type {
  DatosPreferencia,
  EstadoPagoExterno,
  ProcesadorDePagos,
  ResultadoConsultaPago,
  ResultadoPreferencia,
} from '@/dominio/contratos/procesador-pagos'

/**
 * Adaptador de infraestructura para la API HTTP de Mercado Pago (`RF-28`, punto 14.1).
 *
 * Sin dependencias externas: `fetch` directo a api.mercadopago.com.
 * Opera en sandbox en esta etapa.
 */

const URL_BASE = 'https://api.mercadopago.com'

/**
 * Mercado Pago rechaza con 400 (`invalid_back_urls`) las `back_urls` y la
 * `notification_url` en HTTP, y no retorna a dominios locales. Sin una URL
 * publica no se envian: la preferencia se crea igual, pero sin retorno ni webhook.
 */
function esUrlPublica(url: string): boolean {
  return (
    /^https:\/\//i.test(url) && !/^https:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url)
  )
}

export class ErrorProcesadorPago extends ErrorDeAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 'RF-28')
  }
}

export class ProcesadorMercadoPago implements ProcesadorDePagos {
  async crearPreferencia(datos: DatosPreferencia): Promise<ResultadoPreferencia> {
    const payload: Record<string, unknown> = {
      items: [
        {
          id: datos.intentoId,
          title: datos.titulo,
          quantity: 1,
          unit_price: Number(datos.importe),
          currency_id: 'ARS',
        },
      ],
      external_reference: datos.intentoId,
      payment_methods: {
        excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
      },
      expiration_date_to: datos.venceEn.toISOString(),
    }

    // Mercado Pago exige HTTPS publico para back_urls, auto_return y notification_url.
    if (esUrlPublica(datos.urlRetorno)) {
      payload.back_urls = {
        success: datos.urlRetorno,
        pending: datos.urlRetorno,
        failure: datos.urlRetorno,
      }
      payload.auto_return = 'approved'
    }

    if (esUrlPublica(datos.urlNotificacion)) {
      payload.notification_url = datos.urlNotificacion
    }

    const respuesta = await fetch(`${URL_BASE}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${datos.credenciales.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      // Sin timeout, una pasarela colgada deja la pantalla esperando para siempre.
      signal: AbortSignal.timeout(8000),
    })

    if (!respuesta.ok) {
      const errorTexto = await respuesta.text().catch(() => '')
      throw new ErrorProcesadorPago(
        `No se pudo iniciar el cobro en Mercado Pago (${respuesta.status}): ${errorTexto}`,
      )
    }

    const json = (await respuesta.json()) as {
      id: string
      init_point: string
    }

    return {
      preferenciaId: json.id,
      urlPago: json.init_point,
    }
  }

  async consultarPago(datos: {
    credenciales: { accessToken: string }
    pagoExternoId: string
  }): Promise<ResultadoConsultaPago> {
    const respuesta = await fetch(
      `${URL_BASE}/v1/payments/${encodeURIComponent(datos.pagoExternoId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${datos.credenciales.accessToken}`,
        },
        // La vista de retorno consulta esto durante el render: sin timeout se cuelga.
        signal: AbortSignal.timeout(8000),
      },
    )

    if (!respuesta.ok) {
      const errorTexto = await respuesta.text().catch(() => '')
      throw new ErrorProcesadorPago(
        `No se pudo verificar el pago en Mercado Pago (${respuesta.status}): ${errorTexto}`,
      )
    }

    const json = (await respuesta.json()) as {
      status: string
      transaction_amount: number
      external_reference?: string | null
      date_approved?: string | null
    }

    let estado: EstadoPagoExterno
    switch (json.status) {
      case 'approved':
        estado = 'aprobado'
        break
      case 'rejected':
        estado = 'rechazado'
        break
      case 'cancelled':
        estado = 'cancelado'
        break
      default:
        estado = 'pendiente'
        break
    }

    return {
      estado,
      importe: Number(json.transaction_amount).toFixed(2),
      referenciaExterna: json.external_reference ?? null,
      fechaAprobacion: json.date_approved ? new Date(json.date_approved) : null,
    }
  }
}

export const procesadorMercadoPago = new ProcesadorMercadoPago()
