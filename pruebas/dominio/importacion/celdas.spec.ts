import { describe, expect, test } from 'vitest'

import { leerCoeficiente, leerDni, leerFecha } from '@/dominio/importacion/celdas'

describe('celdas', () => {
  test('coeficiente acepta coma o punto y hasta 8 decimales', () => {
    expect(leerCoeficiente('1,04166667')).toEqual({ valor: '1.04166667' })
    expect(leerCoeficiente(' 8.5 ')).toEqual({ valor: '8.5' })
  })
  test('coeficiente rechaza sin redondear', () => {
    expect(leerCoeficiente('1.041666667')).toEqual({
      error: 'El coeficiente admite hasta 8 decimales.',
    })
    expect(leerCoeficiente('0')).toEqual({ error: 'El coeficiente tiene que ser mayor que cero.' })
    expect(leerCoeficiente('1e-7')).toHaveProperty('error')
    expect(leerCoeficiente('')).toEqual({ error: 'Falta el coeficiente.' })
  })
  test('fecha en ISO o día/mes/año', () => {
    expect(leerFecha('2026-11-01')).toEqual({ valor: '2026-11-01' })
    expect(leerFecha('1/11/2026')).toEqual({ valor: '2026-11-01' })
    expect(leerFecha('31/02/2026')).toHaveProperty('error')
  })
  test('DNI sin puntos, 7 u 8 dígitos', () => {
    expect(leerDni('30.123.456')).toEqual({ valor: '30123456' })
    expect(leerDni('123')).toEqual({ error: 'El DNI tiene que tener 7 u 8 números.' })
  })
})
