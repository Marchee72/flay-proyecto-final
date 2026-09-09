import { describe, expect, it } from 'vitest'

import {
  coeficienteSerializado,
  importeParaMostrar,
  importeSerializado,
} from '@/compartido/formato'

// SC-010: el importe llega a la interfaz como cadena y sin perder un centavo,
// tambien cuando tiene mas digitos significativos de los que un number aguanta.
describe('formato del dinero', () => {
  it('serializa importes con dos decimales, como cadena', () => {
    expect(importeSerializado('1325000')).toBe('1325000.00')
    expect(importeSerializado('0.1')).toBe('0.10')
  })

  it('no pierde precision con importes largos', () => {
    const largo = '12345678901234567.89'
    expect(importeSerializado(largo)).toBe(largo)
    expect(importeParaMostrar(largo)).toContain('12.345.678.901.234.567,89')
  })

  it('serializa coeficientes con ocho decimales', () => {
    expect(coeficienteSerializado('12.5')).toBe('12.50000000')
    expect(coeficienteSerializado('100')).toBe('100.00000000')
  })
})
