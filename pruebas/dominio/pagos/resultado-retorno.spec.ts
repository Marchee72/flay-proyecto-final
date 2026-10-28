import { describe, expect, it } from 'vitest'

import { resultadoDeRetorno } from '@/aplicacion/pagos/resultado-retorno'

/**
 * La URL de retorno la controla el cliente: un `status=approved` no prueba que
 * el pago se haya imputado. Solo un rechazo explicito se puede creer.
 */
describe('resultadoDeRetorno', () => {
  it('no da por aprobado un pago solo porque la URL lo diga', () => {
    expect(resultadoDeRetorno({ collection_status: 'approved', status: 'approved' })).toBe(
      'pendiente',
    )
  })

  it('respeta un rechazo informado por la pasarela', () => {
    expect(resultadoDeRetorno({ collection_status: 'rejected' })).toBe('rechazado')
    expect(resultadoDeRetorno({ status: 'rejected' })).toBe('rechazado')
  })

  it('sin estado en la URL queda pendiente de verificar', () => {
    expect(resultadoDeRetorno({})).toBe('pendiente')
  })
})
