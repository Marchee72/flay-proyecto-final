import { Decimal, importe } from '@/compartido/dinero'

/**
 * Calculo de saldo propio por detalle y regla de arrastre (RN-08 ampliada, RF-28).
 *
 * Cada detalle de liquidacion tiene una "parte propia" (lo cargado originalmente
 * por ese periodo: expensas ordinarias, extraordinarias, interes liquidado y
 * redondeo, menos el saldo a favor aplicado en la emision).
 *
 * El saldo de un detalle es `propio − imputado`.
 * Pagar la ultima expensa cancela los saldos propios pendientes de los periodos
 * arrastrados y del actual en orden cronologico.
 */

const DECIMALES_IMPORTE = 2

export interface DetalleHistoricoUnidad {
  detalleId: string
  totalUnidad: string
  deudaAnterior: string
  interesMora: string
  imputado: string
  vencimiento: Date
}

export interface SaldoDetalle {
  detalleId: string
  propio: string
  saldo: string
  interesPendiente: string
  capitalPendiente: string
  vencimiento: Date
}

export interface ResumenSaldosUnidad {
  detalles: SaldoDetalle[]
  saldoTotal: string
  saldoExigible: string
}

export function saldosDeUnidad(detalles: readonly DetalleHistoricoUnidad[]): ResumenSaldosUnidad {
  if (detalles.length === 0) {
    return {
      detalles: [],
      saldoTotal: '0.00',
      saldoExigible: '0.00',
    }
  }

  // Ordenar por vencimiento ascendente para procesar cronologicamente
  const cronologicos = [...detalles].sort(
    (a, b) => a.vencimiento.getTime() - b.vencimiento.getTime(),
  )

  interface DetalleCalculado {
    detalleId: string
    vencimiento: Date
    propio: Decimal
    saldo: Decimal
    interesMora: Decimal
    imputado: Decimal
  }

  const procesados: DetalleCalculado[] = []

  for (const d of cronologicos) {
    const total = importe(d.totalUnidad)
    const deudaAnt = importe(d.deudaAnterior)
    const imputado = importe(d.imputado)
    const interesMora = importe(d.interesMora)

    let propio = total.minus(deudaAnt)

    if (propio.lessThan(0)) {
      // El saldo a favor aplicado supero los gastos propios y cubrio deuda anterior
      let excesoPorCompensar = propio.abs()
      propio = new Decimal(0)

      // Compensar hacia atras desde el detalle mas antiguo con saldo
      for (const anterior of procesados) {
        if (excesoPorCompensar.isZero()) break
        if (anterior.saldo.greaterThan(0)) {
          const descuento = Decimal.min(anterior.saldo, excesoPorCompensar)
          anterior.saldo = anterior.saldo.minus(descuento)
          excesoPorCompensar = excesoPorCompensar.minus(descuento)
        }
      }
    }

    const saldo = Decimal.max(new Decimal(0), propio.minus(imputado))

    procesados.push({
      detalleId: d.detalleId,
      vencimiento: d.vencimiento,
      propio,
      saldo,
      interesMora,
      imputado,
    })
  }

  const detallesFinales: SaldoDetalle[] = procesados.map((p) => {
    // Lo imputado cubre primero el interes liquidado y luego el capital
    const interesCubierto = Decimal.min(p.imputado, p.interesMora)
    const interesPendienteBase = p.interesMora.minus(interesCubierto)
    const interesPendiente = Decimal.min(p.saldo, interesPendienteBase)
    const capitalPendiente = Decimal.max(new Decimal(0), p.saldo.minus(interesPendiente))

    return {
      detalleId: p.detalleId,
      propio: p.propio.toFixed(DECIMALES_IMPORTE),
      saldo: p.saldo.toFixed(DECIMALES_IMPORTE),
      interesPendiente: interesPendiente.toFixed(DECIMALES_IMPORTE),
      capitalPendiente: capitalPendiente.toFixed(DECIMALES_IMPORTE),
      vencimiento: p.vencimiento,
    }
  })

  const saldoTotalDecimal = detallesFinales.reduce(
    (total, d) => total.plus(importe(d.saldo)),
    new Decimal(0),
  )

  const saldoTotal = saldoTotalDecimal.toFixed(DECIMALES_IMPORTE)

  return {
    detalles: detallesFinales,
    saldoTotal,
    saldoExigible: saldoTotal,
  }
}
