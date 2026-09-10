import { Decimal, importe, type Importe } from '@/compartido/dinero'

/**
 * Interes por mora (`FR-024`, `FR-025`).
 *
 * **Simple, por mes vencido completo**: `capital × tasa × meses`, sin prorrateo
 * de dias y sin capitalizar. Y calculado **por cada liquidacion impaga desde su
 * propio vencimiento**, no sobre el saldo total desde el mas antiguo: es lo que
 * se puede explicar peso por peso y lo que le da sentido a imputar por
 * antiguedad (regla RN-08 § 7.2).
 *
 * La consecuencia deliberada es que veintinueve dias de atraso no cuestan nada
 * y treinta y uno cuestan un mes entero. Fue una decision del equipo del
 * 2026-09-10, tomada sabiendo eso.
 */

const DECIMALES_IMPORTE = 2
const DECIMALES_TASA = 4
const CIEN = new Decimal(100)

export interface DeudaVencida {
  liquidacionId: string
  capital: string
  vencimiento: Date
}

export interface LineaDeInteres {
  liquidacionId: string
  capital: string
  tasaMensual: string
  meses: number
  importe: string
}

export interface InteresCalculado {
  total: string
  /** Una linea por liquidacion que devengo interes. Es lo que se persiste. */
  desglose: LineaDeInteres[]
}

/**
 * Meses de calendario completos entre dos fechas, sin biblioteca de fechas.
 *
 * De un vencimiento el 31 de enero, el 28 de febrero **no** completa el mes: no
 * existe el 31 de febrero, y adelantar el vencimiento seria cobrarle al deudor
 * un mes que no transcurrio.
 */
export function mesesCompletos(vencimiento: Date, alDia: Date): number {
  const meses =
    (alDia.getUTCFullYear() - vencimiento.getUTCFullYear()) * 12 +
    (alDia.getUTCMonth() - vencimiento.getUTCMonth())

  const completo = alDia.getUTCDate() >= vencimiento.getUTCDate() ? meses : meses - 1

  return Math.max(0, completo)
}

export function interesPorMora(
  deudas: readonly DeudaVencida[],
  tasaMensual: Importe,
  alDia: Date,
): InteresCalculado {
  const desglose: LineaDeInteres[] = []

  for (const deuda of deudas) {
    const meses = mesesCompletos(deuda.vencimiento, alDia)
    if (meses === 0) continue

    const monto = importe(deuda.capital)
      .times(tasaMensual)
      .div(CIEN)
      .times(meses)
      .toDecimalPlaces(DECIMALES_IMPORTE)

    // Una linea de cero no es un interes: no se guarda ni se muestra.
    if (monto.isZero()) continue

    desglose.push({
      liquidacionId: deuda.liquidacionId,
      capital: importe(deuda.capital).toFixed(DECIMALES_IMPORTE),
      tasaMensual: tasaMensual.toFixed(DECIMALES_TASA),
      meses,
      importe: monto.toFixed(DECIMALES_IMPORTE),
    })
  }

  // El total es la suma de las lineas **ya redondeadas**: si se sumara antes de
  // redondear, el documento mostraria lineas que no dan el total.
  const total = desglose.reduce((suma, linea) => suma.plus(importe(linea.importe)), new Decimal(0))

  return { total: total.toFixed(DECIMALES_IMPORTE), desglose }
}
