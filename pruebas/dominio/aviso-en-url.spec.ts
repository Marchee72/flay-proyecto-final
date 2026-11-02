import { describe, expect, it } from 'vitest'

import { conError, conHecho, HECHO } from '@/app/aviso-en-url'

describe('aviso en la URL (RNF-10)', () => {
  it('agrega la clave y un valor único', () => {
    expect(conHecho('/consorcios/x/periodos', 'anulado')).toMatch(
      /^\/consorcios\/x\/periodos\?hecho=anulado&aviso=[0-9a-z]+$/,
    )
  })
  it('respeta la búsqueda que ya trae', () => {
    expect(conHecho('/x?unidad=u', 'pago-registrado')).toMatch(
      /^\/x\?unidad=u&hecho=pago-registrado&aviso=/,
    )
  })
  it('dos llamadas iguales no dan la misma dirección', () => {
    expect(conHecho('/x', 'anulado')).not.toBe(conHecho('/x', 'anulado'))
  })
  it('el error va codificado', () => {
    expect(conError('/x', 'No se pudo: 50 %')).toMatch(
      /^\/x\?error=No\+se\+pudo%3A\+50\+%25&aviso=/,
    )
  })
  it('toda clave tiene texto', () => {
    for (const texto of Object.values(HECHO)) expect(texto.length).toBeGreaterThan(0)
  })
})
