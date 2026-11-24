import { describe, expect, test } from 'vitest'

import { validarOcupantes, type OcupacionExistente } from '@/dominio/importacion/ocupantes'
import type { PlanillaLeida } from '@/dominio/importacion/planilla'

const ENC = [
  'Unidad',
  'Vínculo',
  'Nombre',
  'Apellido',
  'DNI',
  'Correo',
  'Teléfono',
  'Desde',
  'Hasta',
]
const planilla = (...filas: string[][]): PlanillaLeida => ({
  encabezados: ENC,
  filas: filas.map((celdas, i) => ({ numero: i + 2, celdas })),
})
/** Unidad, vínculo, nombre, apellido, DNI, desde, hasta. */
const fila = (u: string, v: string, n: string, a: string, dni = '', desde = '', hasta = '') => [
  u,
  v,
  n,
  a,
  dni,
  '',
  '',
  desde,
  hasta,
]
const UNIDADES = [
  { id: 'u1a', designacion: '1A' },
  { id: 'u1b', designacion: '1B' },
]
const ANA = { id: 'p-ana', nombre: 'Ana', apellido: 'Gómez', dni: '20111222', correo: null }
const ctx = {
  hoy: '2026-09-09',
  archivado: false,
  unidades: UNIDADES,
  ocupaciones: [] as OcupacionExistente[],
  personasConocidas: [ANA],
}
const errs = (r: ReturnType<typeof validarOcupantes>) => (r.ok ? [] : r.errores)
const valido = (r: ReturnType<typeof validarOcupantes>) => {
  if (!r.ok) throw new Error(JSON.stringify(r.errores))
  return r.valor
}

