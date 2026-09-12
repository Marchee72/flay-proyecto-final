import { NextResponse } from 'next/server'

import { refrescarVistasProgramado } from '@/aplicacion/indicadores/indicadores'

/**
 * La tarea programada de la plataforma (`FR-018`, research R-11): una corrida
 * diaria de madrugada, la que la capa gratuita admite, que es exactamente la
 * frecuencia pedida. Protegida por `CRON_SECRET`: sin el, 401 y nada mas.
 *
 * Sin usuario ni autorizacion por rol: es la plataforma la que llama, y
 * refrescar no lee ni escribe nada de negocio.
 */
export async function GET(pedido: Request): Promise<NextResponse> {
  const secreto = process.env.CRON_SECRET
  const autorizacion = pedido.headers.get('authorization')
  if (!secreto || autorizacion !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const momento = await refrescarVistasProgramado()
  return NextResponse.json({ refrescadoEn: momento.toISOString() })
}
