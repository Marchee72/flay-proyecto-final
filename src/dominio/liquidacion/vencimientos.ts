import { Decimal, importe, type Importe } from '@/compartido/dinero'
import { ErrorDeAplicacion } from '@/compartido/errores'

/**
 * Vencimientos escalonados con recargo (RF-08).
 *
 * Dentro del mes, pagar mas tarde cuesta un recargo mayor: hasta tres tramos,
 * cada uno con su dia y su porcentaje (el primero es el base, recargo 0). Pasado
 * el ultimo, la expensa vence en firme, arrastra el **base** y la mora-interes
 * (RN-08) toma el relevo; por eso la mora debe ser mayor que el recargo **mas
 * alto** (si no, dejar vencer saldria mas barato que pagar ese tramo). Comparar
 * contra el maximo y no contra el ultimo cubre una escalera cargada fuera de
 * orden (20 % y despues 5 %).
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

/**
 * La regla tiene dos lecturas de la misma escalera y conviene no confundirlas:
 *
 * - **Boleta / almacenamiento** (`TramoRegla`): el recargo vive en el vencimiento
 *   HASTA el que se paga, y el primero es el base (0 %). Es lo que muestra la
 *   expensa ("pagando hasta el dia 20: base + 5 %") y lo que valida el dominio.
 * - **Administrador** (`EscalonVencimiento`): el recargo se pone en el vencimiento
 *   DESPUES del cual rige. El 1er vencimiento ya lleva su recargo; pasada la
 *   ultima fecha (la del firme) corre la mora, no un recargo.
 *
 * Las dos son equivalentes: convertir de una a otra es correr el recargo un
 * lugar. `tramosDesdeEscalonado` / `escalonadoDesdeTramos` son esa traduccion, y
 * el unico lugar donde vive el corrimiento.
 */
export interface EscalonVencimiento {
  diaDelMes: number
  /** Recargo que rige al pagar DESPUES de esta fecha (hasta el proximo escalon). */
  recargoPorcentaje: string
}

/**
 * Vista del administrador -> tramos de boleta. Los escalones son los
 * vencimientos con recargo (de fecha mas temprana a mas tardia) y `diaFirme` la
 * fecha en que vence en firme. El recargo del escalon i-esimo se cobra al pagar
 * hasta el (i+1)-esimo vencimiento, asi que el primer tramo queda en el base.
 */
export function tramosDesdeEscalonado(
  escalones: readonly EscalonVencimiento[],
  diaFirme: number,
): TramoRegla[] {
  const dias = [...escalones.map((e) => e.diaDelMes), diaFirme]
  const recargos = ['0', ...escalones.map((e) => e.recargoPorcentaje)]
  return dias.map((diaDelMes, i) => ({ orden: i + 1, diaDelMes, recargoPorcentaje: recargos[i]! }))
}

