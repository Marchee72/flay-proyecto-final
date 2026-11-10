import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { crearRefrescoAcotado } from '@/compartido/refresco-acotado'

describe('crearRefrescoAcotado', () => {
  const refrescar = vi.fn()
  let puede = true
  const acotado = () => crearRefrescoAcotado({ refrescar, puedeRefrescar: () => puede })

  beforeEach(() => {
    vi.useFakeTimers()
    refrescar.mockClear()
    puede = true
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('veinte avisos seguidos: un refresco ya y uno solo al terminar', () => {
    const r = acotado()
    for (let i = 0; i < 20; i++) r.avisar()
    expect(refrescar).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(500)
    r.terminado()
    expect(refrescar).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(500)
    r.terminado()
    vi.advanceTimersByTime(5000)
    expect(refrescar).toHaveBeenCalledTimes(2)
  })

  it('no repite antes de 500 ms aunque la relectura termine enseguida', () => {
    const r = acotado()
    r.avisar()
    r.avisar()
    r.terminado()
    vi.advanceTimersByTime(499)
    expect(refrescar).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(refrescar).toHaveBeenCalledTimes(2)
  })

  it('un refresco lento retiene el siguiente', () => {
    const r = acotado()
    r.avisar()
    r.avisar()
    vi.advanceTimersByTime(14_000)
    expect(refrescar).toHaveBeenCalledTimes(1)
  })

  it('un refresco colgado se libera recién a los 15 s', () => {
    const r = acotado()
    r.avisar()
    r.avisar()
    vi.advanceTimersByTime(14_999)
    expect(refrescar).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(refrescar).toHaveBeenCalledTimes(2)
  })

  it('el sondeo pasa por el mismo ciclo: con una relectura colgada no apila', () => {
    const r = acotado()
    r.sondear(4000)
    vi.advanceTimersByTime(4000)
    expect(refrescar).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(14_999)
    expect(refrescar).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(refrescar).toHaveBeenCalledTimes(2)
  })

  it('el sondeo se detiene', () => {
    const r = acotado()
    const parar = r.sondear(4000)
    vi.advanceTimersByTime(4000)
    r.terminado()
    vi.advanceTimersByTime(500)
    parar()
    vi.advanceTimersByTime(20_000)
    expect(refrescar).toHaveBeenCalledTimes(1)
  })

  it('con la pestaña oculta no refresca, y al volver lo hace una vez', () => {
    const r = acotado()
    puede = false
    r.avisar()
    r.avisar()
    r.avisar()
    expect(refrescar).not.toHaveBeenCalled()
    puede = true
    r.reanudar()
    r.reanudar()
    expect(refrescar).toHaveBeenCalledTimes(1)
  })

  it('un refresco pendiente espera si la pestaña se ocultó entretanto', () => {
    const r = acotado()
    r.avisar()
    r.avisar()
    puede = false
    r.terminado()
    vi.advanceTimersByTime(500)
    expect(refrescar).toHaveBeenCalledTimes(1)
    puede = true
    r.reanudar()
    expect(refrescar).toHaveBeenCalledTimes(2)
  })

  it('reanudar sin avisos pendientes no refresca', () => {
    acotado().reanudar()
    expect(refrescar).not.toHaveBeenCalled()
  })

  it('cancelar descarta lo pendiente', () => {
    const r = acotado()
    r.avisar()
    r.avisar()
    r.cancelar()
    r.terminado()
    vi.advanceTimersByTime(5000)
    expect(refrescar).toHaveBeenCalledTimes(1)
  })
})
