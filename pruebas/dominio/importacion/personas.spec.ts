import { describe, expect, test } from 'vitest'

import {
  identificadoresDePersonas,
  resolverPersonas,
  type PersonaConocida,
  type PersonaDelArchivo,
} from '@/dominio/importacion/personas'

const p = (o: Partial<PersonaDelArchivo> = {}): PersonaDelArchivo => ({
  nombre: 'Ana',
  apellido: 'Gómez',
  dni: null,
  correo: null,
  telefono: null,
  ...o,
})
const filas = (...ps: PersonaDelArchivo[]) => ps.map((persona, i) => ({ fila: i + 2, persona }))
const errores = (r: ReturnType<typeof resolverPersonas>) => (r.ok ? [] : r.errores)

describe('resolverPersonas', () => {
  test('una persona con datos parciales exige nombre y apellido', () => {
    const r = resolverPersonas([{ fila: 3, persona: p({ nombre: '', correo: 'a@b.com' }) }], [])
    expect(errores(r)).toContainEqual({
      fila: 3,
      columna: 'Nombre',
      mensaje: 'falta el nombre.',
    })
  })

  test('correo inválido usa el mensaje de errorDeCorreo', () => {
    const r = resolverPersonas(filas(p({ correo: 'sin-arroba' })), [])
    expect(errores(r)[0]).toMatchObject({
      fila: 2,
      columna: 'Correo',
      mensaje: expect.stringContaining('no tiene un formato válido'),
    })
  })

  test('mismo correo en dos filas = misma persona (una sola nueva)', () => {
    const r = resolverPersonas(
      filas(p({ correo: 'a@b.com' }), p({ correo: ' A@B.com ', telefono: '1' })),
      [],
    )
    if (!r.ok) throw new Error('debía ser válido')
    expect(r.valor.nuevas).toHaveLength(1)
    expect(r.valor.porFila.get(2)).toEqual({ nueva: 0 })
    expect(r.valor.porFila.get(3)).toEqual({ nueva: 0 })
  })

  test('mismo DNI con otro nombre en el archivo es error en la segunda fila', () => {
    const r = resolverPersonas(
      filas(p({ dni: '20111222' }), p({ dni: '20111222', nombre: 'Luis' })),
      [],
    )
    expect(errores(r)).toHaveLength(1)
    expect(errores(r)[0]!.fila).toBe(3)
  })

  test('correo de una y DNI de otra es error', () => {
    const r = resolverPersonas(
      filas(
        p({ correo: 'a@b.com' }),
        p({ nombre: 'Luis', dni: '20111222' }),
        p({ nombre: 'Zoe', correo: 'a@b.com', dni: '20111222' }),
      ),
      [],
    )
    expect(errores(r).map((e) => e.fila)).toEqual([4])
  })

  test('conocida por DNI con mismo nombre normalizado se reutiliza', () => {
    const conocida: PersonaConocida = {
      id: 'P1',
      nombre: 'José',
      apellido: 'Pérez',
      dni: '20111222',
      correo: null,
    }
    const r = resolverPersonas(
      filas(p({ nombre: 'jose', apellido: '  PEREZ ', dni: '20111222' })),
      [conocida],
    )
    if (!r.ok) throw new Error('debía ser válido')
    expect(r.valor.nuevas).toHaveLength(0)
    expect(r.valor.porFila.get(2)).toEqual({ existente: 'P1' })
  })

  test('conocida por DNI con otro nombre es error y no revela el nombre guardado', () => {
    const conocida: PersonaConocida = {
      id: 'P1',
      nombre: 'Secreto',
      apellido: 'Oculto',
      dni: '20111222',
      correo: null,
    }
    const r = resolverPersonas(filas(p({ dni: '20111222' })), [conocida])
    const m = errores(r)[0]!.mensaje
    expect(m).toBe('El DNI ya está registrado a nombre de otra persona; revisalo.')
    expect(m).not.toMatch(/Secreto|Oculto/)
  })

  test('conocida por correo con otro nombre: «El correo ya está registrado a nombre de otra persona; revisalo.»', () => {
    const conocida: PersonaConocida = {
      id: 'P1',
      nombre: 'Otro',
      apellido: 'Nombre',
      dni: null,
      correo: 'a@b.com',
    }
    const r = resolverPersonas(filas(p({ correo: 'A@b.com' })), [conocida])
    expect(errores(r)[0]!.mensaje).toBe(
      'El correo ya está registrado a nombre de otra persona; revisalo.',
    )
  })

  describe('correo y DNI que no son de la misma persona', () => {
    const MSG = 'El DNI y el correo de esta fila no corresponden a la misma persona; revisalos.'
    const conocida: PersonaConocida = {
      id: 'P1',
      nombre: 'Ana',
      apellido: 'Gómez',
      dni: '11111111',
      correo: 'a@b.com',
    }
    test('A: conocida por correo con otro DNI', () => {
      const r = resolverPersonas(filas(p({ correo: 'a@b.com', dni: '22222222' })), [conocida])
      expect(errores(r)).toEqual([{ fila: 2, columna: 'DNI', mensaje: MSG }])
      expect(MSG).not.toContain('11111111')
    })
    test('B: dos filas con el mismo correo y distinto DNI', () => {
      const r = resolverPersonas(
        filas(p({ correo: 'a@b.com', dni: '11111111' }), p({ correo: 'a@b.com', dni: '22222222' })),
        [],
      )
      expect(errores(r)).toEqual([{ fila: 3, columna: 'DNI', mensaje: MSG }])
    })
    test('C: conocida por DNI con otro correo', () => {
      const r = resolverPersonas(filas(p({ correo: 'z@b.com', dni: '11111111' })), [conocida])
      expect(errores(r)).toEqual([{ fila: 2, columna: 'DNI', mensaje: MSG }])
    })
  })

  test('sin correo ni DNI: nueva cada vez y cuenta en sinIdentificar', () => {
    const r = resolverPersonas(filas(p(), p()), [])
    if (!r.ok) throw new Error('debía ser válido')
    expect(r.valor.nuevas).toHaveLength(2)
    expect(r.valor.sinIdentificar).toBe(2)
  })
})

describe('identificadoresDePersonas', () => {
  test('junta correos en minúsculas y DNI normalizados, sin repetir', () => {
    const planilla = {
      encabezados: ['Designación', 'Correo', 'DNI'],
      filas: [
        { numero: 2, celdas: ['1A', ' A@B.com ', '20.111.222'] },
        { numero: 3, celdas: ['1B', 'a@b.com', 'x'] },
      ],
    }
    expect(identificadoresDePersonas(planilla)).toEqual({
      correos: ['a@b.com'],
      dnis: ['20111222'],
    })
  })
})
