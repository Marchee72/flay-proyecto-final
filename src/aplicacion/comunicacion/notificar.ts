import type { TipoNotificacion } from '@prisma/client'

import { prisma } from '@/infraestructura/prisma'

/**
 * El unico camino por el que nace un aviso (`RF-14`, § 12.7, research R-07).
 *
 * Crea la `Notificacion` y su `TrabajoPendiente` de tipo `notificacion` **en la
 * misma transaccion** que la operacion de negocio que avisa. Asi no existe la
 * fila sin despachador que `003` dejaba, ni el trabajo sin fila. Si el correo
 * falla despues, falla el trabajo y reintenta; la operacion ya quedo hecha
 * (RNF-14, SC-008).
 *
 * Va en SQL por lo mismo que `encolar`: `proximo_intento` lo pone la base.
 */

/** El cliente de una transaccion interactiva del cliente aislado. */
export type Transaccion = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export interface AvisoNuevo {
  usuarioId: string
  tipo: TipoNotificacion
  titulo: string
  cuerpo: string
  entidadTipo?: string
  entidadId?: string
}

export async function notificar(tx: Transaccion, avisos: AvisoNuevo[]): Promise<void> {
  if (avisos.length === 0) return

  const creadas = await tx.notificacion.createManyAndReturn({
    data: avisos.map((aviso) => ({
      usuarioId: aviso.usuarioId,
      tipo: aviso.tipo,
      titulo: aviso.titulo,
      cuerpo: aviso.cuerpo,
      entidadTipo: aviso.entidadTipo ?? null,
      entidadId: aviso.entidadId ?? null,
    })),
    select: { id: true },
  })

  const ids = creadas.map((fila) => fila.id)
  await tx.$executeRaw`
    INSERT INTO "TrabajoPendiente" (tipo, carga)
    SELECT 'notificacion'::"TipoTrabajo", jsonb_build_object('notificacionId', id)
    FROM unnest(${ids}::uuid[]) AS id
  `
}

/** Los usuarios con habilitacion vigente sobre el consorcio activo: son los que pueden ver. */
export async function habilitadosDelConsorcio(tx: Transaccion): Promise<string[]> {
  const filas = await tx.habilitacion.findMany({
    where: { vigenciaHasta: null },
    select: { usuarioId: true },
    distinct: ['usuarioId'],
  })
  return filas.map((fila) => fila.usuarioId)
}

/** Para quien no esta dentro de una transaccion ajena. */
export function notificarAhora(avisos: AvisoNuevo[]): Promise<void> {
  return prisma.$transaction((tx) => notificar(tx, avisos))
}
