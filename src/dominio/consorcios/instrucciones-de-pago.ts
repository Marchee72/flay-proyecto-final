import { ErrorDeAplicacion } from '@/compartido/errores'

/** Como pagar por fuera de la pasarela (RF-09): texto libre del administrador. */
export const MAXIMO_INSTRUCCIONES = 1000

const MENSAJE = `Las instrucciones de pago pueden tener hasta ${MAXIMO_INSTRUCCIONES} caracteres.`

export class InstruccionesDemasiadoLargas extends ErrorDeAplicacion {
  constructor() {
    super(MENSAJE, 'RF-09')
  }
}

/** Mensaje del campo al tipear, o `null` si esta bien (nota 28). */
export function errorDeInstrucciones(valor: string): string | null {
  return valor.trim().length > MAXIMO_INSTRUCCIONES ? MENSAJE : null
}
