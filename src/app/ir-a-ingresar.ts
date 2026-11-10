import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Sin sesion se va a ingresar recordando adonde se iba: la ruta la pone
 * `src/middleware.ts` en `x-flay-ruta`, porque un componente servidor no ve su
 * URL. Desde una Server Action es la pantalla que la disparo. El destino se
 * valida del otro lado, al ingresar (`destinoSeguro`).
 *
 * Se usa como `if (!usuarioId) return irAIngresar()` para que TypeScript
 * angoste `usuarioId`.
 */
export async function irAIngresar(): Promise<never> {
  const ruta = (await headers()).get('x-flay-ruta')
  redirect(ruta && ruta !== '/' ? `/ingresar?desde=${encodeURIComponent(ruta)}` : '/ingresar')
}
