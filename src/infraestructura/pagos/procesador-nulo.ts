import { ErrorDeAplicacion } from '@/compartido/errores'
import type {
  ProcesadorDePagos,
  ResultadoConsultaPago,
  ResultadoPreferencia,
} from '@/dominio/contratos/procesador-pagos'

/**
 * Procesador nulo para cuando el cobro en linea no esta configurado
 * o se encuentra desactivado (`RF-28`, invariante 5).
 */

export class ProcesadorDePagosDeshabilitado extends ErrorDeAplicacion {
  constructor() {
    super('El cobro en linea no esta disponible.', 'RF-28')
  }
}

export class ProcesadorNulo implements ProcesadorDePagos {
  async crearPreferencia(): Promise<ResultadoPreferencia> {
    throw new ProcesadorDePagosDeshabilitado()
  }

  async consultarPago(): Promise<ResultadoConsultaPago> {
    throw new ProcesadorDePagosDeshabilitado()
  }
}

export const procesadorNulo = new ProcesadorNulo()
