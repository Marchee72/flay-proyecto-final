import { Decimal, importe } from '@/compartido/dinero'

/**
 * Imputacion de un pago por antiguedad (regla RN-08 § 7.2, `FR-022`, RF-08).
 *
 * Recorre de la deuda mas vieja a la mas nueva y consume el importe hasta
 * agotarlo. Cada deuda puede llevar el recargo del tramo de vencimiento vigente
 * (RF-08): al saldarla se cobra base + recargo, y el recargo se registra como un
 * cargo propio (como el interes), no como saldo a favor. Las deudas ya vencidas
 * en firme no llevan recargo (su recargo es 0: lo reemplazo la mora).
 *
 * Lo que sobra tras cubrir todo **no se pierde ni se inventa**: sale como
 * `sobrante` y la capa de aplicacion decide que hacer con el (`FR-026`).
 *
 * La promesa que la prueba fija, con tolerancia cero:
 *   suma(importeImputado) + suma(recargoCobrado) + sobrante = importePagado
 */

const DECIMALES_IMPORTE = 2
const CIEN = new Decimal(100)

export interface DetalleImpago {
  detalleId: string
  saldo: string
  vencimiento: Date
  /** Recargo del tramo vigente hoy (RF-08). Omitido o `'0'` si no aplica. */
  recargoPorcentaje?: string
}

export interface Imputacion {
  detalleId: string
  /** Capital imputado a la deuda. */
  importeImputado: string
  /** Recargo cobrado junto con ese capital (RF-08). `'0.00'` si no hubo. */
  recargoCobrado: string
}

export interface ResultadoDeImputacion {
  imputaciones: Imputacion[]
  sobrante: string
}

export function imputar(
  importePagado: string,
  impagos: readonly DetalleImpago[],
): ResultadoDeImputacion {
  let restante = importe(importePagado)
  const imputaciones: Imputacion[] = []

  const porAntiguedad = [...impagos].sort(
    (a, b) => a.vencimiento.getTime() - b.vencimiento.getTime(),
  )

  for (const impago of porAntiguedad) {
    if (restante.lessThanOrEqualTo(0)) break

    const saldo = importe(impago.saldo)
    if (saldo.lessThanOrEqualTo(0)) continue

    const tasa = importe(impago.recargoPorcentaje ?? '0')

    // Lo que cuesta saldar entero este detalle: saldo + su recargo redondeado.
    const recargoDelSaldo = saldo.times(tasa).div(CIEN).toDecimalPlaces(DECIMALES_IMPORTE)
    const costoEntero = saldo.plus(recargoDelSaldo)

    let capital: Decimal
    let recargo: Decimal

    if (restante.greaterThanOrEqualTo(costoEntero)) {
      // Alcanza para saldarlo: capital = saldo, recargo = el del saldo.
      capital = saldo
      recargo = recargoDelSaldo
    } else {
      // Pago parcial: el capital sale de dividir lo que queda por (1 + r/100),
      // hacia abajo; el recargo absorbe el resto, de modo que
      // capital + recargo = restante exacto (ni se pierde ni se inventa un centavo).
      const factor = new Decimal(1).plus(tasa.div(CIEN))
      capital = restante.div(factor).toDecimalPlaces(DECIMALES_IMPORTE, Decimal.ROUND_DOWN)
      recargo = restante.minus(capital)
    }

    imputaciones.push({
      detalleId: impago.detalleId,
      importeImputado: capital.toFixed(DECIMALES_IMPORTE),
      recargoCobrado: recargo.toFixed(DECIMALES_IMPORTE),
    })

    restante = restante.minus(capital).minus(recargo)
  }

  return { imputaciones, sobrante: restante.toFixed(DECIMALES_IMPORTE) }
}
