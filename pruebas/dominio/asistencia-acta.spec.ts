import { describe, expect, it } from 'vitest'

import { SISTEMA_ACTA } from '@/infraestructura/prompts-acta'

describe('prompt del redactor del acta', () => {
  it('pide ortografía, omite el cero y despersonaliza', () => {
    expect(SISTEMA_ACTA).toMatch(/orden del día/)
    expect(SISTEMA_ACTA).toMatch(/tildes/)
    expect(SISTEMA_ACTA).toMatch(/noVotaron[\s\S]*0[\s\S]*no lo menciones/)
    expect(SISTEMA_ACTA).toMatch(/nombres propios/)
  })
})
