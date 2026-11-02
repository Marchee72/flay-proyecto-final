import { NextResponse, type NextRequest } from 'next/server'

import {
  consorcioDeLaRuta,
  NOMBRE_GALLETA_CONSORCIO,
  OPCIONES_GALLETA_CONSORCIO,
} from './app/(panel)/consorcio-activo'

/**
 * Corre en el borde, antes de cada pantalla: sin Prisma ni Auth.js.
 *
 * - Pasa la ruta pedida en `x-flay-ruta`, para que `irAIngresar` sepa adonde
 *   volver despues de ingresar (un componente servidor no ve su URL).
 * - Recuerda en `flay_consorcio` el ultimo consorcio que se abrio, no solo el
 *   que se eligio en el selector: `/` vuelve ahi. La galleta se sigue
 *   validando contra el alcance al leerla, asi que un id ajeno no abre nada.
 */
export function middleware(pedido: NextRequest) {
  const { pathname, search } = pedido.nextUrl
  const cabeceras = new Headers(pedido.headers)
  cabeceras.set('x-flay-ruta', pathname + search)
  const respuesta = NextResponse.next({ request: { headers: cabeceras } })

  const consorcioId = pedido.method === 'GET' ? consorcioDeLaRuta(pathname) : null
  if (consorcioId && pedido.cookies.get(NOMBRE_GALLETA_CONSORCIO)?.value !== consorcioId) {
    respuesta.cookies.set(NOMBRE_GALLETA_CONSORCIO, consorcioId, OPCIONES_GALLETA_CONSORCIO)
  }
  return respuesta
}

export const config = { matcher: ['/((?!api|_next|favicon.ico).*)'] }
