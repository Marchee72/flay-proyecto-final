import { createHash, randomBytes } from 'node:crypto'

import { ErrorDeAplicacion } from '@/compartido/errores'
import type { DerivadorDeContrasenas } from '@/dominio/contratos/derivador-contrasenas'
import type { Reloj } from '@/dominio/contratos/reloj'
import type { Rol } from '@/dominio/identidad/rol'
import { prismaBase } from '@/infraestructura/prisma'
import { encolar } from '@/aplicacion/pendientes/encolar'

/**
 * Invitacion por correo (FR-006). El invitado fija su propia contrasena: el
 * administrador nunca la conoce.
 *
 * El envio **no** se hace aca: se encola. La falla del correo no puede voltear
 * el alta del usuario (RNF-14), y encolar siempre —tambien en el camino feliz—
 * hace que el reintento se ejercite en cada invitacion y no solo cuando el
 * proveedor falla.
 */

export const HORAS_DE_VIGENCIA_DE_LA_INVITACION = 72

export class CorreoYaRegistrado extends ErrorDeAplicacion {
  constructor() {
    super('Ese correo ya tiene un usuario en el sistema.', 'RF-03')
  }
}

/** La credencial viaja en el enlace; en la base queda solo su resumen. */
const resumen = (credencial: string) => createHash('sha256').update(credencial).digest('hex')

export async function invitarPersona(
  reloj: Reloj,
  datos: {
    nombre: string
    apellido: string
    correo: string
    rol: Rol
    consorcioId: string
    consorcioNombre: string
    vigenciaDesde: Date
    urlBase: string
  },
): Promise<{ usuarioId: string }> {
  const correo = datos.correo.trim().toLowerCase()

  if (await prismaBase.usuario.findUnique({ where: { correo } })) {
    throw new CorreoYaRegistrado()
  }

  const credencial = randomBytes(32).toString('base64url')
  const vence = new Date(reloj.ahora().getTime() + HORAS_DE_VIGENCIA_DE_LA_INVITACION * 3_600_000)

  const usuario = await prismaBase.$transaction(async (tx) => {
    const persona = await tx.persona.create({
      data: { nombre: datos.nombre, apellido: datos.apellido, correo },
    })

    const creado = await tx.usuario.create({
      data: {
        personaId: persona.id,
        correo,
        estado: 'invitado',
        invitacionHash: resumen(credencial),
        invitacionVence: vence,
      },
    })

    await tx.habilitacion.create({
      data: {
        usuarioId: creado.id,
        consorcioId: datos.consorcioId,
        rol: datos.rol,
        vigenciaDesde: datos.vigenciaDesde,
      },
    })

    return creado
  })

  await encolar('invitacion', {
    destino: correo,
    nombre: datos.nombre,
    consorcio: datos.consorcioNombre,
    enlaceDeAlta: `${datos.urlBase}/invitacion/${credencial}`,
  })

  return { usuarioId: usuario.id }
}

export class InvitacionNoValida extends ErrorDeAplicacion {
  constructor() {
    super('La invitación venció o ya se usó. Pedile al administrador que la reenvíe.', 'RF-03')
  }
}

/** El invitado fija su contrasena y la invitacion se consume (FR-006). */
export async function fijarContrasena(
  derivador: DerivadorDeContrasenas,
  reloj: Reloj,
  datos: { credencial: string; contrasena: string },
): Promise<{ usuarioId: string }> {
  const usuario = await prismaBase.usuario.findFirst({
    where: { invitacionHash: resumen(datos.credencial) },
  })

  if (!usuario || !usuario.invitacionVence || usuario.invitacionVence < reloj.ahora()) {
    throw new InvitacionNoValida()
  }

  await prismaBase.usuario.update({
    where: { id: usuario.id },
    data: {
      claveDerivada: await derivador.derivar(datos.contrasena),
      estado: 'activo',
      invitacionHash: null,
      invitacionVence: null,
    },
  })

  return { usuarioId: usuario.id }
}
