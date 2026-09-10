import { ErrorDeAplicacion } from '@/compartido/errores'
import { Decimal, type Importe } from '@/compartido/dinero'

/**
 * Suma de coeficientes (regla RN-01, FR-011).
 *
 * Esto **no** es lo que garantiza el invariante: eso lo hace el disparador de
 * restriccion diferido de la base (FR-011b), que ninguna ruta de codigo puede
 * esquivar. Lo que hace este modulo es dar el mensaje comprensible que la base
 * no puede dar: cuanto falta o sobra, y sobre que unidades (RNF-10).
 *
 * Ocho decimales y comparacion exacta: una tolerancia de un cienmillonesimo es
 * justo el error que la regla existe para atrapar.
 */

export const SUMA_EXIGIDA = new Decimal('100.00000000')

export const DECIMALES = 8

export interface UnidadConCoeficiente {
  designacion: string
  coeficiente: Importe
}

export interface SumaDeCoeficientes {
  /** Suma de los coeficientes tal como vinieron. */
  total: Importe
  /** Diferencia contra 100: negativa si falta, positiva si sobra. */
  diferencia: Importe
  cuadra: boolean
  /** Las designaciones involucradas, para que el mensaje pueda nombrarlas. */
  unidades: string[]
}

export function sumarCoeficientes(unidades: readonly UnidadConCoeficiente[]): SumaDeCoeficientes {
  const total = unidades.reduce(
    (acumulado, unidad) => acumulado.plus(unidad.coeficiente),
    new Decimal(0),
  )

  return {
    total,
    diferencia: total.minus(SUMA_EXIGIDA),
    // Un consorcio sin unidades no viola la regla: no se lo evalua (FR-011c).
    cuadra: unidades.length === 0 || total.equals(SUMA_EXIGIDA),
    unidades: unidades.map((unidad) => unidad.designacion),
  }
}

export class SumaDeCoeficientesInvalida extends ErrorDeAplicacion {
  constructor(suma: SumaDeCoeficientes) {
    const falta = suma.diferencia.isNegative()
    const cuanto = suma.diferencia.abs().toFixed(DECIMALES)

    super(
      `Los coeficientes suman ${suma.total.toFixed(DECIMALES)} %: ` +
        `${falta ? 'falta' : 'sobra'} ${cuanto} % para llegar a 100. ` +
        `Revisá las ${suma.unidades.length} unidades cargadas.`,
      'RN-01',
      {
        total: suma.total.toFixed(DECIMALES),
        diferencia: suma.diferencia.toFixed(DECIMALES),
        unidades: suma.unidades,
      },
    )
  }
}

/** Lanza si la suma no da exacto. La usa el caso de uso antes de escribir. */
export function exigirSumaExacta(unidades: readonly UnidadConCoeficiente[]): void {
  const suma = sumarCoeficientes(unidades)
  if (!suma.cuadra) throw new SumaDeCoeficientesInvalida(suma)
}
