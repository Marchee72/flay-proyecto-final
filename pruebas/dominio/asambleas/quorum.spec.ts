import { describe, expect, it } from 'vitest'

import { Decimal } from '@/compartido/dinero'
import { puedeConstituir, segundaConvocatoria } from '@/dominio/asambleas/quorum'

/** Quórum y convocatoria que rige (FR-017, art. 20 del reglamento, research R-11). */

const fechaHora = new Date('2026-11-20T22:00:00Z')
const total = new Decimal('100.00000000')
const minutos = (m: number) => new Date(fechaHora.getTime() + m * 60_000)

describe('segunda convocatoria', () => {
  it('es media hora después de la primera', () => {
    expect(segundaConvocatoria(fechaHora).toISOString()).toBe('2026-11-20T22:30:00.000Z')
  })
})

describe('puedeConstituir', () => {
  const base = { fechaHora, coeficienteTotal: total, presentesConVoto: 3 }

  it('no constituye antes de la hora', () => {
    expect(
      puedeConstituir({ ...base, ahora: minutos(-1), coeficientePresente: new Decimal('90') }),
    ).toEqual({ puede: false, motivo: 'antes_de_hora' })
  })

  it('en primera convocatoria exige más de la mitad: la mitad exacta no alcanza', () => {
    expect(
      puedeConstituir({
        ...base,
        ahora: minutos(5),
        coeficientePresente: new Decimal('50.00000000'),
      }),
    ).toEqual({ puede: false, motivo: 'sin_quorum' })
    expect(
      puedeConstituir({
        ...base,
        ahora: minutos(5),
        coeficientePresente: new Decimal('50.00000001'),
      }),
    ).toEqual({ puede: true, rige: 'primera' })
  })

  it('desde la segunda convocatoria constituye con los presentes', () => {
    expect(
      puedeConstituir({ ...base, ahora: minutos(30), coeficientePresente: new Decimal('4.5') }),
    ).toEqual({ puede: true, rige: 'segunda' })
  })

  it('con quórum de primera, aunque ya rija la hora de segunda, dice primera', () => {
    expect(
      puedeConstituir({ ...base, ahora: minutos(40), coeficientePresente: new Decimal('60') }),
    ).toEqual({ puede: true, rige: 'primera' })
  })

  it('ni en segunda constituye sin ninguna unidad presente con voto', () => {
    expect(
      puedeConstituir({
        ...base,
        ahora: minutos(45),
        coeficientePresente: new Decimal('10'),
        presentesConVoto: 0,
      }),
    ).toEqual({ puede: false, motivo: 'sin_quorum' })
  })
})
