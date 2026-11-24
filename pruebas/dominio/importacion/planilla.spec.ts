import { describe, expect, test } from 'vitest'

import {
  columnasDe,
  esFilaDeEjemplo,
  normalizarTexto,
  type Columna,
  type PlanillaLeida,
} from '@/dominio/importacion/planilla'

const esquema: Columna[] = [
  { clave: 'designacion', titulo: 'Designación', obligatoria: true },
  { clave: 'coeficiente', titulo: 'Coeficiente', obligatoria: true },
  { clave: 'nota', titulo: 'Nota', obligatoria: false },
]
const p = (encabezados: string[], filas: string[][]): PlanillaLeida => ({
  encabezados,
  filas: filas.map((celdas, i) => ({ numero: i + 2, celdas })),
})

describe('planilla', () => {
  test('normaliza', () => {
    expect(normalizarTexto('  DesignaCIÓN   X ')).toBe('designacion x')
  })
  test('reconoce encabezados sin acentos ni mayúsculas', () => {
    const r = columnasDe(p(['DESIGNACION', ' coeficiente '], [['1A', '5']]), esquema)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor.valor(r.valor.filas[0]!, 'coeficiente')).toBe('5')
  })
  test('columna opcional ausente da cadena vacía', () => {
    const r = columnasDe(p(['Designación', 'Coeficiente'], [['1A', '5']]), esquema)
    if (r.ok) expect(r.valor.valor(r.valor.filas[0]!, 'nota')).toBe('')
  })
  test('encabezado desconocido es error con su nombre', () => {
    const r = columnasDe(p(['Designación', 'Coefciente'], [['1A', '5']]), esquema)
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errores).toContainEqual({
        fila: 1,
        mensaje: 'La columna «Coefciente» no es de la plantilla.',
      })
  })
  test('falta obligatoria', () => {
    const r = columnasDe(p(['Designación'], [['1A']]), esquema)
    if (!r.ok)
      expect(r.errores).toContainEqual({ fila: 1, mensaje: 'Falta la columna «Coeficiente».' })
    else throw new Error('debía fallar')
  })
  test('columna repetida es error', () => {
    const r = columnasDe(
      p(['Designación', 'Coeficiente', 'coeficiente'], [['1A', '5', '6']]),
      esquema,
    )
    expect(r.ok).toBe(false)
  })
  test('filas vacías y de ejemplo se ignoran', () => {
    const r = columnasDe(
      p(
        ['Designación', 'Coeficiente'],
        [
          ['Ejemplo 1', '5'],
          ['', ' '],
          ['2B', '3'],
        ],
      ),
      esquema,
    )
    expect(r.ok && r.valor.filas.map((f) => f.numero)).toEqual([4])
    expect(esFilaDeEjemplo({ numero: 2, celdas: [' EJEMPLO: 1A'] })).toBe(true)
  })
  test('más de 2000 filas es error de archivo', () => {
    const filas = Array.from({ length: 2001 }, () => ['1A', '5'])
    const r = columnasDe(p(['Designación', 'Coeficiente'], filas), esquema)
    if (!r.ok)
      expect(r.errores).toContainEqual({
        fila: null,
        mensaje: 'El archivo tiene más de 2000 filas.',
      })
    else throw new Error('debía fallar')
  })
  test('sin filas de datos es error', () => {
    const r = columnasDe(p(['Designación', 'Coeficiente'], []), esquema)
    if (!r.ok)
      expect(r.errores).toContainEqual({
        fila: null,
        mensaje: 'El archivo no tiene filas para cargar.',
      })
    else throw new Error('debía fallar')
  })
})
