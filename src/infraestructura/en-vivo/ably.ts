import { randomUUID } from 'node:crypto'

import type { AvisoEnVivo } from '@/dominio/contratos/aviso-en-vivo'

const BASE = 'https://main.realtime.ably.net'
const CORTE_MS = 2000

export const canalDeAsamblea = (asambleaId: string): string => `asamblea:${asambleaId}`

/**
 * Publica y emite tokens por la API REST: son dos `POST`, no hace falta el SDK.
 * Un error lleva solo el estado HTTP: el cuerpo o el pedido podrían nombrar la clave.
 */
export function avisoAbly(clave: string, pedir: typeof fetch = fetch): AvisoEnVivo {
  const [nombreClave = ''] = clave.split(':')

  const enviar = async (ruta: string, cuerpo: object): Promise<Response> => {
    const respuesta = await pedir(`${BASE}${ruta}`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(clave).toString('base64')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(CORTE_MS),
    })
    if (!respuesta.ok) throw new Error(`Ably respondió ${respuesta.status}`)
    return respuesta
  }

  return {
    async publicar(asambleaId) {
      const canal = encodeURIComponent(canalDeAsamblea(asambleaId))
      await enviar(`/channels/${canal}/messages`, { name: 'cambio' })
    },
    async permisoDeEscucha(asambleaId) {
      const canal = canalDeAsamblea(asambleaId)
      const respuesta = await enviar(`/keys/${nombreClave}/requestToken`, {
        keyName: nombreClave,
        capability: JSON.stringify({ [canal]: ['subscribe'] }),
        nonce: randomUUID(),
        timestamp: Date.now(),
      })
      const { token } = (await respuesta.json()) as { token: string }
      return { canal, token }
    },
  }
}
