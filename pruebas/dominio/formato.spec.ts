import { describe, expect, it } from 'vitest'

import {
  coeficienteParaMostrar,
  coeficienteSerializado,
  importeDesdeEntrada,
  importeParaMostrar,
  importeSerializado,
  plural,
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

  it('para mostrar, saca los ceros de relleno y nunca baja de dos decimales', () => {
    expect(coeficienteParaMostrar('8.33')).toBe('8.33')
    expect(coeficienteParaMostrar('100')).toBe('100.00')
    expect(coeficienteParaMostrar('1.0416')).toBe('1.0416')
    expect(coeficienteParaMostrar('8.33333333')).toBe('8.33333333')
  })
})

describe('entrada de importes (RF-04)', () => {
  it('acepta la coma decimal y el punto de miles, y deja pasar el punto decimal', () => {
    expect(importeDesdeEntrada('12000,50')).toBe('12000.50')
    expect(importeDesdeEntrada('12.000,50')).toBe('12000.50')
    expect(importeDesdeEntrada(' 12000.50 ')).toBe('12000.50')
    expect(importeDesdeEntrada('1.234.567,89')).toBe('1234567.89')
  })

  it('no arregla lo que no es un importe: queda invalido y lo rechaza la validacion', () => {
    expect(importeDesdeEntrada('12,000,50')).toBe('12.000,50')
    expect(importeDesdeEntrada('abc')).toBe('abc')
  })
})

describe('plural', () => {
  it('elige la palabra segun la cantidad', () => {
    expect(plural(1, 'gasto', 'gastos')).toBe('1 gasto')
    expect(plural(0, 'gasto', 'gastos')).toBe('0 gastos')
    expect(plural(12, 'unidad', 'unidades')).toBe('12 unidades')
  })
})
