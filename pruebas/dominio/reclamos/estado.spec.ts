import { describe, expect, it } from 'vitest'

import {
  ESTADOS_RECLAMO,
  exigirTransicion,
  requiereResponsable,
  TransicionDeReclamoInvalida,
  TRANSICIONES,
  transicionValida,
} from '@/dominio/reclamos/estado'

/**
 * La maquina de estados del reclamo (`004-servicios` research R-09, regla
 * RN-11 § 7.2), sin base de datos. Se escribe antes que la implementacion,
 * como `periodos/estado.ts` en 002.
 */

describe('estado del reclamo', () => {
  it('declara los seis estados del punto 7', () => {
    expect([...ESTADOS_RECLAMO]).toEqual([
      'abierto',
      'asignado',
      'en_curso',
      'resuelto',
      'cerrado',
      'rechazado',
    ])
  })

  it('recorre el camino feliz de punta a punta', () => {
    const camino = ['abierto', 'asignado', 'en_curso', 'resuelto', 'cerrado'] as const
    for (let i = 0; i < camino.length - 1; i++) {
      expect(transicionValida(camino[i], camino[i + 1])).toBe(true)
    }
  })

  it('rechazado es final: no tiene salida', () => {
    expect(TRANSICIONES.rechazado).toEqual([])
    for (const estado of ESTADOS_RECLAMO) {
      expect(transicionValida('rechazado', estado)).toBe(false)
    }
  })

  it('se puede rechazar solo desde abierto o asignado', () => {
    expect(transicionValida('abierto', 'rechazado')).toBe(true)
    expect(transicionValida('asignado', 'rechazado')).toBe(true)
    expect(transicionValida('en_curso', 'rechazado')).toBe(false)
    expect(transicionValida('resuelto', 'rechazado')).toBe(false)
  })

  it('cerrado vuelve a abierto: es la reapertura, y deja asiento como cualquier otra', () => {
    expect(transicionValida('cerrado', 'abierto')).toBe(true)
    expect(transicionValida('cerrado', 'en_curso')).toBe(false)
  })

  it('un reclamo resuelto puede volver a en curso si no quedo resuelto de verdad', () => {
    expect(transicionValida('resuelto', 'en_curso')).toBe(true)
    expect(transicionValida('resuelto', 'abierto')).toBe(false)
  })

  it('quitar el responsable de un asignado lo devuelve a abierto', () => {
    expect(transicionValida('asignado', 'abierto')).toBe(true)
  })

  it('no se salta pasos: de abierto no se va a en curso ni a resuelto', () => {
    expect(transicionValida('abierto', 'en_curso')).toBe(false)
    expect(transicionValida('abierto', 'resuelto')).toBe(false)
    expect(transicionValida('abierto', 'cerrado')).toBe(false)
  })

  it('todo estado distinto del inicial exige responsable (regla RN-11)', () => {
    expect(requiereResponsable('abierto')).toBe(false)
    for (const estado of ['asignado', 'en_curso', 'resuelto', 'cerrado', 'rechazado'] as const) {
      expect(requiereResponsable(estado)).toBe(true)
    }
  })

  it('exigirTransicion lanza con un mensaje que nombra los dos estados', () => {
    expect(() => exigirTransicion('abierto', 'cerrado')).toThrow(TransicionDeReclamoInvalida)
    expect(() => exigirTransicion('abierto', 'cerrado')).toThrow(/abierto.*cerrado/)
    expect(() => exigirTransicion('abierto', 'asignado')).not.toThrow()
  })
})
