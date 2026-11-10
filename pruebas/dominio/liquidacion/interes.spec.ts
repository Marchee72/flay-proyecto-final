import { describe, expect, it } from 'vitest'

import { importe } from '@/compartido/dinero'
import { cargosPorArrastre, type DeudaArrastrada } from '@/dominio/liquidacion/interes'

/**
 * Cargos por arrastre de deuda vencida en firme (`FR-024`, `FR-025`, RF-08, SC-014b).
 *
 * La regla la fijo el usuario el 2026-11-10 y reemplaza la de meses completos
 * del 2026-09-10: pasado el vencimiento en firme no se paga hasta la
 * liquidacion siguiente, y esa liquidacion le carga a la deuda arrastrada el
 * **recargo mas alto** de su escalonado (una sola vez) y la **tasa de mora**
 * (una vez por cada liquidacion que la arrastra). Sobre el capital, sin
 * capitalizar.
 */

const fecha = (dia: string) => new Date(`${dia}T00:00:00Z`)
const MORA = importe('3.0000')

const deuda = (
  id: string,
  capital: string,
  vencimiento: string,
  recargoMaximo = '10.0000',
  recargoYaLiquidado = false,
): DeudaArrastrada => ({
  liquidacionId: id,
  capital,
  vencimiento: fecha(vencimiento),
  recargoMaximo,
  recargoYaLiquidado,
})

describe('cargos por arrastre (FR-024, decision 2026-11-10)', () => {
  it('el ejemplo del usuario: 100.000 con +10 % y mora 3 % arrastran 10.000 + 3.000', () => {
    const calculo = cargosPorArrastre(
      [deuda('l-1', '100000.00', '2026-11-30')],
      MORA,
      fecha('2026-12-01'),
    )

    expect(calculo.desglose).toEqual([
      {
        liquidacionId: 'l-1',
        tipo: 'recargo',
        capital: '100000.00',
        tasaMensual: '10.0000',
        meses: 1,
        importe: '10000.00',
      },
      {
        liquidacionId: 'l-1',
        tipo: 'mora',
        capital: '100000.00',
        tasaMensual: '3.0000',
        meses: 1,
        importe: '3000.00',
      },
    ])
    expect(calculo.total).toBe('13000.00')
  })

  it('en la segunda liquidacion que la arrastra solo suma la mora, no otra vez el recargo', () => {
    const calculo = cargosPorArrastre(
      [deuda('l-1', '100000.00', '2026-11-30', '10.0000', true)],
      MORA,
      fecha('2027-01-01'),
    )

    expect(calculo.desglose.map((l) => l.tipo)).toEqual(['mora'])
    expect(calculo.total).toBe('3000.00')
  })

  it('una mora por liquidacion, no por meses acumulados desde el vencimiento', () => {
    // Seis meses despues sigue siendo una sola mora en esta emision.
    const calculo = cargosPorArrastre(
      [deuda('l-1', '100000.00', '2026-05-30', '10.0000', true)],
      MORA,
      fecha('2026-12-01'),
    )

    expect(calculo.total).toBe('3000.00')
  })

  it('una deuda que todavia no vencio en firme no lleva cargos', () => {
    const calculo = cargosPorArrastre(
      [deuda('l-1', '100000.00', '2026-12-10')],
      MORA,
      fecha('2026-12-01'),
    )

    expect(calculo.desglose).toEqual([])
    expect(calculo.total).toBe('0.00')
  })

  it('el dia del vencimiento en firme todavia se podia pagar: no lleva cargos', () => {
    const calculo = cargosPorArrastre(
      [deuda('l-1', '100000.00', '2026-12-01')],
      MORA,
      fecha('2026-12-01'),
    )

    expect(calculo.total).toBe('0.00')
  })

  it('un capital pagado en parte lleva los cargos sobre el remanente', () => {
    const calculo = cargosPorArrastre(
      [deuda('l-1', '40000.00', '2026-11-30')],
      MORA,
      fecha('2026-12-01'),
    )

    expect(calculo.desglose.map((l) => l.importe)).toEqual(['4000.00', '1200.00'])
  })

  it('sin escalonado (recargo 0) solo corre la mora', () => {
    const calculo = cargosPorArrastre(
      [deuda('l-1', '100000.00', '2026-11-30', '0.0000')],
      MORA,
      fecha('2026-12-01'),
    )

    expect(calculo.desglose.map((l) => l.tipo)).toEqual(['mora'])
  })

  it('suma un calculo independiente por cada liquidacion impaga', () => {
    const calculo = cargosPorArrastre(
      [
        deuda('l-1', '10000.00', '2026-09-30', '10.0000', true),
        deuda('l-2', '20000.00', '2026-10-30', '10.0000', true),
        deuda('l-3', '30000.00', '2026-11-30'),
      ],
      MORA,
      fecha('2026-12-01'),
    )

    // 300 + 600 de mora de las viejas, 3000 + 900 de la nueva.
    expect(calculo.total).toBe('4800.00')
  })

  it('tasa cero y sin deuda dan cero, sin caso especial', () => {
    expect(
      cargosPorArrastre(
        [deuda('l-1', '100000.00', '2026-11-30', '0')],
        importe('0'),
        fecha('2026-12-01'),
      ).total,
    ).toBe('0.00')
    expect(cargosPorArrastre([], MORA, fecha('2026-12-01')).total).toBe('0.00')
  })

  it('redondea cada linea a dos decimales y el total es la suma de las lineas', () => {
    const calculo = cargosPorArrastre(
      [
        deuda('l-1', '333.33', '2026-01-10', '0', true),
        deuda('l-2', '333.33', '2026-01-10', '0', true),
      ],
      importe('1.5000'),
      fecha('2026-02-10'),
    )

    expect(calculo.desglose.map((d) => d.importe)).toEqual(['5.00', '5.00'])
    expect(calculo.total).toBe('10.00')
  })
})
