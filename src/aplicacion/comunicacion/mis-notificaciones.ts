import type { TipoNotificacion } from '@prisma/client'

import type { Reloj } from '@/dominio/contratos/reloj'
import { prismaBase } from '@/infraestructura/prisma'

/**
 * La campana del panel (`RF-14`, rediseño 013): los avisos que el sistema ya
 * guardaba para mandar por correo, ahora tambien leidos adentro de la app. El
 * aviso es de una persona y no de un consorcio —no lleva `consorcio_id`—, asi
 * que el unico filtro es el dueño, y va siempre.
 */

export interface NotificacionPropia {
  id: string
  tipo: TipoNotificacion
  titulo: string
  cuerpo: string
  creadaEn: string
  leida: boolean
}

const LIMITE = 20

export async function misNotificaciones(
  usuarioId: string,
): Promise<{ noLeidas: number; notificaciones: NotificacionPropia[] }> {
  const [noLeidas, filas] = await Promise.all([
    prismaBase.notificacion.count({ where: { usuarioId, leidaEn: null } }),
    prismaBase.notificacion.findMany({
      where: { usuarioId },
      orderBy: { creadoEn: 'desc' },
      take: LIMITE,
      select: { id: true, tipo: true, titulo: true, cuerpo: true, creadoEn: true, leidaEn: true },
    }),
  ])
  return {
    noLeidas,
    notificaciones: filas.map((n) => ({
      id: n.id,
      tipo: n.tipo,
      titulo: n.titulo,
      cuerpo: n.cuerpo,
      creadaEn: n.creadoEn.toISOString(),
      leida: n.leidaEn !== null,
    })),
  }
}

/** Sin `ids`, todas. Una ajena no se toca: el filtro por dueño va en la misma sentencia. */
export async function marcarLeidas(
  reloj: Reloj,
  usuarioId: string,
  ids?: readonly string[],
): Promise<{ marcadas: number }> {
  const { count } = await prismaBase.notificacion.updateMany({
    where: { usuarioId, leidaEn: null, ...(ids ? { id: { in: [...ids] } } : {}) },
    data: { leidaEn: reloj.ahora() },
  })
  return { marcadas: count }
}
