import { Decimal, importe } from '@/compartido/dinero'

/**
 * Imputacion de un pago por antiguedad (regla RN-08 § 7.2, `FR-022`).
 *
 * Recorre de la deuda mas vieja a la mas nueva y consume el importe hasta
 * agotarlo. Lo que sobra **no se pierde ni se inventa**: sale como `sobrante` y
 * la capa de aplicacion decide que hacer con el (`FR-026`).
 *
 * La promesa que la prueba fija: `suma(imputaciones) + sobrante = importe`, con
 * tolerancia cero.
 */

const DECIMALES_IMPORTE = 2

export interface DetalleImpago {
  detalleId: string
  saldo: string
  vencimiento: Date
}

export interface Imputacion {
  detalleId: string
  importeImputado: string
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

    const aplicado = Decimal.min(restante, saldo)

    imputaciones.push({
      detalleId: impago.detalleId,
      importeImputado: aplicado.toFixed(DECIMALES_IMPORTE),
    })

    restante = restante.minus(aplicado)
  }

  return { imputaciones, sobrante: restante.toFixed(DECIMALES_IMPORTE) }
}
