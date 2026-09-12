import { z } from 'zod'

import type { Notificador } from '@/dominio/contratos/notificador'
import type { Manejador } from '@/aplicacion/pendientes/drenar'
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
