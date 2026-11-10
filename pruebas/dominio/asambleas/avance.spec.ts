import { describe, expect, it } from 'vitest'

import { textoAvance } from '@/compartido/avance-asamblea'

const ESTADOS = { c: 'cerrado', a: 'abierto', p: 'pendiente' } as const

const puntos = (estados: string) =>
  [...estados].map((c) => ({ estado: ESTADOS[c as keyof typeof ESTADOS] }))

describe('textoAvance (RF-31)', () => {
  it.each([
    ['ccapp', 'punto 3 de 5, faltan 2'],
    ['cap', 'punto 2 de 3, falta 1'],
    ['cca', 'punto 3 de 3, es el último'],
    ['cccpp', '3 de 5 tratados, faltan 2'],
    ['ccccp', '4 de 5 tratados, falta 1'],
    ['pp', '0 de 2 tratados, faltan 2'],
    ['cc', '2 de 2 tratados'],
  ])('%s → %s', (estados, texto) => {
    expect(textoAvance(puntos(estados))).toBe(texto)
  })
})
