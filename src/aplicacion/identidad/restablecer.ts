import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { Reloj } from '@/dominio/contratos/reloj'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { encolar } from '@/aplicacion/pendientes/encolar'
import { prisma, prismaBase } from '@/infraestructura/prisma'

import { nuevaCredencial } from './credencial'

/**
 * Cambio de contraseña por enlace (RF-03). Reusa la credencial de la invitación:
 * el enlace lleva a `/invitacion/<credencial>` y `fijarContrasena` lo consume.
 */

export const HORAS_DE_VIGENCIA_DEL_RESTABLECIMIENTO = 2

export class TodaviaInvitado extends ErrorDeAplicacion {
  constructor() {
    super('Todavía no aceptó la invitación: usá «Reenviar».', 'RF-03')
  }
}

/**
 * Pedido propio, sin sesión. No revela si la cuenta existe: ni devuelve nada,
 * ni lanza, ni cambia de forma observable según el correo. Solo actúa sobre una
 * cuenta `activo`; el correo se encola y su falla no llega acá (RNF-14).
 */
export async function pedirRestablecimiento(
  reloj: Reloj,
  datos: { correo: string; urlBase: string },
): Promise<void> {
  const correo = datos.correo.trim().toLowerCase()
  const usuario = await prismaBase.usuario.findUnique({ where: { correo } })
  if (usuario?.estado !== 'activo') return

  await mandarEnlace(reloj, usuario.id, correo, datos.urlBase)
}

/**
 * Lo manda un administrador a alguien de su consorcio: le levanta el bloqueo y
 * le manda el enlace. Es la salida para quien quedó bloqueado o no recuerda la
 * clave y no tiene a mano el formulario.
 */
export async function enviarEnlaceDeClave(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; destinatarioId: string; urlBase: string },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'mandar el enlace para cambiar la clave',
    },
    async () => {
      // Lectura aislada: alguien de otro consorcio es «no encontrado».
      const habilitacion = await prisma.habilitacion.findFirst({
        where: {
          usuarioId: datos.destinatarioId,
          vigenciaDesde: { lte: reloj.hoy() },
          OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: reloj.hoy() } }],
        },
        include: { usuario: true },
      })
      if (!habilitacion) throw new NoEncontrado()
      const { usuario } = habilitacion

      await prismaBase.usuario.update({
        where: { id: usuario.id },
        data: { bloqueadoHasta: null },
      })

      if (usuario.estado === 'invitado') throw new TodaviaInvitado()
      if (usuario.estado !== 'activo') return

      await mandarEnlace(reloj, usuario.id, usuario.correo, datos.urlBase)
    },
  )
}

async function mandarEnlace(reloj: Reloj, usuarioId: string, correo: string, urlBase: string) {
  const { credencial, hash } = nuevaCredencial()
  const vence = new Date(
    reloj.ahora().getTime() + HORAS_DE_VIGENCIA_DEL_RESTABLECIMIENTO * 3_600_000,
  )

  await prismaBase.usuario.update({
    where: { id: usuarioId },
    data: { invitacionHash: hash, invitacionVence: vence },
  })

  await encolar('correo_directo', {
    destino: correo,
    titulo: 'Cambiá tu contraseña',
    cuerpo: `Pediste cambiar tu contraseña de Flay. Entrá a ${urlBase}/invitacion/${credencial} en las próximas 2 horas para elegir una nueva. Si no fuiste vos, ignorá este correo.`,
  })
}
