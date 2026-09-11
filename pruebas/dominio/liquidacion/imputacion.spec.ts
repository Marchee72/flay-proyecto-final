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
      { detalleId: 'd-1', importeImputado: '10000.00' },
      { detalleId: 'd-2', importeImputado: '5000.00' },
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

    expect(resultado.imputaciones).toEqual([{ detalleId: 'd-1', importeImputado: '5000.00' }])
  })
})
