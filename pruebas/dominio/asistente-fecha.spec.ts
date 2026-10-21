import { describe, expect, it } from 'vitest'

import { aFecha, ArgumentoInvalido } from '@/aplicacion/asistente/base'

/**
 * El asistente recibe fechas del modelo sin zona horaria. Una fecha-hora sin
 * designador de zona se interpreta como hora de Argentina (UTC-3), no la del
 * servidor; así la reserva del bot cae en el mismo horario que el formulario
 * manual (RF-27, RF-16).
 */
describe('aFecha (RF-27)', () => {
  it('toma la fecha-hora sin zona como hora de Argentina (UTC-3)', () => {
    // 15:00 en Argentina son las 18:00 UTC.
    expect(aFecha('2026-10-22T15:00').toISOString()).toBe('2026-10-22T18:00:00.000Z')
  })

  it('respeta un valor con segundos pero sin zona', () => {
    expect(aFecha('2026-10-22T15:00:30').toISOString()).toBe('2026-10-22T18:00:30.000Z')
  })

  it('deja intacto un valor con zona explícita (Z)', () => {
    expect(aFecha('2026-10-22T15:00:00Z').toISOString()).toBe('2026-10-22T15:00:00.000Z')
  })

  it('deja intacto un valor con offset explícito', () => {
    expect(aFecha('2026-10-22T15:00:00-05:00').toISOString()).toBe('2026-10-22T20:00:00.000Z')
  })

  it('sigue aceptando un valor de solo fecha sin romper', () => {
    expect(() => aFecha('2026-12-31')).not.toThrow()
  })

  it('rechaza una fecha inválida', () => {
    expect(() => aFecha('no es una fecha')).toThrow(ArgumentoInvalido)
  })
})
