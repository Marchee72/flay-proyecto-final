import NextAuth, { AuthError } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'

import { CredencialesInvalidas, iniciarSesion } from '@/aplicacion/identidad/iniciar-sesion'
import { argon2id } from '@/infraestructura/contrasenas/argon2'
import { relojDelSistema } from '@/infraestructura/reloj'

/**
 * Sesion (FR-002, research R-01). La credencial de sesion transporta
 * **unicamente la identidad**: ni el rol ni el consorcio viajan en ella.
 *
 * Es lo que hace que revocar una habilitacion tenga efecto inmediato (FR-004):
 * si el rol viajara firmado en la credencial, seguiria valiendo hasta que la
 * sesion venciera. Cada caso de uso resuelve el acceso contra la base, en
 * `conAutorizacion`, y ningun otro lugar decide.
 */

const CREDENCIALES = z.object({
  correo: z.string().email(),
  contrasena: z.string().min(1),
})

const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt' },
  // El despliegue termina en un unico proxy conocido, que reescribe el host, y
  // no hay proveedor externo con URL de retorno: la unica credencial que se
  // acepta es la propia. Vercel ya lo activa solo; declararlo hace que
  // `npm run start` local se comporte igual que el entorno desplegado.
  trustHost: true,
  pages: { signIn: '/ingresar' },
  providers: [
    Credentials({
      credentials: { correo: {}, contrasena: {} },
      async authorize(credenciales, pedido) {
        const datos = CREDENCIALES.safeParse(credenciales)

        // Un correo mal formado es un no, con el mismo mensaje que el resto
        // (FR-001c): decir «el correo no es valido» ya distingue casos.
        if (!datos.success) return null

        try {
          const { usuarioId } = await iniciarSesion(argon2id, relojDelSistema, {
            correo: datos.data.correo,
            contrasena: datos.data.contrasena,
            origen: origenDe(pedido),
          })
          return { id: usuarioId }
        } catch (error) {
          if (error instanceof CredencialesInvalidas) return null
          throw error
        }
      },
    }),
  ],
  // Una credencial rechazada no es una falla del sistema: ya queda registrada
  // en IntentoInicioSesion, con momento y origen (FR-001b). Sin esto, cada
  // error de tipeo escribe una traza de pila en el registro del servidor.
  logger: {
    error(error) {
      if (error instanceof AuthError && error.type === 'CredentialsSignin') return
      console.error(error)
    },
  },
  callbacks: {
    // Lo unico que se firma es el identificador del usuario.
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id
      return token
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      return session
    },
  },
})

export { handlers, signIn, signOut, auth }

/** Origen del intento, para el registro de FR-001b. */
function origenDe(pedido: Request): string {
  const reenviado = pedido.headers.get('x-forwarded-for')
  return reenviado?.split(',')[0]?.trim() || 'desconocido'
}

/**
 * Identidad de quien pide, o nada. La autorizacion **no** se resuelve aca: esto
 * responde «quien sos», no «que podes hacer».
 */
export async function usuarioDeLaSesion(): Promise<string | null> {
  const sesion = await auth()
  return sesion?.user?.id ?? null
}

/**
 * Traduce el resultado de Auth.js al mensaje unico de FR-001c. Devuelve el
 * mensaje si no entro; si entro, la redireccion se propaga y no vuelve nunca.
 */
export async function ingresar(datos: {
  correo: string
  contrasena: string
  destino: string
}): Promise<string> {
  try {
    await signIn('credentials', {
      correo: datos.correo,
      contrasena: datos.contrasena,
      redirectTo: datos.destino,
    })
    return ''
  } catch (error) {
    // La redireccion del exito viaja como excepcion en Next: no se atrapa.
    if (error instanceof AuthError) return new CredencialesInvalidas().mensajeParaUsuario
    throw error
  }
}
