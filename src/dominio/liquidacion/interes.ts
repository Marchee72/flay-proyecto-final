import { Decimal, importe, type Importe } from '@/compartido/dinero'

/**
 * Cargos por arrastre de una deuda vencida en firme (`FR-024`, `FR-025`, RF-08).
 *
 * La regla la fijo el usuario el 2026-11-10 y reemplaza la de meses completos
 * del 2026-09-10 (que, recalculada en cada emision, cobraba el mismo mes dos
 * veces): pasado el vencimiento en firme la expensa **no se paga** hasta la
 * liquidacion siguiente, y esa liquidacion le carga a cada deuda arrastrada
 *
 * - el **recargo mas alto** de su escalonado, **una sola vez** (la primera
 *   liquidacion que la arrastra), y
 * - la **tasa de mora** del consorcio, **una vez por cada liquidacion** que la
 *   arrastra.
 *
 * Ambos sobre el capital impago, sin capitalizar: lo ya liquidado como cargo no
 * vuelve a devengar. Cada linea es `capital × tasa`, reconstruible con una
 * calculadora, y se calcula por liquidacion de origen (regla RN-08 § 7.2).
 */

const DECIMALES_IMPORTE = 2
const DECIMALES_TASA = 4
const CIEN = new Decimal(100)

export type TipoCargo = 'recargo' | 'mora'

export interface DeudaArrastrada {
  liquidacionId: string
  /** Capital impago de esa liquidacion, sin los cargos ya liquidados. */
  capital: string
  /** El vencimiento en firme (el ultimo tramo). */
  vencimiento: Date
  /** El recargo mas alto de su escalonado congelado. */
  recargoMaximo: string
  /** Si una liquidacion vigente anterior ya le cobro el recargo. */
  recargoYaLiquidado: boolean
}

export interface LineaDeInteres {
  liquidacionId: string
  tipo: TipoCargo
  capital: string
  tasaMensual: string
  /** Siempre 1: un cargo por liquidacion. Se conserva para reconstruir la cuenta. */
  meses: number
  importe: string
}

export interface InteresCalculado {
  total: string
  /** Una linea por cargo y liquidacion de origen. Es lo que se persiste. */
  desglose: LineaDeInteres[]
}

/** Dia calendario en UTC: el dia del vencimiento todavia se puede pagar. */
const diaUTC = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

export function cargosPorArrastre(
  deudas: readonly DeudaArrastrada[],
  tasaMora: Importe,
  alDia: Date,
): InteresCalculado {
  const desglose: LineaDeInteres[] = []

  const linea = (deuda: DeudaArrastrada, tipo: TipoCargo, tasa: Importe) => {
    const monto = importe(deuda.capital).times(tasa).div(CIEN).toDecimalPlaces(DECIMALES_IMPORTE)
    // Una linea de cero no es un cargo: no se guarda ni se muestra.
    if (monto.isZero()) return
    desglose.push({
      liquidacionId: deuda.liquidacionId,
      tipo,
      capital: importe(deuda.capital).toFixed(DECIMALES_IMPORTE),
      tasaMensual: tasa.toFixed(DECIMALES_TASA),
      meses: 1,
      importe: monto.toFixed(DECIMALES_IMPORTE),
    })
  }

  for (const deuda of deudas) {
    if (diaUTC(deuda.vencimiento) >= diaUTC(alDia)) continue
    if (!deuda.recargoYaLiquidado) linea(deuda, 'recargo', importe(deuda.recargoMaximo))
    linea(deuda, 'mora', tasaMora)
  }

  // El total es la suma de las lineas **ya redondeadas**: si se sumara antes de
  // redondear, el documento mostraria lineas que no dan el total.
  const total = desglose.reduce((suma, l) => suma.plus(importe(l.importe)), new Decimal(0))

  return { total: total.toFixed(DECIMALES_IMPORTE), desglose }
}
