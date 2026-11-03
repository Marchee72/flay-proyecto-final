import { describe, expect, it } from 'vitest'

import { enlaceGoogleCalendar, textoIcs, type EventoAsamblea } from '@/dominio/asambleas/calendario'

/** Calendario de la asamblea (FR-007, research R-08): texto puro, sin dependencia. */

const evento: EventoAsamblea = {
  id: '6f1c2a4e-0000-4000-8000-000000000001',
  titulo: 'Asamblea ordinaria, Edificio Sol',
  // 20 de noviembre de 2026, 19:00 en Argentina (UTC-3) = 22:00 UTC.
  inicio: new Date('2026-11-20T22:00:00Z'),
  lugar: 'Hall de entrada; planta baja',
  descripcion: 'Orden del día:\n1. Presupuesto, pintura\n2. Varios',
  enlace: 'https://flay.example/consorcios/c/asambleas/a',
}

describe('enlace de Google Calendar', () => {
  it('lleva las fechas en UTC con dos horas de duración', () => {
    const url = new URL(enlaceGoogleCalendar(evento))
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('dates')).toBe('20261120T220000Z/20261121T000000Z')
  })

  it('codifica título, lugar y detalle, con el enlace a Flay en el detalle', () => {
    const url = new URL(enlaceGoogleCalendar(evento))
    expect(url.searchParams.get('text')).toBe(evento.titulo)
    expect(url.searchParams.get('location')).toBe(evento.lugar)
    expect(url.searchParams.get('details')).toContain('1. Presupuesto, pintura')
    expect(url.searchParams.get('details')).toContain(evento.enlace)
  })

  it('respeta un fin explícito', () => {
    const url = new URL(enlaceGoogleCalendar({ ...evento, fin: new Date('2026-11-20T23:30:00Z') }))
    expect(url.searchParams.get('dates')).toBe('20261120T220000Z/20261120T233000Z')
  })
})

describe('texto .ics', () => {
  const generado = new Date('2026-11-03T12:00:00Z')
  const ics = textoIcs(evento, generado)

  it('usa CRLF y cierra con CRLF', () => {
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
  })

  it('declara un VEVENT con UID estable y fechas en UTC', () => {
    const lineas = ics.split('\r\n')
    expect(lineas[0]).toBe('BEGIN:VCALENDAR')
    expect(lineas).toContain('BEGIN:VEVENT')
    expect(lineas).toContain(`UID:${evento.id}@flay`)
    expect(lineas).toContain('DTSTAMP:20261103T120000Z')
    expect(lineas).toContain('DTSTART:20261120T220000Z')
    expect(lineas).toContain('DTEND:20261121T000000Z')
    expect(lineas).toContain('END:VCALENDAR')
    expect(textoIcs(evento, generado)).toBe(ics)
  })

  it('escapa comas, punto y coma y saltos de línea', () => {
    const desplegado = ics.replace(/\r\n /g, '')
    expect(desplegado).toContain('LOCATION:Hall de entrada\\; planta baja')
    expect(desplegado).toContain('SUMMARY:Asamblea ordinaria\\, Edificio Sol')
    expect(desplegado).toContain(
      'DESCRIPTION:Orden del día:\\n1. Presupuesto\\, pintura\\n2. Varios',
    )
  })

  it('pliega las líneas largas a 75 octetos', () => {
    const largo = textoIcs({ ...evento, descripcion: 'á'.repeat(200) }, generado)
    for (const linea of largo.split('\r\n')) {
      expect(new TextEncoder().encode(linea).length).toBeLessThanOrEqual(75)
    }
    expect(largo.replace(/\r\n /g, '')).toContain('DESCRIPTION:' + 'á'.repeat(200))
  })
})
