import { describe, expect, it } from 'vitest'

import { importe } from '@/compartido/dinero'
import { imputar, type DetalleImpago } from '@/dominio/liquidacion/imputacion'

/**
 * Imputacion de pagos (regla RN-08 § 7.2, `FR-022`, `FR-023`, SC-009).
 *
 * La promesa que no se negocia: `suma(imputaciones) + sobrante = importe`, con
 * tolerancia cero. Un peso que se pierde en la imputacion es un peso que el
 * consorcista pago y el consorcio no registro.
 */

const fecha = (dia: string) => new Date(`${dia}T00:00:00Z`)

const impago = (id: string, saldo: string, vencimiento: string): DetalleImpago => ({
  detalleId: id,
  saldo,
  vencimiento: fecha(vencimiento),
})

const sumaDe = (imputaciones: { importeImputado: string }[]) =>
  imputaciones.reduce((total, i) => total.plus(importe(i.importeImputado)), importe('0'))

describe('imputacion por antiguedad', () => {
  const TRES = [
    impago('d-1', '10000.00', '2026-01-10'),
    impago('d-2', '10000.00', '2026-02-10'),
    impago('d-3', '10000.00', '2026-03-10'),
  ]

  it('un pago que cubre una liquidacion y media va a la mas antigua primero', () => {
    const resultado = imputar('15000.00', TRES)

    expect(resultado.imputaciones).toEqual([
      { detalleId: 'd-1', importeImputado: '10000.00', recargoCobrado: '0.00' },
      { detalleId: 'd-2', importeImputado: '5000.00', recargoCobrado: '0.00' },
    ])
    expect(resultado.sobrante).toBe('0.00')
  })

  it('ordena por vencimiento aunque lleguen desordenadas', () => {
    const resultado = imputar('10000.00', [TRES[2], TRES[0], TRES[1]])

    expect(resultado.imputaciones[0].detalleId).toBe('d-1')
  })

  it('la suma de imputaciones mas el sobrante iguala el pago, con tolerancia cero', () => {
    for (const monto of ['0.01', '9999.99', '15000.00', '30000.00', '45000.00']) {
      const resultado = imputar(monto, TRES)
      expect(sumaDe(resultado.imputaciones).plus(importe(resultado.sobrante)).toFixed(2)).toBe(
        monto,
      )
    }
  })

  it('un pago que excede la deuda deja todo el resto como sobrante', () => {
    const resultado = imputar('45000.00', TRES)

    expect(resultado.imputaciones).toHaveLength(3)
    expect(resultado.sobrante).toBe('15000.00')
  })

  it('sin deuda, el pago entero queda como sobrante', () => {
    const resultado = imputar('5000.00', [])

    expect(resultado.imputaciones).toEqual([])
    expect(resultado.sobrante).toBe('5000.00')
  })

  it('no genera imputaciones de cero', () => {
    const resultado = imputar('10000.00', TRES)

    expect(resultado.imputaciones).toHaveLength(1)
    expect(resultado.imputaciones.every((i) => importe(i.importeImputado).greaterThan(0))).toBe(
      true,
    )
  })

  it('un pago de cero no imputa nada', () => {
    const resultado = imputar('0.00', TRES)

    expect(resultado.imputaciones).toEqual([])
    expect(resultado.sobrante).toBe('0.00')
  })

  it('saltea los detalles que ya estan en cero', () => {
    const resultado = imputar('5000.00', [impago('d-0', '0.00', '2025-12-10'), ...TRES])

    expect(resultado.imputaciones).toEqual([
      { detalleId: 'd-1', importeImputado: '5000.00', recargoCobrado: '0.00' },
    ])
  })
})

describe('imputacion con recargo escalonado (RF-08)', () => {
  const conRecargo = (
    id: string,
    saldo: string,
    vencimiento: string,
    recargoPorcentaje: string,
  ): DetalleImpago => ({ detalleId: id, saldo, vencimiento: fecha(vencimiento), recargoPorcentaje })

  it('saldar una expensa dentro de un tramo con recargo cobra base + recargo', () => {
    // Saldo 100000 al 5 %: exigible 105000. El capital cancela la deuda y el
    // recargo se registra aparte (no como sobrante).
    const resultado = imputar('105000.00', [conRecargo('d-1', '100000.00', '2026-11-20', '5.0000')])

    expect(resultado.imputaciones).toEqual([
      { detalleId: 'd-1', importeImputado: '100000.00', recargoCobrado: '5000.00' },
    ])
    expect(resultado.sobrante).toBe('0.00')
  })

  it('el invariante se mantiene con recargo: capital + recargo + sobrante = pagado', () => {
    const impagos = [conRecargo('d-1', '100000.00', '2026-11-20', '5.0000')]
    for (const monto of ['0.01', '50000.00', '105000.00', '120000.00']) {
      const r = imputar(monto, impagos)
      const total = r.imputaciones
        .reduce(
          (acc, i) => acc.plus(importe(i.importeImputado)).plus(importe(i.recargoCobrado)),
          importe('0'),
        )
        .plus(importe(r.sobrante))
      expect(total.toFixed(2)).toBe(monto)
    }
  })

  it('paga primero la deuda vieja vencida en firme (sin recargo) y recarga solo la del mes', () => {
    // d-1 vieja (vencida en firme, recargo 0), d-2 del mes al 5 %.
    const impagos = [
      conRecargo('d-1', '10000.00', '2026-10-10', '0.0000'),
      conRecargo('d-2', '10000.00', '2026-11-20', '5.0000'),
    ]
    // 10000 (salda d-1) + 10500 (salda d-2 con 5 %) = 20500.
    const resultado = imputar('20500.00', impagos)

    expect(resultado.imputaciones).toEqual([
      { detalleId: 'd-1', importeImputado: '10000.00', recargoCobrado: '0.00' },
      { detalleId: 'd-2', importeImputado: '10000.00', recargoCobrado: '500.00' },
    ])
    expect(resultado.sobrante).toBe('0.00')
  })
})
