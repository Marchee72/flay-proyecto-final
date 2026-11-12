import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { Reloj } from '@/dominio/contratos/reloj'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma, prismaBase } from '@/infraestructura/prisma'

export class NoPodesQuitarteElAcceso extends ErrorDeAplicacion {
  constructor() {
    super(
      'No podés quitarte tu propio acceso de administrador: pedíselo a otro administrador.',
      'RF-03',
    )
  }
}

const UN_DIA = 24 * 60 * 60 * 1000

/**
 * Quitar un rol a una persona del consorcio (RF-03). El efecto es inmediato:
 * el acceso vigente es el de `vigenciaHasta >= hoy`, así que se cierra a ayer.
 * Una habilitación que todavía no empezó no dejó historia y se borra.
 *
 * La habilitación se busca por la lectura aislada: la de otro consorcio es
 * «no encontrado», nunca «prohibido».
 */
export async function quitarAcceso(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; habilitacionId: string },
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'quitar el acceso de una persona',
    },
    async () => {
      const habilitacion = await prisma.habilitacion.findFirst({
        where: { id: datos.habilitacionId },
      })
      if (!habilitacion) throw new NoEncontrado()

      if (habilitacion.usuarioId === datos.usuarioId && habilitacion.rol === 'administrador') {
        throw new NoPodesQuitarteElAcceso()
      }

      const hoy = reloj.hoy()
      if (habilitacion.vigenciaDesde >= hoy) {
        await prismaBase.habilitacion.delete({ where: { id: habilitacion.id } })
      } else {
        await prismaBase.habilitacion.update({
          where: { id: habilitacion.id },
          data: { vigenciaHasta: new Date(hoy.getTime() - UN_DIA) },
        })
      }
    },
  )
}
