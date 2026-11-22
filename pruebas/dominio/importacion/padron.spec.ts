import { describe, expect, test } from 'vitest'

import { validarPadron } from '@/dominio/importacion/padron'
import type { PlanillaLeida } from '@/dominio/importacion/planilla'

const ENC = ['Designación', 'Tipo', 'Coeficiente', 'Nombre', 'Apellido', 'DNI', 'Correo']
const planilla = (...filas: string[][]): PlanillaLeida => ({
  encabezados: ENC,
  filas: filas.map((celdas, i) => ({ numero: i + 2, celdas })),
})
const ctx = { unidadesExistentes: 0, archivado: false, personasConocidas: [] }
const errs = (r: ReturnType<typeof validarPadron>) => (r.ok ? [] : r.errores)

describe('validarPadron', () => {
  test('padrón válido de 3 unidades con suma 100 y un dueño', () => {
    const r = validarPadron(
      planilla(
        ['1A', '', '40', 'Ana', 'Gómez', '', 'ana@x.com'],
        ['1B', 'cochera', '35,5', '', '', '', ''],
        ['1C', 'Local', '24.5', '', '', '', ''],
      ),
      ctx,
    )
    if (!r.ok) throw new Error(JSON.stringify(r.errores))
    expect(r.valor.resumen).toEqual({
      unidades: 3,
      suma: '100.00000000',
      duenos: 1,
      sinIdentificar: 0,
    })
    expect(r.valor.unidades.map((u) => u.tipo)).toEqual(['departamento', 'cochera', 'local'])
    expect(r.valor.duenoPorFila.get(2)).toEqual({ nueva: 0 })
  })

  test('consorcio con unidades', () => {
    const r = validarPadron(planilla(['1A', '', '100', '', '', '', '']), {
      ...ctx,
      unidadesExistentes: 2,
    })
    expect(errs(r)).toEqual([
      {
        fila: null,
        mensaje:
          'Este consorcio ya tiene unidades cargadas. Para cambiar alguna, usá «Editar padrón».',
      },
    ])
  })

  test('consorcio archivado es error de archivo', () => {
    const r = validarPadron(planilla(['1A', '', '100', '', '', '', '']), {
      ...ctx,
      archivado: true,
    })
    expect(errs(r)[0]!.fila).toBeNull()
  })

  test('designación repetida ignorando mayúsculas y espacios', () => {
    const r = validarPadron(
      planilla(['1A', '', '50', '', '', '', ''], [' 1 a', '', '50', '', '', '', '']),
      ctx,
    )
    expect(errs(r).map((e) => e.fila)).toEqual([3])
  })

  test('tipo fuera del vocabulario', () => {
    const r = validarPadron(
      planilla(['1A', '', '50', '', '', '', ''], ['1B', 'depto', '50', '', '', '', '']),
      ctx,
    )
    expect(errs(r)).toContainEqual({
      fila: 3,
      columna: 'Tipo',
      mensaje: 'el tipo «depto» no existe. Usá departamento, cochera, local o baulera.',
    })
  })

  test('tipo vacío → departamento', () => {
    const r = validarPadron(planilla(['1A', '', '100', '', '', '', '']), ctx)
    if (!r.ok) throw new Error('debía ser válido')
    expect(r.valor.unidades[0]!.tipo).toBe('departamento')
  })

  test('suma que no cierra dice cuánto falta', () => {
    const r = validarPadron(
      planilla(['1A', '', '60', '', '', '', ''], ['1B', '', '39.98', '', '', '', '']),
      ctx,
    )
    expect(errs(r)).toEqual([
      { fila: null, mensaje: 'La suma da 99.98000000 %: faltan 0.02000000 % para llegar a 100.' },
    ])
  })

  test('junta todos los errores, no corta en el primero', () => {
    const r = validarPadron(
      planilla(
        ['', '', '50', '', '', '', ''],
        ['1B', 'depto', 'x', '', '', '', ''],
        ['1C', '', '10', 'Ana', '', '', ''],
      ),
      ctx,
    )
    const e = errs(r)
    expect(e.map((x) => x.fila)).toEqual([2, 3, 3, 4])
    // con un coeficiente inválido no se calcula la suma
    expect(e.some((x) => x.fila === null)).toBe(false)
  })
})
