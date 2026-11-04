import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { crearEscucha, type Oyentes, type ResultadoPermiso } from '@/compartido/escucha-en-vivo'

const PERMISO = { canal: 'c', token: 't' }

describe('crearEscucha', () => {
  let oyentes: Oyentes[]
  let abiertas: number
  let cerradas: number
  const alCambio = vi.fn()
  const alConectado = vi.fn()
  const pedirPermiso = vi.fn<() => Promise<ResultadoPermiso>>()
  const abrir = vi.fn((_: unknown, o: Oyentes) => {
    oyentes.push(o)
    abiertas++
    return {
      cerrar: () => {
        abiertas--
        cerradas++
      },
    }
  })
  const escucha = () => crearEscucha({ pedirPermiso, abrir, alCambio, alConectado })
  const ultima = () => oyentes[oyentes.length - 1]!

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    oyentes = []
    abiertas = 0
    cerradas = 0
    pedirPermiso.mockReset()
    pedirPermiso.mockResolvedValue(PERMISO)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sin servicio no abre ni reintenta', async () => {
    pedirPermiso.mockResolvedValue('sin-servicio')
    escucha().iniciar()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(pedirPermiso).toHaveBeenCalledTimes(1)
    expect(abrir).not.toHaveBeenCalled()
  })

  it('marca conectado al abrir y desconectado ante un error', async () => {
    escucha().iniciar()
    await vi.advanceTimersByTimeAsync(0)
    ultima().alAbrir()
    expect(alConectado).toHaveBeenLastCalledWith(true)
    ultima().alError()
    expect(alConectado).toHaveBeenLastCalledWith(false)
  })

  it('cada mensaje avisa un cambio', async () => {
    escucha().iniciar()
    await vi.advanceTimersByTimeAsync(0)
    ultima().alAbrir()
    alCambio.mockClear()
    ultima().alMensaje()
    ultima().alMensaje()
    expect(alCambio).toHaveBeenCalledTimes(2)
  })

  it('un token vencido: cierra, pide otro y reabre una sola conexión', async () => {
    escucha().iniciar()
    await vi.advanceTimersByTimeAsync(0)
    ultima().alAbrir()
    ultima().alError()
    expect(cerradas).toBe(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(pedirPermiso).toHaveBeenCalledTimes(2)
    expect(abrir).toHaveBeenCalledTimes(2)
    expect(abiertas).toBe(1)
  })

  it('dos errores seguidos de una misma conexión agendan un solo reintento', async () => {
    escucha().iniciar()
    await vi.advanceTimersByTimeAsync(0)
    const conexion = ultima()
    conexion.alError()
    conexion.alError()
    await vi.advanceTimersByTimeAsync(1000)
    expect(pedirPermiso).toHaveBeenCalledTimes(2)
    expect(abiertas).toBe(1)
  })

  it('la espera crece hasta 30 s y vuelve a 1 s al conectar', async () => {
    pedirPermiso.mockResolvedValue('reintentar')
    escucha().iniciar()
    await vi.advanceTimersByTimeAsync(0)
    let pedidos = 1
    for (const espera of [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]) {
      await vi.advanceTimersByTimeAsync(espera - 1)
      expect(pedirPermiso).toHaveBeenCalledTimes(pedidos)
      await vi.advanceTimersByTimeAsync(1)
      expect(pedirPermiso).toHaveBeenCalledTimes(++pedidos)
    }
    pedirPermiso.mockResolvedValue(PERMISO)
    await vi.advanceTimersByTimeAsync(30_000)
    ultima().alAbrir()
    ultima().alError()
    pedidos = pedirPermiso.mock.calls.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(pedirPermiso).toHaveBeenCalledTimes(pedidos + 1)
  })

  it('un rechazo del pedido de permiso también reintenta', async () => {
    pedirPermiso.mockRejectedValueOnce(new Error('sin red'))
    escucha().iniciar()
    await vi.advanceTimersByTimeAsync(1000)
    expect(pedirPermiso).toHaveBeenCalledTimes(2)
    expect(abrir).toHaveBeenCalledTimes(1)
  })

  it('cada apertura avisa un cambio: lo publicado antes de escuchar no se pierde', async () => {
    escucha().iniciar()
    await vi.advanceTimersByTimeAsync(0)
    ultima().alAbrir()
    expect(alCambio).toHaveBeenCalledTimes(1)
    ultima().alError()
    await vi.advanceTimersByTimeAsync(1000)
    ultima().alAbrir()
    expect(alCambio).toHaveBeenCalledTimes(2)
  })

  it('detener cierra la conexión abierta', async () => {
    const e = escucha()
    e.iniciar()
    await vi.advanceTimersByTimeAsync(0)
    ultima().alAbrir()
    e.detener()
    expect(abiertas).toBe(0)
  })

  it('detener cancela un reintento agendado', async () => {
    const e = escucha()
    e.iniciar()
    await vi.advanceTimersByTimeAsync(0)
    ultima().alError()
    e.detener()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(pedirPermiso).toHaveBeenCalledTimes(1)
  })

  it('un permiso que llega después de detener no abre nada', async () => {
    let entregar!: (r: ResultadoPermiso) => void
    pedirPermiso.mockReturnValue(new Promise((r) => (entregar = r)))
    const e = escucha()
    e.iniciar()
    e.detener()
    entregar(PERMISO)
    await vi.advanceTimersByTimeAsync(0)
    expect(abrir).not.toHaveBeenCalled()
  })
})