describe('validarOcupantes (RF-03)', () => {
  test('unidad por designación normalizada', () => {
    const v = valido(validarOcupantes(planilla(fila('1 a', 'Propietario', 'Luis', 'Paz')), ctx))
    expect(v.aCrear[0]).toMatchObject({
      fila: 2,
      unidadId: 'u1a',
      vinculo: 'propietario',
      desde: '2026-09-09',
      hasta: null,
    })
    expect(v.resumen).toEqual({ propietarios: 1, inquilinos: 0, yaEstaban: 0, sinIdentificar: 1 })
  })

  test('unidad inexistente o dada de baja', () => {
    const r = validarOcupantes(
      planilla(
        fila('1A', 'propietario', 'Luis', 'Paz'),
        fila('1B', 'propietario', 'Eva', 'Paz'),
        fila('1A', 'propietario', 'Ivo', 'Paz'),
        fila('9Z', 'propietario', 'Leo', 'Paz'),
      ),
      ctx,
    )
    expect(errs(r)).toEqual([
      { fila: 5, columna: 'Unidad', mensaje: 'no hay ninguna unidad «9Z» en este consorcio.' },
    ])
  })

  test('vínculo fuera del vocabulario', () => {
    const r = validarOcupantes(planilla(fila('1A', 'dueño', 'Luis', 'Paz')), ctx)
    expect(errs(r)).toEqual([
      {
        fila: 2,
        columna: 'Vínculo',
        mensaje: 'el vínculo «dueño» no existe. Usá propietario o inquilino.',
      },
    ])
  })

  test('desde vacío = hoy; hasta < desde es error', () => {
    const v = valido(
      validarOcupantes(planilla(fila('1A', 'inquilino', 'Luis', 'Paz', '', '', '31/12/2027')), ctx),
    )
    expect(v.aCrear[0]).toMatchObject({ desde: '2026-09-09', hasta: '2027-12-31' })

    const r = validarOcupantes(
      planilla(fila('1A', 'inquilino', 'Luis', 'Paz', '', '2026-10-01', '2026-09-30')),
      ctx,
    )
    expect(errs(r)).toEqual([
      {
        fila: 2,
        columna: 'Hasta',
        mensaje: 'La fecha de fin no puede ser anterior al ingreso, el 01/10/2026.',
      },
    ])
  })

  test('dos inquilinos superpuestos en el archivo: error en la segunda fila', () => {
    const r = validarOcupantes(
      planilla(
        fila('1A', 'inquilino', 'Luis', 'Paz', '', '2026-01-01', '2026-12-31'),
        fila('1A', 'inquilino', 'Eva', 'Ruiz', '', '2026-12-31'),
      ),
      ctx,
    )
    expect(errs(r)).toEqual([
      {
        fila: 3,
        columna: 'Desde',
        mensaje: 'la unidad ya tiene un inquilino en esas fechas (fila 2).',
      },
    ])
  })

  test('inquilino superpuesto con uno de la base: error', () => {
    const r = validarOcupantes(planilla(fila('1A', 'inquilino', 'Luis', 'Paz', '', '2026-06-01')), {
      ...ctx,
      ocupaciones: [
        {
          unidadId: 'u1a',
          personaId: 'otra',
          tipo: 'inquilino',
          desde: '2026-01-01',
          hasta: '2026-06-01',
        },
      ],
    })
    expect(errs(r)).toEqual([
      { fila: 2, columna: 'Desde', mensaje: 'la unidad ya tiene un inquilino en esas fechas.' },
    ])
  })

  test('dos propietarios en la misma unidad es válido', () => {
    const v = valido(
      validarOcupantes(
        planilla(fila('1A', 'propietario', 'Luis', 'Paz'), fila('1A', 'propietario', 'Eva', 'Paz')),
        {
          ...ctx,
          ocupaciones: [
            {
              unidadId: 'u1a',
              personaId: 'otra',
              tipo: 'propietario',
              desde: '2020-01-01',
              hasta: null,
            },
          ],
        },
      ),
    )
    expect(v.resumen.propietarios).toBe(2)
  })

  test('misma persona, unidad y vínculo solapado con uno existente → yaEstaban', () => {
    const v = valido(
      validarOcupantes(planilla(fila('1A', 'propietario', 'Ana', 'Gómez', '20.111.222')), {
        ...ctx,
        ocupaciones: [
          {
            unidadId: 'u1a',
            personaId: 'p-ana',
            tipo: 'propietario',
            desde: '2020-01-01',
            hasta: null,
          },
        ],
      }),
    )
    expect(v.aCrear).toEqual([])
    expect(v.yaEstaban).toEqual([2])
    expect(v.resumen).toEqual({ propietarios: 0, inquilinos: 0, yaEstaban: 1, sinIdentificar: 0 })
  })

  test('inquilino de la base que es la misma persona solapada → yaEstaban, no error RN-09', () => {
    const v = valido(
      validarOcupantes(
        planilla(fila('1A', 'inquilino', 'Ana', 'Gómez', '20111222', '2026-03-01', '2027-02-28')),
        {
          ...ctx,
          ocupaciones: [
            {
              unidadId: 'u1a',
              personaId: 'p-ana',
              tipo: 'inquilino',
              desde: '2026-03-01',
              hasta: '2027-02-28',
            },
          ],
        },
      ),
    )
    expect(v.yaEstaban).toEqual([2])
    expect(v.aCrear).toEqual([])
  })

  test('la misma fila dos veces en el archivo es error, no un segundo alta', () => {
    const r = validarOcupantes(
      planilla(
        fila('1A', 'propietario', 'Ana', 'Gómez', '20111222'),
        fila('1A', 'propietario', 'Ana', 'Gómez', '20111222'),
      ),
      ctx,
    )
    expect(errs(r)).toEqual([{ fila: 3, mensaje: 'esta fila repite la fila 2.' }])
  })

  test('nombre y apellido son obligatorios, con mensaje neutro', () => {
    const r = validarOcupantes(planilla(fila('1A', 'inquilino', '', 'Paz')), ctx)
    expect(errs(r)).toEqual([{ fila: 2, columna: 'Nombre', mensaje: 'falta el nombre.' }])
  })

  test('padrón vacío: «Primero cargá el padrón.»', () => {
    const r = validarOcupantes(planilla(fila('1A', 'propietario', 'Luis', 'Paz')), {
      ...ctx,
      unidades: [],
    })
    expect(errs(r)).toEqual([{ fila: null, mensaje: 'Primero cargá el padrón.' }])
  })

  test('consorcio archivado es error de archivo', () => {
    const r = validarOcupantes(planilla(fila('1A', 'propietario', 'Luis', 'Paz')), {
      ...ctx,
      archivado: true,
    })
    expect(errs(r)[0]!.fila).toBeNull()
  })
})
