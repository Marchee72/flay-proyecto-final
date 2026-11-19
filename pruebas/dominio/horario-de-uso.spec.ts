import { describe, expect, it } from 'vitest'

import {
  dentroDelHorario,
  errorDeHorario,
  horaDesdeMinutos,
  horarioParaMostrar,
  minutosDesdeHora,
} from '@/dominio/reservas/horario'

const AR = (iso: string) => new Date(`${iso}-03:00`)
const SUM = { apertura: 600, cierre: 1380 } // 10:00–23:00
const NOCHE = { apertura: 1200, cierre: 120 } // 20:00–02:00

describe('horario de uso', () => {
  it('sin horario, todo vale', () =>
    expect(dentroDelHorario(AR('2026-12-05T03:00'), AR('2026-12-05T04:00'), null)).toBe(true))
  it('justo de apertura a cierre vale', () =>
    expect(dentroDelHorario(AR('2026-12-05T10:00'), AR('2026-12-05T23:00'), SUM)).toBe(true))
  it('un minuto antes de abrir no vale', () =>
    expect(dentroDelHorario(AR('2026-12-05T09:59'), AR('2026-12-05T12:00'), SUM)).toBe(false))
  it('pasarse del cierre no vale', () =>
    expect(dentroDelHorario(AR('2026-12-05T22:00'), AR('2026-12-05T23:01'), SUM)).toBe(false))
  it('cruzando la medianoche vale', () =>
    expect(dentroDelHorario(AR('2026-12-05T21:00'), AR('2026-12-06T01:30'), NOCHE)).toBe(true))
  it('la madrugada cae en la ventana del día anterior', () =>
    expect(dentroDelHorario(AR('2026-12-06T00:30'), AR('2026-12-06T01:30'), NOCHE)).toBe(true))
  it('en el hueco de la ventana nocturna no vale', () =>
    expect(dentroDelHorario(AR('2026-12-06T03:00'), AR('2026-12-06T04:00'), NOCHE)).toBe(false))
  it('a las 21 h argentinas (00 h UTC) se mide en hora argentina', () =>
    expect(dentroDelHorario(AR('2026-12-05T21:00'), AR('2026-12-05T22:30'), SUM)).toBe(true))
  it('errorDeHorario', () => {
    expect(errorDeHorario('', '')).toBeNull()
    expect(errorDeHorario('10:00', '')).toBe(
      'Completá la apertura y el cierre, o dejá los dos vacíos.',
    )
    expect(errorDeHorario('10:00', '10:00')).toBe(
      'La apertura y el cierre no pueden ser la misma hora.',
    )
    expect(errorDeHorario('25:00', '23:00')).toBe('Usá horas del día, de 00:00 a 23:59.')
  })
  it('minutos y horas ida y vuelta', () => {
    expect(minutosDesdeHora('02:00')).toBe(120)
    expect(minutosDesdeHora('2pm')).toBeNull()
    expect(horaDesdeMinutos(1380)).toBe('23:00')
    expect(horarioParaMostrar(NOCHE)).toBe('de 20:00 a 02:00')
  })
})
