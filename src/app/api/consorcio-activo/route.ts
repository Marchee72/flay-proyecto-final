import { NextResponse } from 'next/server'
import { z } from 'zod'

import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import {
  NOMBRE_GALLETA_CONSORCIO,
  OPCIONES_GALLETA_CONSORCIO,
} from '../../(panel)/consorcio-activo'

export const dynamic = 'force-dynamic'

const CUERPO = z.object({ consorcioId: z.string().uuid() })

/**
 * Recuerda el ultimo consorcio abierto (FR-002) para que `/` vuelva ahi. La
 * llama `RecordarConsorcio` al montarse el layout del consorcio, y no el
 * middleware: Next le saca a este las cabeceras de RSC, asi que no distingue
 * una precarga de un `<Link>` de una navegacion, y el ultimo precargado
 * pisaba al abierto. Solo presentacion: la galleta se valida al leerla.
 */
export async function POST(pedido: Request) {
  const origen = pedido.headers.get('origin')
  if (origen && new URL(origen).host !== new URL(pedido.url).host) {
    return NextResponse.json({ error: 'origen no permitido' }, { status: 403 })
  }
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })
  const cuerpo = CUERPO.safeParse(await pedido.json().catch(() => ({})))
  if (!cuerpo.success) return NextResponse.json({ error: 'pedido inválido' }, { status: 400 })

  const { consorcioId } = cuerpo.data
  const alcanzables = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)
  if (!alcanzables.some((c) => c.id === consorcioId)) {
    return NextResponse.json({ error: 'fuera de alcance' }, { status: 404 })
  }

  const respuesta = new NextResponse(null, { status: 204 })
  respuesta.cookies.set(NOMBRE_GALLETA_CONSORCIO, consorcioId, OPCIONES_GALLETA_CONSORCIO)
  return respuesta
}
