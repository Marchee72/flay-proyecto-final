import { describe, expect, it } from 'vitest'

import { ErrorDeAplicacion } from '@/compartido/errores'
import {
  errorDeDia,
  errorDeRecargo,
  errorDeTasaMora,
  escalonadoDesdeTramos,
  exigible,
  montoExigible,
  pagoBloqueadoHastaLiquidar,
  recargoMaximo,
  recargoVigente,
  tramosDesdeEscalonado,
  validarReglaVencimientos,
  type TramoCongelado,
  type TramoRegla,
} from '@/dominio/liquidacion/vencimientos'

const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`)

// Ejemplo de la nota: dias 10/20/28, recargos 0/5/8 (noviembre 2026).
const tramos: TramoCongelado[] = [
  { orden: 1, fecha: fecha('2026-11-10'), recargoPorcentaje: '0.0000' },
  { orden: 2, fecha: fecha('2026-11-20'), recargoPorcentaje: '5.0000' },
  { orden: 3, fecha: fecha('2026-11-28'), recargoPorcentaje: '8.0000' },
]

describe('recargoVigente — tramo aplicable por fecha (RF-08)', () => {
  it('antes del primer vencimiento: base, tramo 1', () => {
    expect(recargoVigente(tramos, fecha('2026-11-05'))).toMatchObject({
      recargoPorcentaje: '0.0000',
      tramo: 1,
      venceEnFirme: false,
    })
  })

  it('el día del primer vencimiento es inclusive: todavía base', () => {
    expect(recargoVigente(tramos, fecha('2026-11-10')).tramo).toBe(1)
  })

  it('entre el 1º y el 2º: recargo del tramo 2', () => {
    expect(recargoVigente(tramos, fecha('2026-11-15'))).toMatchObject({
      recargoPorcentaje: '5.0000',
      tramo: 2,
    })
  })

  it('el día del último vencimiento es inclusive: tramo 3', () => {
    expect(recargoVigente(tramos, fecha('2026-11-28'))).toMatchObject({
      recargoPorcentaje: '8.0000',
      tramo: 3,
    })
  })

  it('pasado el último: vencida en firme, sin recargo', () => {
    expect(recargoVigente(tramos, fecha('2026-11-29'))).toMatchObject({
      recargoPorcentaje: '0.0000',
      tramo: null,
      venceEnFirme: true,
    })
  })
})

describe('montoExigible — base más recargo (Principio II)', () => {
  it('sin recargo, el exigible es el base', () => {
    expect(montoExigible('100000.00', '0.0000')).toBe('100000.00')
  })

  it('5 % sobre 100000', () => {
    expect(montoExigible('100000.00', '5.0000')).toBe('105000.00')
  })

  it('8 % sobre 100000', () => {
    expect(montoExigible('100000.00', '8.0000')).toBe('108000.00')
  })

  it('redondea a dos decimales solo al final (1234.57 × 1.05 = 1296.2985)', () => {
    expect(montoExigible('1234.57', '5.0000')).toBe('1296.30')
  })
})

describe('recargoMaximo — el que viaja con la deuda arrastrada (decision 2026-11-10)', () => {
  it('es el porcentaje mas alto del escalonado, aunque no sea el ultimo', () => {
    expect(recargoMaximo(tramos)).toBe('8.0000')
    expect(
      recargoMaximo([
        { recargoPorcentaje: '0' },
        { recargoPorcentaje: '20' },
        { recargoPorcentaje: '5' },
      ]),
    ).toBe('20.0000')
  })

  it('sin tramos (liquidacion anterior a la regla) es cero', () => {
    expect(recargoMaximo([])).toBe('0.0000')
  })
})

describe('exigible — el unico calculo del monto a pagar (RF-28)', () => {
  it('suma saldo mas recargo de cada deuda, redondeando cada recargo', () => {
    expect(
      exigible([
        { saldo: '1000.00', recargoPorcentaje: '0' },
        { saldo: '1234.57', recargoPorcentaje: '5.0000' },
      ]),
    ).toBe('2296.30')
  })

  it('sin deudas es cero', () => {
    expect(exigible([])).toBe('0.00')
  })
})

describe('pagoBloqueadoHastaLiquidar — pasado el firme no se paga (decision 2026-11-10)', () => {
  it('bloquea al dia siguiente del vencimiento en firme si queda saldo', () => {
    expect(pagoBloqueadoHastaLiquidar('100.00', fecha('2026-11-28'), fecha('2026-11-29'))).toBe(
      true,
    )
  })

  it('el dia del vencimiento en firme todavia se paga', () => {
    expect(pagoBloqueadoHastaLiquidar('100.00', fecha('2026-11-28'), fecha('2026-11-28'))).toBe(
      false,
    )
  })

  it('sin saldo o sin liquidacion no hay nada que bloquear', () => {
    expect(pagoBloqueadoHastaLiquidar('0.00', fecha('2026-11-28'), fecha('2026-12-05'))).toBe(false)
    expect(pagoBloqueadoHastaLiquidar('100.00', null, fecha('2026-12-05'))).toBe(false)
  })
})

describe('validarReglaVencimientos — coherencia (RF-08, RNF-10)', () => {
  it('acepta 3 tramos con mora mayor al último recargo', () => {
    expect(() =>
      validarReglaVencimientos(
        [
          { orden: 1, diaDelMes: 10, recargoPorcentaje: '0.0000' },
          { orden: 2, diaDelMes: 20, recargoPorcentaje: '5.0000' },
          { orden: 3, diaDelMes: 28, recargoPorcentaje: '8.0000' },
        ],
        '10.0000',
      ),
    ).not.toThrow()
  })

  it('acepta un solo tramo (comportamiento actual)', () => {
    expect(() =>
      validarReglaVencimientos(
        [{ orden: 1, diaDelMes: 10, recargoPorcentaje: '0.0000' }],
        '10.0000',
      ),
    ).not.toThrow()
  })

  it('rechaza mora igual o menor que el último recargo', () => {
    expect(() =>
      validarReglaVencimientos(
        [
          { orden: 1, diaDelMes: 10, recargoPorcentaje: '0.0000' },
          { orden: 2, diaDelMes: 20, recargoPorcentaje: '10.0000' },
        ],
        '10.0000',
      ),
    ).toThrow(ErrorDeAplicacion)
  })

  it('rechaza días no ascendentes', () => {
    expect(() =>
      validarReglaVencimientos(
        [
          { orden: 1, diaDelMes: 20, recargoPorcentaje: '0.0000' },
          { orden: 2, diaDelMes: 10, recargoPorcentaje: '5.0000' },
        ],
        '10.0000',
      ),
    ).toThrow()
  })

  it('rechaza día mayor a 28', () => {
    expect(() =>
      validarReglaVencimientos(
        [{ orden: 1, diaDelMes: 30, recargoPorcentaje: '0.0000' }],
        '10.0000',
      ),
    ).toThrow()
  })

  it('rechaza primer tramo con recargo distinto de 0', () => {
    expect(() =>
      validarReglaVencimientos(
        [{ orden: 1, diaDelMes: 10, recargoPorcentaje: '3.0000' }],
        '10.0000',
      ),
    ).toThrow()
  })

  it('rechaza una tasa de mora en cero: no hay forma de que dejar vencer cueste más', () => {
    expect(() =>
      validarReglaVencimientos(
        [{ orden: 1, diaDelMes: 10, recargoPorcentaje: '0.0000' }],
        '0.0000',
      ),
    ).toThrow(ErrorDeAplicacion)
  })

  it('rechaza una mora que no supera al recargo más alto aunque no sea el último', () => {
    expect(() =>
      validarReglaVencimientos(
        [
          { orden: 1, diaDelMes: 10, recargoPorcentaje: '0.0000' },
          { orden: 2, diaDelMes: 20, recargoPorcentaje: '12.0000' },
          { orden: 3, diaDelMes: 28, recargoPorcentaje: '5.0000' },
        ],
        '10.0000',
      ),
    ).toThrow(ErrorDeAplicacion)
  })

  it('rechaza un porcentaje que no es un número, sin filtrar el error técnico', () => {
    expect(() =>
      validarReglaVencimientos([{ orden: 1, diaDelMes: 10, recargoPorcentaje: 'abc' }], '10.0000'),
    ).toThrow(ErrorDeAplicacion)

    expect(() =>
      validarReglaVencimientos([{ orden: 1, diaDelMes: 10, recargoPorcentaje: '0.0000' }], 'diez'),
    ).toThrow(ErrorDeAplicacion)
  })

  it('rechaza más de cuatro decimales: la columna no los guarda', () => {
    expect(() =>
      validarReglaVencimientos(
        [
          { orden: 1, diaDelMes: 10, recargoPorcentaje: '0.0000' },
          { orden: 2, diaDelMes: 20, recargoPorcentaje: '1.23456' },
        ],
        '10.0000',
      ),
    ).toThrow(ErrorDeAplicacion)
  })

  it('rechaza un día que no es entero', () => {
    expect(() =>
      validarReglaVencimientos(
        [{ orden: 1, diaDelMes: Number.NaN, recargoPorcentaje: '0.0000' }],
        '10.0000',
      ),
    ).toThrow(ErrorDeAplicacion)
  })
})

describe('validadores de campo — los mismos que usa el formulario', () => {
  it('errorDeDia acepta 1 a 28 y rechaza vacío, decimales y fuera de rango', () => {
    expect(errorDeDia('1')).toBeNull()
    expect(errorDeDia('28')).toBeNull()
    expect(errorDeDia('0')).not.toBeNull()
    expect(errorDeDia('29')).not.toBeNull()
    expect(errorDeDia('1.5')).not.toBeNull()
    expect(errorDeDia('')).not.toBeNull()
  })

  it('errorDeRecargo: vacío es válido y el resto tiene rango y escala', () => {
    expect(errorDeRecargo('')).toBeNull()
    expect(errorDeRecargo('0')).toBeNull()
    expect(errorDeRecargo('99.9999')).toBeNull()
    expect(errorDeRecargo('-1')).toContain('negativo')
    expect(errorDeRecargo('100')).toContain('menor que 100')
    expect(errorDeRecargo('1.23456')).toContain('4 decimales')
    expect(errorDeRecargo('abc')).toContain('número')
  })

  it('errorDeTasaMora exige positiva, menor a 100 y hasta 4 decimales', () => {
    expect(errorDeTasaMora('3.5')).toBeNull()
    expect(errorDeTasaMora('')).toContain('Cargá')
    expect(errorDeTasaMora('0')).toContain('mayor que 0')
    expect(errorDeTasaMora('100')).toContain('menor que 100')
    expect(errorDeTasaMora('3.55555')).toContain('4 decimales')
  })
})

describe('vista del administrador <-> tramos de boleta (RF-08)', () => {
  it('sin escalones: solo el vencimiento en firme, sin recargo', () => {
    expect(tramosDesdeEscalonado([], 10)).toEqual([
      { orden: 1, diaDelMes: 10, recargoPorcentaje: '0' },
    ])
  })

  it('el recargo del 1er vencimiento se cobra al pagar hasta el firme', () => {
    // Admin: "despues del dia 10, +5 %; en firme el dia 20". En la boleta el 5 %
    // vive en el tramo del dia 20 y el primero queda en el base.
    expect(tramosDesdeEscalonado([{ diaDelMes: 10, recargoPorcentaje: '5' }], 20)).toEqual([
      { orden: 1, diaDelMes: 10, recargoPorcentaje: '0' },
      { orden: 2, diaDelMes: 20, recargoPorcentaje: '5' },
    ])
  })

  it('dos escalones con recargo + firme corren el recargo un lugar', () => {
    expect(
      tramosDesdeEscalonado(
        [
          { diaDelMes: 10, recargoPorcentaje: '5' },
          { diaDelMes: 20, recargoPorcentaje: '8' },
        ],
        28,
      ),
    ).toEqual([
      { orden: 1, diaDelMes: 10, recargoPorcentaje: '0' },
      { orden: 2, diaDelMes: 20, recargoPorcentaje: '5' },
      { orden: 3, diaDelMes: 28, recargoPorcentaje: '8' },
    ])
  })

  it('escalonadoDesdeTramos es la inversa', () => {
    expect(
      escalonadoDesdeTramos([
        { orden: 1, diaDelMes: 10, recargoPorcentaje: '0.0000' },
        { orden: 2, diaDelMes: 20, recargoPorcentaje: '5.0000' },
        { orden: 3, diaDelMes: 28, recargoPorcentaje: '8.0000' },
      ]),
    ).toEqual({
      escalones: [
        { diaDelMes: 10, recargoPorcentaje: '5.0000' },
        { diaDelMes: 20, recargoPorcentaje: '8.0000' },
      ],
      diaFirme: 28,
    })
  })

  it('un solo tramo vuelve a cero escalones', () => {
    expect(
      escalonadoDesdeTramos([{ orden: 1, diaDelMes: 15, recargoPorcentaje: '0.0000' }]),
    ).toEqual({ escalones: [], diaFirme: 15 })
  })

  it('ida y vuelta conserva la regla', () => {
    const escalones = [
      { diaDelMes: 8, recargoPorcentaje: '3.0000' },
      { diaDelMes: 18, recargoPorcentaje: '7.0000' },
    ]
    const tramos: TramoRegla[] = tramosDesdeEscalonado(escalones, 27)
    expect(escalonadoDesdeTramos(tramos)).toEqual({ escalones, diaFirme: 27 })
  })
})
