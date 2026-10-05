import { describe, expect, it } from 'vitest'

import type { TramoDeshabilitado } from '@/aplicacion/reservas/espacios'
import type { ReservaDelHistorial } from '@/aplicacion/reservas/reservar'
import {
  construirCalendario,
  diaEnAr,
} from '@/app/(panel)/consorcios/[consorcio]/reservas/historial/calendario'

/**
 * La grilla del calendario de uso (RF-15) es logica pura de fechas: se prueba
 * sin base. Todo en hora del consorcio (Argentina, UTC-3).
 */

const reserva = (id: string, desdeIso: string): ReservaDelHistorial =>
  ({
    id,
    espacioId: 'e1',
    espacio: 'SUM',
    unidad: '3A',
    desde: desdeIso,
    hasta: desdeIso,
    cantidadPersonas: null,
    estado: 'confirmada',
    motivoRechazo: null,
    propia: false,
    solicitante: 'Beto',
    cumplida: true,
  }) as ReservaDelHistorial

const tramo = (
  desde: string,
  hasta: string | null,
  motivo: string,
  espacio = 'SUM',
): TramoDeshabilitado => ({
  id: 's1',
  espacioId: 'e1',
  espacio,
  desde,
  hasta,
  motivo,
})

describe('construirCalendario', () => {
  const cal = construirCalendario(
    '2026-09',
    [reserva('r1', '2026-09-15T23:00:00.000Z')], // 20:00 AR del 15
    [tramo('2026-09-10T03:00:00.000Z', '2026-09-12T03:00:00.000Z', 'Reforma')], // 10 y 11
    '2026-09-15T12:00:00.000Z',
  )
  const dias = cal.semanas.flat().filter((d) => d.fecha !== null)
  const dia = (fecha: string) => dias.find((d) => d.fecha === fecha)!

  it('septiembre tiene 30 dias y semanas completas de 7', () => {
    expect(dias).toHaveLength(30)
    for (const semana of cal.semanas) expect(semana).toHaveLength(7)
  })

  it('ubica la reserva en su dia, en hora del consorcio', () => {
    expect(dia('2026-09-15').reservas).toHaveLength(1)
    expect(dia('2026-09-15').reservas[0]).toMatchObject({ hora: '20:00', unidad: '3A' })
    expect(dia('2026-09-14').reservas).toHaveLength(0)
  })

  it('marca el espacio deshabilitado en los dias del tramo, y no afuera', () => {
    expect(dia('2026-09-11').deshabilitados).toEqual(['SUM'])
    expect(dia('2026-09-12').deshabilitados).toHaveLength(0)
    expect(dia('2026-09-20').deshabilitados).toHaveLength(0)
  })

  it('marca hoy', () => {
    expect(dia('2026-09-15').hoy).toBe(true)
    expect(dia('2026-09-16').hoy).toBe(false)
  })
})

describe('construirCalendario con dos espacios deshabilitados el mismo dia', () => {
  // Solo los espacios suspendidos ese dia aparecen, uno por espacio; el dia no se marca entero.
  const cal = construirCalendario(
    '2026-09',
    [],
    [
      tramo('2026-09-10T03:00:00.000Z', '2026-09-12T03:00:00.000Z', 'Reforma', 'SUM'),
      tramo('2026-09-10T03:00:00.000Z', '2026-09-11T03:00:00.000Z', 'Pintura', 'Quincho'),
    ],
    '2026-09-15T12:00:00.000Z',
  )
  const dia = (fecha: string) => cal.semanas.flat().find((d) => d.fecha === fecha)!

  it('el 10 lista los dos espacios; el 11 solo el que sigue en tramo', () => {
    expect(dia('2026-09-10').deshabilitados).toEqual(['SUM', 'Quincho'])
    expect(dia('2026-09-11').deshabilitados).toEqual(['SUM'])
  })
})

describe('diaEnAr', () => {
  it('un instante UTC de la madrugada cae el dia anterior en Argentina', () => {
    expect(diaEnAr('2026-09-16T02:00:00.000Z')).toBe('2026-09-15')
  })
})
