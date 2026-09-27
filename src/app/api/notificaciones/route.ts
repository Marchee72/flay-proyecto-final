import { NextResponse } from 'next/server'
import { z } from 'zod'

import { marcarLeidas, misNotificaciones } from '@/aplicacion/comunicacion/mis-notificaciones'
import { RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

export const dynamic = 'force-dynamic'

/**
 * La campana consulta aca cada pocos segundos (rediseño 013). Es un sondeo y
 * no una conexion abierta: en el despliegue las funciones cortan a los
 * segundos, y el aviso llega igual con una demora que nadie nota.
 */
export async function GET() {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })
  return NextResponse.json(await misNotificaciones(usuarioId), {
    headers: { 'Cache-Control': 'no-store' },
  })
}

const MARCAR = z.object({ ids: z.array(z.string().uuid()).max(100).optional() })

/** Marca como leidas las indicadas, o todas si no vienen ids. */
export async function POST(pedido: Request) {
  // Las Server Actions traen su propia defensa contra pedidos de otro sitio;
  // una ruta no: el origen, si viene, tiene que ser este.
  const origen = pedido.headers.get('origin')
  if (origen && new URL(origen).host !== new URL(pedido.url).host) {
    return NextResponse.json({ error: 'origen no permitido' }, { status: 403 })
  }
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })
  const cuerpo = MARCAR.safeParse(await pedido.json().catch(() => ({})))
  if (!cuerpo.success) return NextResponse.json({ error: 'pedido inválido' }, { status: 400 })
  return NextResponse.json(await marcarLeidas(RELOJ, usuarioId, cuerpo.data.ids))
}
