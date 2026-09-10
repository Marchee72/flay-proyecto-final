import { ErrorDeAplicacion } from '@/compartido/errores'
import type { DerivadorDeContrasenas } from '@/dominio/contratos/derivador-contrasenas'
import type { Reloj } from '@/dominio/contratos/reloj'
import { prismaBase } from '@/infraestructura/prisma'

/**
 * Inicio de sesion con freno a la prueba de contrasenas (FR-001, FR-001b).
 *
 * Argon2id encarece romper la base robada; el bloqueo protege el formulario.
 * Son problemas distintos y hacen falta los dos.
 */

export const INTENTOS_ANTES_DEL_BLOQUEO = 5
export const MINUTOS_DE_BLOQUEO = 15

/**
 * Un unico error para las tres situaciones: cuenta inexistente, contrasena
 * incorrecta y cuenta bloqueada (FR-001c). Distinguirlas le diria a un atacante
 * que correos estan registrados.
 */
export class CredencialesInvalidas extends ErrorDeAplicacion {
  constructor() {
    super('El correo o la contraseña no coinciden.', 'RNF-04')
  }
}

/**
 * Clave derivada de descarte: cuando el correo no existe igual se verifica
 * contra esta, para que el tiempo de respuesta no delate si la cuenta existe.
 */
const CLAVE_DE_DESCARTE =
  '$argon2id$v=19$m=19456,t=2,p=1$c2Vpc2RlZGVzY2FydGU$0000000000000000000000000000000000000000000'

export async function iniciarSesion(
  derivador: DerivadorDeContrasenas,
  reloj: Reloj,
  datos: { correo: string; contrasena: string; origen: string },
): Promise<{ usuarioId: string }> {
  const correo = datos.correo.trim().toLowerCase()
  const usuario = await prismaBase.usuario.findUnique({ where: { correo } })

  const bloqueado = !!usuario?.bloqueadoHasta && usuario.bloqueadoHasta > reloj.ahora()

  const coincide = await derivador.verificar(
    datos.contrasena,
    usuario?.claveDerivada ?? CLAVE_DE_DESCARTE,
  )

  // Bloqueado rechaza aunque la contrasena sea correcta (SC-006d).
  const exitoso = coincide && !bloqueado && usuario?.estado === 'activo'

  await prismaBase.intentoInicioSesion.create({
    data: { correoProbado: correo, origen: datos.origen, exitoso },
  })

  if (!exitoso) {
    if (usuario && !bloqueado) await bloquearSiCorresponde(usuario.id, correo, reloj)
    throw new CredencialesInvalidas()
  }

  await prismaBase.usuario.update({
    where: { id: usuario!.id },
    data: { bloqueadoHasta: null },
  })

  return { usuarioId: usuario!.id }
}

/** Cuenta los fallos consecutivos mas recientes; al quinto, bloquea. */
async function bloquearSiCorresponde(usuarioId: string, correo: string, reloj: Reloj) {
  const ultimos = await prismaBase.intentoInicioSesion.findMany({
    where: { correoProbado: correo },
    orderBy: { momento: 'desc' },
    take: INTENTOS_ANTES_DEL_BLOQUEO,
    select: { exitoso: true },
  })

  const todosFallidos =
    ultimos.length === INTENTOS_ANTES_DEL_BLOQUEO && ultimos.every((i) => !i.exitoso)

  if (!todosFallidos) return

  const hasta = new Date(reloj.ahora().getTime() + MINUTOS_DE_BLOQUEO * 60_000)
  await prismaBase.usuario.update({ where: { id: usuarioId }, data: { bloqueadoHasta: hasta } })
}

/**
 * El administrador levanta el bloqueo sin esperar los quince minutos (FR-001c).
 * Es la contencion del flanco que el bloqueo por cuenta abre: a alguien que
 * conozca un correo le alcanza para dejar afuera a su dueno.
 */
export async function desbloquearUsuario(usuarioId: string): Promise<void> {
  await prismaBase.usuario.update({ where: { id: usuarioId }, data: { bloqueadoHasta: null } })
}
