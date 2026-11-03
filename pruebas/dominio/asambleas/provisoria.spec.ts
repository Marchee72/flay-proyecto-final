import { describe, expect, it } from 'vitest'

import { Decimal } from '@/compartido/dinero'
import { estadoDecision } from '@/dominio/asambleas/provisoria'
import type { UnidadPadron, Voto } from '@/dominio/asambleas/resultado'

/**
 * Decisión provisoria del CCyC art. 2060 (FR-027 a FR-029, research R-06). El
 * silencio del ausente es conformidad; cae si las oposiciones impiden la
 * mayoría sobre el total.
 */

const u = (unidadId: string, coef: string, presente = true): UnidadPadron => ({
  unidadId,
  coeficiente: new Decimal(coef),
  presente,
  sinVoto: false,
})

// Presentes A, B y C; ausentes D (10) y E (15). Total 100.
const padron = [u('A', '30'), u('B', '25'), u('C', '20'), u('D', '10', false), u('E', '15', false)]
// Sobre presentes: 2 de 3 unidades y 55 de 75 → aprobado. Sobre el total: 2 de 5 → no.
const votos: Voto[] = [
  { unidadId: 'A', sentido: 'positivo' },
  { unidadId: 'B', sentido: 'positivo' },
  { unidadId: 'C', sentido: 'negativo' },
]
const vence = new Date('2026-12-05T22:00:00Z')
const antes = new Date('2026-12-01T12:00:00Z')
const despues = new Date('2026-12-06T00:00:00Z')

const base = { provisorio: true, vence, padron, votos, mayoria: 'absoluta' as const }

describe('estadoDecision', () => {
  it('una decisión no provisoria es firme', () => {
    expect(estadoDecision({ ...base, provisorio: false, ahora: antes, oposiciones: [] })).toBe(
      'firme',
    )
  })

  it('antes del vencimiento sigue provisoria, aunque haya oposiciones', () => {
    expect(estadoDecision({ ...base, ahora: antes, oposiciones: ['D', 'E'] })).toBe('provisoria')
  })

  it('el día del vencimiento todavía es provisoria', () => {
    expect(estadoDecision({ ...base, ahora: vence, oposiciones: [] })).toBe('provisoria')
  })

  it('al vencer sin oposiciones queda firme: los ausentes suman como conformes', () => {
    // 4 de 5 unidades y 80 de 100.
    expect(estadoDecision({ ...base, ahora: despues, oposiciones: [] })).toBe('firme')
  })

  it('al vencer con una oposición que no alcanza para impedirla, queda firme', () => {
    // Se opone D: 3 de 5 unidades y 70 de 100 → sigue la mayoría.
    expect(estadoDecision({ ...base, ahora: despues, oposiciones: ['D'] })).toBe('firme')
  })

  it('al vencer con oposiciones que impiden la mayoría en unidades, cae', () => {
    // Se oponen D y E: 2 de 5 unidades.
    expect(estadoDecision({ ...base, ahora: despues, oposiciones: ['D', 'E'] })).toBe('caida')
  })

  it('cae también si lo que se pierde es la mayoría de coeficientes', () => {
    // A 45 (presente, positivo), B 5 (presente, negativo), C 5, D 5 y E 40 ausentes.
    const p = [
      u('A', '45'),
      u('B', '5'),
      u('C', '5', false),
      u('D', '5', false),
      u('E', '40', false),
    ]
    const vs: Voto[] = [
      { unidadId: 'A', sentido: 'positivo' },
      { unidadId: 'B', sentido: 'negativo' },
    ]
    // Se opone E: unidades A, C y D = 3 de 5 (alcanza); coeficientes 55 de 100 (alcanza)…
    expect(
      estadoDecision({ ...base, padron: p, votos: vs, ahora: despues, oposiciones: ['E'] }),
    ).toBe('firme')
    // …se oponen E y C: unidades 2 de 5 → cae.
    expect(
      estadoDecision({ ...base, padron: p, votos: vs, ahora: despues, oposiciones: ['E', 'C'] }),
    ).toBe('caida')
    // A 40 y B 10 presentes; C 5, D 5 y E 40 ausentes. Se opone solo E: las unidades
    // alcanzan (A, C y D = 3 de 5) pero los coeficientes no (40 + 5 + 5 = 50, no supera 50).
    const p2 = [
      u('A', '40'),
      u('B', '10'),
      u('C', '5', false),
      u('D', '5', false),
      u('E', '40', false),
    ]
    expect(
      estadoDecision({ ...base, padron: p2, votos: vs, ahora: despues, oposiciones: ['E'] }),
    ).toBe('caida')
    expect(
      estadoDecision({ ...base, padron: p2, votos: vs, ahora: despues, oposiciones: [] }),
    ).toBe('firme')
  })

  it('con dos tercios y unanimidad aplica el umbral del punto', () => {
    // Sin oposiciones: 4 de 5 y 80 de 100 → alcanza dos tercios, no unanimidad.
    expect(
      estadoDecision({ ...base, mayoria: 'dos_tercios', ahora: despues, oposiciones: [] }),
    ).toBe('firme')
    expect(
      estadoDecision({ ...base, mayoria: 'unanimidad', ahora: despues, oposiciones: [] }),
    ).toBe('caida')
  })
})
