/**
 * Contrato de abstraccion para pasarelas de pago (`RF-28`, punto 14.1).
 *
 * Sigue la regla de dependencia de § 12: el dominio define la interfaz y la
 * infraestructura la implementa. El dominio no conoce la API de Mercado Pago.
 */

export interface CredencialesProcesador {
  accessToken: string
  secretoWebhook?: string
}

export interface DatosPreferencia {
  credenciales: CredencialesProcesador
  intentoId: string
  titulo: string
  /** Importe exacto como cadena, nunca number (invariante 2). */
  importe: string
  urlRetorno: string
  urlNotificacion: string
  venceEn: Date
}

export interface ResultadoPreferencia {
  preferenciaId: string
  urlPago: string
}

export type EstadoPagoExterno = 'aprobado' | 'rechazado' | 'pendiente' | 'cancelado'

export interface ResultadoConsultaPago {
  estado: EstadoPagoExterno
  importe: string
  referenciaExterna: string | null
  fechaAprobacion: Date | null
}

export interface ProcesadorDePagos {
  crearPreferencia(datos: DatosPreferencia): Promise<ResultadoPreferencia>

  consultarPago(datos: {
    credenciales: CredencialesProcesador
    pagoExternoId: string
  }): Promise<ResultadoConsultaPago>
}
