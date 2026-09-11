import { NextResponse, type NextRequest } from 'next/server'

import { NOMBRE_GALLETA_CONSORCIO } from './app/(panel)/consorcio-activo'

/**
 * Espeja `?consorcio=` en la galleta `flay_consorcio` para que la barra
 * muestre el mismo consorcio que la pantalla (guía §3.4). El valor se espeja
 * sin validar —no hay base en el filo—; la validación contra el alcance sigue
 * en `resolverConsorcioActivo` y en cada caso de uso (FR-002). Un id forjado
 * solo logra que la pantalla diga «no está al alcance».
 */
export function middleware(peticion: NextRequest) {
  const pedido = peticion.nextUrl.searchParams.get('consorcio')
  if (!pedido) return NextResponse.next()

  const respuesta = NextResponse.next()
  respuesta.cookies.set(NOMBRE_GALLETA_CONSORCIO, pedido, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 31_536_000,
  })
  return respuesta
}

export const config = {
  matcher: [
    '/consorcios/:path*',
    '/gastos/:path*',
    '/periodos/:path*',
    '/expensas/:path*',
    '/liquidaciones/:path*',
    '/pagos/:path*',
    '/morosidad/:path*',
    '/proveedores/:path*',
    '/usuarios/:path*',
  ],
}
