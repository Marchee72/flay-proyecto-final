import type {
  DatosPreferencia,
  ProcesadorDePagos,
  ResultadoConsultaPago,
  ResultadoPreferencia,
} from '@/dominio/contratos/procesador-pagos'

/**
 * Procesador deterministico de pagos para pruebas unitarias, de integracion y E2E (`RF-28`).
 *
 * Simula el comportamiento de Mercado Pago en memoria con respuestas programables.
 */

export class ProcesadorDePrueba implements ProcesadorDePagos {
  private pagosSimulados = new Map<string, ResultadoConsultaPago>()

  programarPago(pagoExternoId: string, resultado: ResultadoConsultaPago): void {
    this.pagosSimulados.set(pagoExternoId, resultado)
  }

  limpiar(): void {
    this.pagosSimulados.clear()
  }

  async crearPreferencia(datos: DatosPreferencia): Promise<ResultadoPreferencia> {
    const preferenciaId = `pref_${datos.intentoId}`
    const pagoExternoSimulado = `pago_simulado_${datos.intentoId}`

    // Por defecto programamos este pago como aprobado para el flujo feliz
    if (!this.pagosSimulados.has(pagoExternoSimulado)) {
      this.pagosSimulados.set(pagoExternoSimulado, {
        estado: 'aprobado',
        importe: datos.importe,
        referenciaExterna: datos.intentoId,
        fechaAprobacion: new Date(),
      })
    }

    const separador = datos.urlRetorno.includes('?') ? '&' : '?'
    const urlPago = `${datos.urlRetorno}${separador}collection_id=${pagoExternoSimulado}&collection_status=approved&payment_id=${pagoExternoSimulado}&status=approved&external_reference=${datos.intentoId}&preference_id=${preferenciaId}`

    return {
      preferenciaId,
      urlPago,
    }
  }

  async consultarPago(datos: {
    credenciales: { accessToken: string }
    pagoExternoId: string
  }): Promise<ResultadoConsultaPago> {
    const simulado = this.pagosSimulados.get(datos.pagoExternoId)
    if (simulado) {
      return simulado
    }

    // Comportamiento por defecto si no fue programado
    return {
      estado: 'aprobado',
      importe: '1000.00',
      referenciaExterna: null,
      fechaAprobacion: new Date(),
    }
  }
}

export const procesadorDePrueba = new ProcesadorDePrueba()
