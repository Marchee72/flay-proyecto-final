import { describe, expect, it } from 'vitest'

import { estadoDeConciliacion, resultadoDeRetorno } from '@/aplicacion/pagos/resultado-retorno'

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

describe('estadoDeConciliacion', () => {
  const r = (estado: 'aprobado' | 'rechazado' | 'vencido' | 'esperando') => ({
    intentoId: 'i1',
    estado,
  })

  it('un aprobado se muestra siempre, se siga o no un intento', () => {
    expect(estadoDeConciliacion([r('aprobado')], true)).toBe('aprobado')
    expect(estadoDeConciliacion([r('aprobado')], false)).toBe('aprobado')
    expect(estadoDeConciliacion([r('esperando'), r('aprobado')], false)).toBe('aprobado')
  })

  it('siguiendo un intento, esperar es pendiente y rechazar es rechazado', () => {
    expect(estadoDeConciliacion([r('esperando')], true)).toBe('pendiente')
    expect(estadoDeConciliacion([r('rechazado')], true)).toBe('rechazado')
  })

  it('a una visita comun no se le muestran avisos de espera', () => {
    expect(estadoDeConciliacion([r('esperando')], false)).toBeNull()
    expect(estadoDeConciliacion([r('rechazado')], false)).toBeNull()
  })

  it('un intento vencido o ninguno no muestran nada', () => {
    expect(estadoDeConciliacion([r('vencido')], true)).toBeNull()
    expect(estadoDeConciliacion([], true)).toBeNull()
  })
})
