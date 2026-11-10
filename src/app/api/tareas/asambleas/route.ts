import { NextResponse } from 'next/server'

import { RELOJ } from '@/aplicacion/dependencias'
import { recordarFirmasPendientes } from '@/aplicacion/asambleas/recordatorios'

/**
 * Tarea diaria de las asambleas (016, FR-034, research R-10): avisa por las
 * actas que llevan más de 10 días sin todas las firmas. Protegida por
 * `CRON_SECRET`, como `refrescar-vistas`: sin él, 401 y nada más.
 */
export async function GET(pedido: Request): Promise<NextResponse> {
  const secreto = process.env.CRON_SECRET
  const autorizacion = pedido.headers.get('authorization')
  if (!secreto || autorizacion !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return NextResponse.json(await recordarFirmasPendientes(RELOJ))
}
