import type { TipoTrabajo } from '@prisma/client'
import { z } from 'zod'

import type { Notificador } from '@/dominio/contratos/notificador'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { drenar, reintentarAhora, type Manejador } from '@/aplicacion/pendientes/drenar'
import { prismaBase } from '@/infraestructura/prisma'

/**
 * El despachador de avisos (`FR-012`, `FR-013`, research R-07): un manejador
 * de la cola de `002`. No sabe de liquidaciones ni de reclamos; toma la
 * notificacion por id, la manda por el puerto y anota el resultado. El
 * reintento, la espera creciente y el «agotado» visible son de la cola.
 *
 * Va por `prismaBase` porque `Notificacion` no lleva consorcio y el drenaje
 * corre fuera de todo contexto de aislamiento.
 */
const CARGA = z.object({ notificacionId: z.string().uuid() })

export function manejadorNotificacion(notificador: Notificador): Manejador {
  return async (carga) => {
    const { notificacionId } = CARGA.parse(carga)
    const notificacion = await prismaBase.notificacion.findUnique({
      where: { id: notificacionId },
    })
    if (!notificacion || notificacion.estadoEnvio === 'enviada') return

    const usuario = await prismaBase.usuario.findUnique({
      where: { id: notificacion.usuarioId },
      select: { correo: true },
    })
    if (!usuario) return

    try {
      await notificador.enviarNotificacion({
        destino: usuario.correo,
        titulo: notificacion.titulo,
        cuerpo: notificacion.cuerpo,
      })
    } catch (error) {
      // Queda `fallida` para que la pantalla lo muestre; el trabajo reintenta.
      // `updateMany`: si la fila desaparecio mientras se enviaba, no es un error mas.
      await prismaBase.notificacion.updateMany({
        where: { id: notificacionId },
        data: { estadoEnvio: 'fallida' },
      })
      throw error
    }

    await prismaBase.notificacion.updateMany({
      where: { id: notificacionId },
      data: { estadoEnvio: 'enviada', enviadaEn: new Date() },
    })
  }
}

/** Como maximo por disparo: un pedido web no puede durar minutos. */
const PRESUPUESTO_MS = 20_000

export interface EstadoDeLaCola {
  pendientes: number
  agotados: number
  despachados: number
  ultimoError: string | null
  avisosSinEnviar: number
}

/**
 * Disparo explicito del administrador («enviar avisos ahora», `FR-012`):
 * drena la cola hasta agotar el presupuesto o los trabajos, con el mismo
 * mapa de manejadores que el drenaje oportunista. Se puede apretar de nuevo.
 */
export async function despacharNotificaciones(
  manejadores: Partial<Record<TipoTrabajo, Manejador>>,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<EstadoDeLaCola> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'despachar los avisos',
    },
    async () => {
      const inicio = Date.now()
      while (Date.now() - inicio < PRESUPUESTO_MS) {
        const { despachados, fallidos } = await drenar(manejadores)
        if (despachados + fallidos === 0) break
      }
      return estadoDeLaCola()
    },
  )
}

/** Lo que la pantalla de pendientes muestra. La cola es global: no lleva consorcio. */
export async function estadoDeLaCola(): Promise<EstadoDeLaCola> {
  const [pendientes, agotados, despachados, ultimo, avisosSinEnviar] = await Promise.all([
    prismaBase.trabajoPendiente.count({ where: { estado: 'pendiente' } }),
    prismaBase.trabajoPendiente.count({ where: { estado: 'agotado' } }),
    prismaBase.trabajoPendiente.count({ where: { estado: 'despachado' } }),
    prismaBase.trabajoPendiente.findFirst({
      where: { ultimoError: { not: null } },
      orderBy: { actualizadoEn: 'desc' },
      select: { ultimoError: true },
    }),
    prismaBase.notificacion.count({ where: { estadoEnvio: { not: 'enviada' } } }),
  ])
  return {
    pendientes,
    agotados,
    despachados,
    ultimoError: ultimo?.ultimoError ?? null,
    avisosSinEnviar,
  }
}

/** Reenvio manual de lo agotado: vuelve a pendiente con el proximo intento ahora. */
export async function reintentarAgotados(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<number> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'reintentar los avisos',
    },
    async () => {
      const agotados = await prismaBase.trabajoPendiente.findMany({
        where: { estado: 'agotado' },
        select: { id: true },
      })
      for (const trabajo of agotados) await reintentarAhora(trabajo.id)
      return agotados.length
    },
  )
}
