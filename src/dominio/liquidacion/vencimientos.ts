import { Decimal, importe } from '@/compartido/dinero'
import { ErrorDeAplicacion } from '@/compartido/errores'

/**
 * Vencimientos escalonados con recargo (RF-08).
 *
 * Dentro del mes, pagar mas tarde cuesta un recargo mayor: hasta tres tramos,
 * cada uno con su dia y su porcentaje (el primero es el base, recargo 0). Pasado
 * el ultimo, la expensa vence en firme, arrastra el **base** y la mora-interes
 * (RN-08) toma el relevo; por eso la mora debe ser mayor que el ultimo recargo
 * (si no, dejar vencer saldria mas barato que pagar el ultimo tramo).
 *
 * Todo porcentaje e importe es decimal; el redondeo va solo al final del importe
 * unitario (Principio II). El dominio no conoce la base (Principio III): recibe
 * los tramos ya congelados y la fecha.
 */

const DECIMALES_IMPORTE = 2
const DECIMALES_TASA = 4
const CIEN = new Decimal(100)
const DIA_MAXIMO = 28

/** Un tramo tal como quedo congelado en la liquidacion (fecha concreta). */
export interface TramoCongelado {
  orden: number
  fecha: Date
  recargoPorcentaje: string
}

export interface RecargoVigente {
  /** Porcentaje aplicable hoy, `'0.0000'` si es el base o si vencio en firme. */
  recargoPorcentaje: string
  /** Orden del tramo vigente, o `null` si vencio en firme. */
  tramo: number | null
  venceEnFirme: boolean
  proximoVencimiento: Date | null
}

/** Un tramo de la regla configurable del consorcio (dia del mes, sin fecha concreta). */
export interface TramoRegla {
  orden: number
  diaDelMes: number
  recargoPorcentaje: string
}

/** Dia calendario en UTC, para comparar fechas con el vencimiento inclusive. */
const diaUTC = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

/**
 * El recargo aplicable a una fecha: se paga en el tramo del vencimiento mas
 * cercano que todavia no paso (el dia del vencimiento es inclusive). Pasado el
 * ultimo, vence en firme y no hay recargo.
 */
export function recargoVigente(tramos: readonly TramoCongelado[], hoy: Date): RecargoVigente {
  const ordenados = [...tramos].sort((a, b) => diaUTC(a.fecha) - diaUTC(b.fecha))
  const dHoy = diaUTC(hoy)
  const vigente = ordenados.find((tramo) => diaUTC(tramo.fecha) >= dHoy)

  if (!vigente) {
    return {
      recargoPorcentaje: '0.0000',
      tramo: null,
      venceEnFirme: true,
      proximoVencimiento: null,
    }
  }

  return {
    recargoPorcentaje: importe(vigente.recargoPorcentaje).toFixed(DECIMALES_TASA),
    tramo: vigente.orden,
    venceEnFirme: false,
    proximoVencimiento: vigente.fecha,
  }
}

/** El recargo en pesos sobre una base: `redondeo(base x recargo/100)`, a dos decimales. */
export function recargoSobre(base: string, recargoPorcentaje: string): string {
  return importe(base).times(importe(recargoPorcentaje)).div(CIEN).toFixed(DECIMALES_IMPORTE)
}

/**
 * Monto a pagar hoy = base + recargo. Se define como suma (no `base x (1+r)`)
 * para que coincida al centavo con el recargo que la imputacion cobra y registra.
 */
export function montoExigible(base: string, recargoPorcentaje: string): string {
  return importe(base)
    .plus(importe(recargoSobre(base, recargoPorcentaje)))
    .toFixed(DECIMALES_IMPORTE)
}

export class ReglaVencimientosInvalida extends ErrorDeAplicacion {
  constructor(mensaje: string, detalle?: Record<string, unknown>) {
    super(mensaje, 'RF-08', detalle)
  }
}

/**
 * Valida la regla completa antes de guardarla (RNF-10). Lanza con un mensaje
 * comprensible si algo no cierra.
 */
export function validarReglaVencimientos(
  tramos: readonly TramoRegla[],
  tasaMoraMensual: string,
): void {
  if (tramos.length < 1 || tramos.length > 3) {
    throw new ReglaVencimientosInvalida('La regla tiene entre 1 y 3 vencimientos.')
  }

  const ordenados = [...tramos].sort((a, b) => a.orden - b.orden)

  ordenados.forEach((tramo, i) => {
    if (tramo.orden !== i + 1) {
      throw new ReglaVencimientosInvalida('Los vencimientos deben numerarse 1, 2, 3 sin saltos.')
    }
  })

  if (!importe(ordenados[0]!.recargoPorcentaje).equals(0)) {
    throw new ReglaVencimientosInvalida(
      'El primer vencimiento es el importe base: su recargo tiene que ser 0 %.',
    )
  }

  let diaAnterior = 0
  for (const tramo of ordenados) {
    if (tramo.diaDelMes < 1 || tramo.diaDelMes > DIA_MAXIMO) {
      throw new ReglaVencimientosInvalida(`El día de cada vencimiento va del 1 al ${DIA_MAXIMO}.`)
    }
    if (tramo.diaDelMes <= diaAnterior) {
      throw new ReglaVencimientosInvalida('Los días de los vencimientos tienen que ser crecientes.')
    }
    if (importe(tramo.recargoPorcentaje).isNegative()) {
      throw new ReglaVencimientosInvalida('El recargo no puede ser negativo.')
    }
    diaAnterior = tramo.diaDelMes
  }

  const ultimo = ordenados[ordenados.length - 1]!
  if (!importe(tasaMoraMensual).greaterThan(importe(ultimo.recargoPorcentaje))) {
    throw new ReglaVencimientosInvalida(
      `La tasa de mora mensual (${importe(tasaMoraMensual).toFixed(DECIMALES_TASA)} %) debe ser ` +
        `mayor que el recargo del último vencimiento ` +
        `(${importe(ultimo.recargoPorcentaje).toFixed(DECIMALES_TASA)} %): de lo contrario conviene ` +
        'dejar vencer en firme antes que pagar el último recargo.',
    )
  }
}
