import { ErrorDeAplicacion } from '@/compartido/errores'

/**
 * Contrato minimo del estado de un periodo (FR-017, M-04).
 *
 * Se declara **entero** aunque esta etapa solo produzca `abierto`: es lo que
 * `003-liquidacion` comparte, y declararlo ahora evita que la etapa siguiente
 * invente su propia maquina de estados y que la prueba de la regla RN-03 tenga
 * que fabricar un estado que el sistema no reconoce.
 *
 * Cerrar, liquidar y anular son alcance de `003` (FR-024). Lo que esta etapa si
 * necesita es saber **cuando un periodo admite gastos**, que es una sola cosa.
 */

export const ESTADOS_PERIODO = ['abierto', 'cerrado', 'liquidado', 'anulado'] as const

export type EstadoPeriodo = (typeof ESTADOS_PERIODO)[number]

/**
 * Transiciones validas. Un periodo liquidado **no vuelve atras**: lo que se
 * corrige despues de liquidar se corrige con un ajuste en el periodo siguiente,
 * no reescribiendo el que ya se le mando a los consorcistas.
 */
export const TRANSICIONES: Readonly<Record<EstadoPeriodo, readonly EstadoPeriodo[]>> = {
  abierto: ['cerrado', 'anulado'],
  // Reabrir un periodo cerrado es normal: se cierra para liquidar y aparece una
  // factura del mes. Una vez liquidado, ya no.
  cerrado: ['abierto', 'liquidado', 'anulado'],
  liquidado: [],
  anulado: [],
}

export const transicionValida = (desde: EstadoPeriodo, hacia: EstadoPeriodo): boolean =>
  TRANSICIONES[desde].includes(hacia)

/** Solo un periodo abierto admite altas y modificaciones de gasto (regla RN-03). */
export const admiteGastos = (estado: EstadoPeriodo): boolean => estado === 'abierto'

export class PeriodoNoAdmiteGastos extends ErrorDeAplicacion {
  constructor(estado: EstadoPeriodo) {
    super(
      `El período está ${estado} y no admite cambios en los gastos. ` +
        'Lo que haya que corregir va como ajuste en el período siguiente.',
      'RN-03',
      { estado },
    )
  }
}

export function exigirPeriodoConGastos(estado: EstadoPeriodo): void {
  if (!admiteGastos(estado)) throw new PeriodoNoAdmiteGastos(estado)
}
