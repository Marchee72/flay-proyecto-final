import { beforeEach, describe, expect, it, vi } from 'vitest'

import { avisoAbly } from '@/infraestructura/en-vivo/ably'
import { avisoNulo } from '@/infraestructura/en-vivo/nulo'

const secretoAbly = 'app.key:secretoDePrueba'

const responde = (status: number, cuerpo: object = {}) =>
  vi.fn(async () => new Response(JSON.stringify(cuerpo), { status })) as unknown as typeof fetch

const pedidoDe = (pedir: typeof fetch) => {
  const [url, init] = vi.mocked(pedir).mock.calls[0] as [string, RequestInit]
  return { url, init, cuerpo: JSON.parse(String(init.body)) }
}

describe('avisoAbly', () => {
  let pedir: typeof fetch

  beforeEach(() => {
    pedir = responde(201, { token: 'tok' })
  })

  it('publica un aviso sin datos, con Basic y corte', async () => {
    await avisoAbly(secretoAbly, pedir).publicar('a1')
    const { url, init, cuerpo } = pedidoDe(pedir)
    expect(url).toBe('https://main.realtime.ably.net/channels/asamblea%3Aa1/messages')
    expect(new Headers(init.headers).get('authorization')).toBe(`Basic ${btoa(secretoAbly)}`)
    expect(cuerpo).toEqual({ name: 'cambio' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('pide un token que solo escucha ese canal', async () => {
    const permiso = await avisoAbly(secretoAbly, pedir).permisoDeEscucha('a1')
    const { url, init, cuerpo } = pedidoDe(pedir)
    expect(url).toBe('https://main.realtime.ably.net/keys/app.key/requestToken')
    expect(new Headers(init.headers).get('authorization')).toBe(`Basic ${btoa(secretoAbly)}`)
    expect(cuerpo.keyName).toBe('app.key')
    expect(cuerpo.capability).toBe('{"asamblea:a1":["subscribe"]}')
    expect(cuerpo.nonce).toBeTruthy()
    expect(cuerpo.timestamp).toBeTypeOf('number')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(permiso).toEqual({ canal: 'asamblea:a1', token: 'tok' })
  })

  it.each([401, 429, 500])(
    'una respuesta %i rechaza sin mostrar la secretoAbly',
    async (estado) => {
      const pedido = avisoAbly(secretoAbly, responde(estado, { error: secretoAbly })).publicar('a1')
      const error = await pedido.then(
        () => null,
        (e: Error) => e,
      )
      expect(error?.message).toContain(String(estado))
      expect(error?.message).not.toContain('secreto')
    },
  )

  it('un permiso rechazado también falla sin mostrar la secretoAbly', async () => {
    const pedido = avisoAbly(secretoAbly, responde(401, { error: secretoAbly })).permisoDeEscucha(
      'a1',
    )
    await expect(pedido).rejects.toThrow('401')
    await expect(pedido).rejects.not.toThrow(/secreto/)
  })
})

describe('avisoNulo', () => {
  it('no publica y no da permiso', async () => {
    await expect(avisoNulo.publicar('a1')).resolves.toBeUndefined()
    expect(await avisoNulo.permisoDeEscucha('a1')).toBeNull()
  })
})
