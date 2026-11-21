import { describe, expect, it } from 'vitest'

import {
  errorDeFinDeAlquiler,
  finDelAcceso,
  hastaInclusivo,
  hastaSemiabierto,
  periodoVisible,
  visibleDesde,
} from '@/dominio/ocupaciones/vigencia'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('ocupaciones/vigencia (RN-23, RN-24)', () => {
  it('convierte hasta inclusivo y semiabierto', () => {
    expect(hastaSemiabierto(d('2027-02-28')).toISOString().slice(0, 10)).toBe('2027-03-01')
    expect(hastaInclusivo(d('2027-03-01')).toISOString().slice(0, 10)).toBe('2027-02-28')
  })

  it('el propietario ve todo; el inquilino desde el mes de ingreso', () => {
    expect(visibleDesde(['propietario'], [d('2026-03-15')])).toBeNull()
    expect(visibleDesde(['inquilino', 'propietario'], [d('2026-03-15'), d('2020-01-01')])).toBeNull()
    expect(visibleDesde(['inquilino'], [d('2026-03-15')])?.toISOString().slice(0, 10)).toBe(
      '2026-03-01',
    )
    expect(
      visibleDesde(['inquilino', 'inquilino'], [d('2026-05-10'), d('2026-03-20')])
        ?.toISOString()
        .slice(0, 10),
    ).toBe('2026-03-01')
  })

  it('periodoVisible corta por mes', () => {
    const desde = d('2026-03-01')
    expect(periodoVisible({ anio: 2026, mes: 2 }, desde)).toBe(false)
    expect(periodoVisible({ anio: 2026, mes: 3 }, desde)).toBe(true)
    expect(periodoVisible({ anio: 2025, mes: 12 }, desde)).toBe(false)
    expect(periodoVisible({ anio: 2027, mes: 1 }, desde)).toBe(true)
    expect(periodoVisible({ anio: 2000, mes: 1 }, null)).toBe(true)
  })

  it('finDelAcceso: abierto si alguna no tiene fin, si no el último', () => {
    expect(finDelAcceso([d('2026-05-31'), null])).toBeNull()
    expect(finDelAcceso([d('2026-05-31'), d('2026-08-31')])?.toISOString().slice(0, 10)).toBe(
      '2026-08-31',
    )
    expect(() => finDelAcceso([])).toThrow()
  })

  it('errorDeFinDeAlquiler', () => {
    expect(errorDeFinDeAlquiler('2026-03-01', '')).toBeNull()
    expect(errorDeFinDeAlquiler('2026-03-01', '2026-03-01')).toBeNull()
    expect(errorDeFinDeAlquiler('2026-03-01', '2026-02-28')).toBe(
      'La fecha de fin no puede ser anterior al ingreso, el 01/03/2026.',
    )
  })
})
