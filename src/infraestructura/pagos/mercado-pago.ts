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

export class ErrorProcesadorPago extends ErrorDeAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 'RF-28')
  }
}

export class ProcesadorMercadoPago implements ProcesadorDePagos {
  async crearPreferencia(datos: DatosPreferencia): Promise<ResultadoPreferencia> {
    const respuesta = await fetch(`${URL_BASE}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${datos.credenciales.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
        notification_url: datos.urlNotificacion,
        back_urls: {
          success: datos.urlRetorno,
          pending: datos.urlRetorno,
          failure: datos.urlRetorno,
        },
        auto_return: 'approved',
        expiration_date_to: datos.venceEn.toISOString(),
      }),
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
      sandbox_init_point?: string
    }

    return {
      preferenciaId: json.id,
      // En entorno de pruebas / sandbox se prioriza sandbox_init_point
      urlPago: json.sandbox_init_point || json.init_point,
    }
  }

  async consultarPago(datos: {
    credenciales: { accessToken: string }
    pagoExternoId: string
  }): Promise<ResultadoConsultaPago> {
    const respuesta = await fetch(`${URL_BASE}/v1/payments/${datos.pagoExternoId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${datos.credenciales.accessToken}`,
      },
    })

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