/** Tramos de boleta -> vista del administrador. Inversa de `tramosDesdeEscalonado`. */
export function escalonadoDesdeTramos(tramos: readonly TramoRegla[]): {
  escalones: EscalonVencimiento[]
  diaFirme: number
} {
  const ordenados = [...tramos].sort((a, b) => a.orden - b.orden)
  const diaFirme = ordenados[ordenados.length - 1]!.diaDelMes
  const escalones = ordenados.slice(0, -1).map((tramo, i) => ({
    diaDelMes: tramo.diaDelMes,
    recargoPorcentaje: ordenados[i + 1]!.recargoPorcentaje,
  }))
  return { escalones, diaFirme }
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

/**
 * El recargo que viaja con la deuda arrastrada a la liquidacion siguiente: el
 * mas alto del escalonado (decision 2026-11-10). Sin tramos, cero.
 */
export function recargoMaximo(tramos: readonly { recargoPorcentaje: string }[]): string {
  return tramos
    .reduce((maximo, t) => Decimal.max(maximo, importe(t.recargoPorcentaje)), new Decimal(0))
    .toFixed(DECIMALES_TASA)
}

/**
 * Lo que hay que pagar hoy por un conjunto de deudas: cada saldo mas el recargo
 * de su tramo vigente. Es el **unico** calculo del monto a pagar: lo usan la
 * pantalla, el cobro en linea y la imputacion (que cobra el mismo recargo).
 */
export function exigible(
  impagos: readonly { saldo: string; recargoPorcentaje?: string }[],
): string {
  return impagos
    .reduce(
      (total, i) => total.plus(importe(montoExigible(i.saldo, i.recargoPorcentaje ?? '0'))),
      new Decimal(0),
    )
    .toFixed(DECIMALES_IMPORTE)
}

/**
 * Pasado el vencimiento en firme de la ultima liquidacion de la unidad no se
 * acepta ningun pago hasta emitir la siguiente, que le carga el recargo y la
 * mora (decision 2026-11-10). El dia del vencimiento todavia se paga. Si la
 * ultima no vencio, lo anterior ya viaja dentro de ella con sus cargos.
 */
export function pagoBloqueadoHastaLiquidar(
  saldoTotal: string,
  vencimientoUltima: Date | null,
  hoy: Date,
): boolean {
  if (!vencimientoUltima || importe(saldoTotal).lessThanOrEqualTo(0)) return false
  return diaUTC(hoy) > diaUTC(vencimientoUltima)
}

export class ReglaVencimientosInvalida extends ErrorDeAplicacion {
  constructor(mensaje: string, detalle?: Record<string, unknown>) {
    super(mensaje, 'RF-08', detalle)
  }
}

const MENSAJE_DIA = `El día de cada vencimiento va del 1 al ${DIA_MAXIMO}.`

/**
 * Formato comun a todo porcentaje: numero finito y hasta 4 decimales. Devuelve
 * el mensaje listo para mostrar, o `null` si el valor cierra. El formulario
 * manda `noValidate`, asi que nada de esto lo cubre el navegador.
 */
function errorDeFormato(valor: string, etiqueta: string): string | null {
  let numero: Importe
  try {
    numero = importe(valor.trim())
  } catch {
    return `${etiqueta} tiene que ser un número.`
  }

  if (!numero.isFinite()) return `${etiqueta} tiene que ser un número.`
  if (numero.decimalPlaces() > DECIMALES_TASA) {
    return `${etiqueta} admite hasta ${DECIMALES_TASA} decimales.`
  }
  return null
}

/**
 * Validadores de campo de la regla: puros y con el mensaje ya redactado.
 *
 * La pantalla los llama al tipear y `validarReglaVencimientos` los usa al
 * guardar, asi la regla se escribe una sola vez y no hay dos definiciones que
 * se desincronicen. Salvo la tasa de mora, que es obligatoria, un valor vacio
 * significa "todavia no hay nada que decir".
 */
export function errorDeDia(valor: string): string | null {
  const dia = Number(valor)
  if (valor.trim() === '' || !Number.isInteger(dia) || dia < 1 || dia > DIA_MAXIMO) {
    return MENSAJE_DIA
  }
  return null
}

export function errorDeRecargo(valor: string): string | null {
  if (valor.trim() === '') return null // opcional: vacio vale 0 %
  const formato = errorDeFormato(valor, 'El recargo')
  if (formato) return formato

  const numero = importe(valor.trim())
  if (numero.isNegative()) return 'El recargo no puede ser negativo.'
  if (numero.greaterThanOrEqualTo(CIEN)) return 'El recargo tiene que ser menor que 100 %.'
  return null
}

export function errorDeTasaMora(valor: string): string | null {
  if (valor.trim() === '') return 'Cargá la tasa de mora mensual.'
  const formato = errorDeFormato(valor, 'La tasa de mora mensual')
  if (formato) return formato

  const numero = importe(valor.trim())
  if (numero.lte(0)) return 'La tasa de mora mensual tiene que ser mayor que 0 %.'
  if (numero.greaterThanOrEqualTo(CIEN)) {
    return 'La tasa de mora mensual tiene que ser menor que 100 %.'
  }
  return null
}

/** El decimal de un valor ya validado, o el rechazo con su mensaje. */
function exigir(valor: string, error: string | null): Importe {
  if (error) throw new ReglaVencimientosInvalida(error)
  return importe(valor.trim())
}

/**
 * Valida la regla completa antes de guardarla (RNF-10). Lanza con un mensaje
 * comprensible si algo no cierra.
 *
 * La mora es parte de la regla, no un dato aparte: sin mora positiva no hay
 * forma de que dejar vencer cueste mas que pagar un recargo.
 */
export function validarReglaVencimientos(
  tramos: readonly TramoRegla[],
  tasaMoraMensual: string,
): void {
  const mora = exigir(tasaMoraMensual, errorDeTasaMora(tasaMoraMensual))

  if (tramos.length < 1 || tramos.length > 3) {
    throw new ReglaVencimientosInvalida('La regla tiene entre 1 y 3 vencimientos.')
  }

  const ordenados = [...tramos].sort((a, b) => a.orden - b.orden)

  ordenados.forEach((tramo, i) => {
    if (tramo.orden !== i + 1) {
      throw new ReglaVencimientosInvalida('Los vencimientos deben numerarse 1, 2, 3 sin saltos.')
    }
  })

  const recargos = ordenados.map((tramo) =>
    exigir(
      tramo.recargoPorcentaje,
      tramo.recargoPorcentaje.trim() === ''
        ? 'El recargo tiene que ser un número.'
        : errorDeRecargo(tramo.recargoPorcentaje),
    ),
  )

  if (!recargos[0]!.equals(0)) {
    throw new ReglaVencimientosInvalida(
      'El primer vencimiento es el importe base: su recargo tiene que ser 0 %.',
    )
  }

  let diaAnterior = 0
  ordenados.forEach((tramo) => {
    const errorDia = errorDeDia(String(tramo.diaDelMes))
    if (errorDia) throw new ReglaVencimientosInvalida(errorDia)

    if (tramo.diaDelMes <= diaAnterior) {
      throw new ReglaVencimientosInvalida('Los días de los vencimientos tienen que ser crecientes.')
    }

    diaAnterior = tramo.diaDelMes
  })

  const recargoMasAlto = Decimal.max(...recargos)
  if (!mora.greaterThan(recargoMasAlto)) {
    throw new ReglaVencimientosInvalida(
      `La tasa de mora mensual (${mora.toFixed(DECIMALES_TASA)} %) debe ser ` +
        `mayor que el recargo más alto ` +
        `(${recargoMasAlto.toFixed(DECIMALES_TASA)} %): de lo contrario conviene ` +
        'dejar vencer en firme antes que pagar ese recargo.',
    )
  }
}
