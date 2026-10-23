import { describe, expect, it } from 'vitest'

import { imputar } from '@/dominio/liquidacion/imputacion'
import { saldosDeUnidad, type DetalleHistoricoUnidad } from '@/dominio/liquidacion/saldo'

const fecha = (dia: string) => new Date(`${dia}T00:00:00Z`)

const d = (
  id: string,
  totalUnidad: string,
  deudaAnterior: string,
  interesMora: string,
  imputado: string,
  vencimiento: string,
): DetalleHistoricoUnidad => ({
  detalleId: id,
  totalUnidad,
  deudaAnterior,
  interesMora,
  imputado,
  vencimiento: fecha(vencimiento),
})

describe('saldosDeUnidad — regla de arrastre y saldo propio (RN-08 ampliada)', () => {
  it('una sola liquidacion sin arrastre calcula propio igual a totalUnidad', () => {
    const detalles = [d('d-1', '1000.00', '0.00', '0.00', '0.00', '2026-01-10')]
    const resultado = saldosDeUnidad(detalles)

    expect(resultado.detalles).toHaveLength(1)
    expect(resultado.detalles[0]).toEqual({
      detalleId: 'd-1',
      propio: '1000.00',
      saldo: '1000.00',
      interesPendiente: '0.00',
      capitalPendiente: '1000.00',
      vencimiento: fecha('2026-01-10'),
    })
    expect(resultado.saldoTotal).toBe('1000.00')
    expect(resultado.saldoExigible).toBe('1000.00')
  })

  it('dos liquidaciones donde la segunda arrastra la deuda de la primera', () => {
    // Enero: total 1000.00, impago.
    // Febrero: propio 1200.00 + deudaAnterior 1000.00 + interes 50.00 = 2250.00.
    const detalles = [
      d('d-1', '1000.00', '0.00', '0.00', '0.00', '2026-01-10'),
      d('d-2', '2250.00', '1000.00', '50.00', '0.00', '2026-02-10'),
    ]
    const resultado = saldosDeUnidad(detalles)

    expect(resultado.detalles).toHaveLength(2)
    // Enero debe su saldo propio: 1000.00
    expect(resultado.detalles[0].saldo).toBe('1000.00')
    expect(resultado.detalles[0].capitalPendiente).toBe('1000.00')

    // Febrero debe su propio: 2250 - 1000 = 1250.00 (1200 ordinario/extra + 50 interes)
    expect(resultado.detalles[1].propio).toBe('1250.00')
    expect(resultado.detalles[1].saldo).toBe('1250.00')
    expect(resultado.detalles[1].interesPendiente).toBe('50.00')
    expect(resultado.detalles[1].capitalPendiente).toBe('1200.00')

    // El saldo total es 1000 + 1250 = 2250.00, que coincide con el total de la ultima
    expect(resultado.saldoTotal).toBe('2250.00')
    expect(resultado.saldoExigible).toBe('2250.00')
  })

  it('imputacion parcial en la liquidacion arrastrada reduce su saldo', () => {
    // Enero tenia 1000, se le imputaron 600.
    // Febrero se emitio con deudaAnterior 400. Propio de febrero: 1500. Total = 1900.
    const detalles = [
      d('d-1', '1000.00', '0.00', '0.00', '600.00', '2026-01-10'),
      d('d-2', '1900.00', '400.00', '0.00', '0.00', '2026-02-10'),
    ]
    const resultado = saldosDeUnidad(detalles)

    expect(resultado.detalles[0].saldo).toBe('400.00')
    expect(resultado.detalles[1].saldo).toBe('1500.00')
    expect(resultado.saldoTotal).toBe('1900.00')
  })

  it('pago a un detalle cubre primero el interes liquidado y luego el capital', () => {
    // Detalle con interes liquidado de 100.00 y propio de 1000.00 (capital 900.00).
    // Se le imputan 60.00: cubre 60.00 de interes, queda 40.00 de interes y 900.00 de capital.
    const detalles1 = [d('d-1', '1000.00', '0.00', '100.00', '60.00', '2026-01-10')]
    const res1 = saldosDeUnidad(detalles1)
    expect(res1.detalles[0].saldo).toBe('940.00')
    expect(res1.detalles[0].interesPendiente).toBe('40.00')
    expect(res1.detalles[0].capitalPendiente).toBe('900.00')

    // Se le imputan 150.00: cubre los 100.00 de interes y 50.00 de capital.
    const detalles2 = [d('d-1', '1000.00', '0.00', '100.00', '150.00', '2026-01-10')]
    const res2 = saldosDeUnidad(detalles2)
    expect(res2.detalles[0].saldo).toBe('850.00')
    expect(res2.detalles[0].interesPendiente).toBe('0.00')
    expect(res2.detalles[0].capitalPendiente).toBe('850.00')
  })

  it('saldo a favor que genera propio negativo se compensa contra deudas anteriores', () => {
    // Enero: impago 1000.00.
    // Febrero: gastos propios 300.00, deuda anterior 1000.00, pero tenia un saldo a favor de 500.00 aplicado.
    // totalUnidad = 300 + 1000 - 500 = 800.00.
    // propio = totalUnidad - deudaAnterior = 800 - 1000 = -200.00.
    // Ese exceso (-200.00) cancela 200.00 de enero -> enero queda en 800.00, febrero en 0.00.
    // Total deuda real = 800.00.
    const detalles = [
      d('d-1', '1000.00', '0.00', '0.00', '0.00', '2026-01-10'),
      d('d-2', '800.00', '1000.00', '0.00', '0.00', '2026-02-10'),
    ]
    const resultado = saldosDeUnidad(detalles)

    expect(resultado.detalles[0].saldo).toBe('800.00')
    expect(resultado.detalles[1].saldo).toBe('0.00')
    expect(resultado.saldoTotal).toBe('800.00')
  })

  it('ordena por vencimiento ascendente para garantizar calculo cronologico', () => {
    const detalles = [
      d('d-2', '2000.00', '1000.00', '0.00', '0.00', '2026-02-10'),
      d('d-1', '1000.00', '0.00', '0.00', '0.00', '2026-01-10'),
    ]
    const resultado = saldosDeUnidad(detalles)

    expect(resultado.detalles[0].detalleId).toBe('d-1')
    expect(resultado.detalles[1].detalleId).toBe('d-2')
    expect(resultado.saldoTotal).toBe('2000.00')
  })

  it('deuda exigible coincide con la ultima expensa menos lo pagado desde su emision', () => {
    const detalles = [
      d('d-1', '1000.00', '0.00', '0.00', '0.00', '2026-01-10'),
      d('d-2', '2000.00', '1000.00', '0.00', '0.00', '2026-02-10'),
      d('d-3', '3500.00', '2000.00', '0.00', '500.00', '2026-03-10'),
    ]
    const resultado = saldosDeUnidad(detalles)

    expect(resultado.detalles[0].saldo).toBe('1000.00')
    expect(resultado.detalles[1].saldo).toBe('1000.00')
    expect(resultado.detalles[2].saldo).toBe('1000.00') // 1500 propio - 500 imputado
    expect(resultado.saldoTotal).toBe('3000.00')
    expect(resultado.saldoExigible).toBe('3000.00')
  })

  it('expensa saldada: un pago total deja cada detalle y el total en 0 (nota #4)', () => {
    // mes1 propio 100 impago; mes2 propio 120 con deudaAnterior 100 -> total 220.
    // El pago total (220) imputa 100 a mes1 y 120 a mes2: todo queda saldado.
    // Con `totalUnidad − imputado` mes2 mostraba 220 − 120 = 100 "pendiente"
    // aunque esta todo pago; con el des-arrastre ambos quedan en 0.
    const detalles = [
      d('mes1', '100.00', '0.00', '0.00', '100.00', '2026-01-10'),
      d('mes2', '220.00', '100.00', '0.00', '120.00', '2026-02-10'),
    ]
    const resultado = saldosDeUnidad(detalles)

    expect(resultado.detalles[0].saldo).toBe('0.00')
    expect(resultado.detalles[1].saldo).toBe('0.00')
    expect(resultado.saldoTotal).toBe('0.00')
  })

  it('el mismo arrastre con pago parcial reparte y deja el resto en el ultimo (nota #4)', () => {
    // Pago parcial de 150 sobre el mismo escenario: 100 a mes1 y 50 a mes2.
    // mes1 queda saldado y mes2 debe sus 70 propios restantes.
    const detalles = [
      d('mes1', '100.00', '0.00', '0.00', '100.00', '2026-01-10'),
      d('mes2', '220.00', '100.00', '0.00', '50.00', '2026-02-10'),
    ]
    const resultado = saldosDeUnidad(detalles)

    expect(resultado.detalles[0].saldo).toBe('0.00')
    expect(resultado.detalles[1].saldo).toBe('70.00')
    expect(resultado.saldoTotal).toBe('70.00')
  })

  it('imputar el saldo exigible cancela todos los periodos adeudados y el actual', () => {
    // Enero 1000 impago. Febrero arrastra 1000 + 100 interes + 1500 propio = 2600.
    const detalles = [
      d('d-1', '1000.00', '0.00', '0.00', '0.00', '2026-01-10'),
      d('d-2', '2600.00', '1000.00', '100.00', '0.00', '2026-02-10'),
    ]
    const saldos = saldosDeUnidad(detalles)
    expect(saldos.saldoExigible).toBe('2600.00')

    const impagos = saldos.detalles.map((x) => ({
      detalleId: x.detalleId,
      saldo: x.saldo,
      vencimiento: x.vencimiento,
    }))

    const resultadoImputacion = imputar(saldos.saldoExigible, impagos)
    expect(resultadoImputacion.sobrante).toBe('0.00')
    expect(resultadoImputacion.imputaciones).toEqual([
      { detalleId: 'd-1', importeImputado: '1000.00', recargoCobrado: '0.00' },
      { detalleId: 'd-2', importeImputado: '1600.00', recargoCobrado: '0.00' },
    ])
  })
})
