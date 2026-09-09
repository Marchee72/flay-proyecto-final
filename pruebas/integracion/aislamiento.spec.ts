import { describe, expect, it } from 'vitest'

import { aplicarAislamiento, consorcioActivo, enConsorcio } from '@/infraestructura/cliente-aislado'

// SC-013: el filtro por consorcio vive en un solo punto y falla sin contexto.
describe('aislamiento por consorcio', () => {
  it('falla si se consulta un modelo aislado sin consorcio activo', () => {
    expect(() => aplicarAislamiento('Gasto', 'findMany', {}, true)).toThrow(/sin consorcio activo/)
  })

  it('inyecta el filtro en las lecturas', async () => {
    await enConsorcio('c-1', async () => {
      expect(consorcioActivo()).toBe('c-1')
      expect(aplicarAislamiento('Gasto', 'findMany', { where: { pagado: true } }, true)).toEqual({
        where: { pagado: true, consorcioId: 'c-1' },
      })
    })
  })

  it('inyecta el consorcio en las altas, una y muchas', async () => {
    await enConsorcio('c-1', async () => {
      expect(aplicarAislamiento('Gasto', 'create', { data: { monto: '1' } }, true)).toEqual({
        data: { monto: '1', consorcioId: 'c-1' },
      })
      expect(
        aplicarAislamiento('Gasto', 'createMany', { data: [{ n: 1 }, { n: 2 }] }, true),
      ).toEqual({
        data: [
          { n: 1, consorcioId: 'c-1' },
          { n: 2, consorcioId: 'c-1' },
        ],
      })
    })
  })

  it('rechaza findUnique, donde el filtro no se puede inyectar', async () => {
    await enConsorcio('c-1', async () => {
      expect(() => aplicarAislamiento('Gasto', 'findUnique', { where: { id: 'x' } }, true)).toThrow(
        /Usar findFirst/,
      )
    })
  })

  it('no toca los modelos sin consorcioId', () => {
    expect(aplicarAislamiento('BitacoraAuditoria', 'findMany', {}, false)).toEqual({})
  })

  it('no deja crear un contexto vacio', () => {
    expect(() => enConsorcio('', async () => undefined)).toThrow(/no puede ser vacio/)
  })
})
