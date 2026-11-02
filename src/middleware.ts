import { NextResponse, type NextRequest } from 'next/server'

/**
 * Corre en el borde, antes de cada pantalla: sin Prisma ni Auth.js. Pasa la
 * ruta pedida en `x-flay-ruta`, para que `irAIngresar` sepa adonde volver
 * despues de ingresar (un componente servidor no ve su URL).
 *
 * No recuerda el consorcio: Next le saca al middleware las cabeceras de RSC,
 * asi que aca una precarga de `<Link>` no se distingue de una navegacion. Eso
 * lo hace `RecordarConsorcio`, que solo se monta en la que se abrio.
 */
export function middleware(pedido: NextRequest) {
  const { pathname, search } = pedido.nextUrl
  const cabeceras = new Headers(pedido.headers)
  cabeceras.set('x-flay-ruta', pathname + search)
  return NextResponse.next({ request: { headers: cabeceras } })
}

export const config = { matcher: ['/((?!api|_next|favicon.ico).*)'] }
