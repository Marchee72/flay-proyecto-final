import { NextResponse } from 'next/server'

import { consultarSalud } from '@/aplicacion/consultar-salud'

export const dynamic = 'force-dynamic'

export async function GET() {
  const salud = await consultarSalud()
  return NextResponse.json(salud, { status: salud.estado === 'ok' ? 200 : 503 })
}
