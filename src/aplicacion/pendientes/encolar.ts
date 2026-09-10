import type { Prisma, TipoTrabajo } from '@prisma/client'

import { prismaBase } from '@/infraestructura/prisma'

/**
 * Todo efecto externo que puede fallar sin invalidar la operacion se registra
 * aca antes de intentarse (FR-006b). El camino feliz y el de reintento son el
 * mismo camino.
 *
 * Va en SQL por una sola razon: `proximo_intento` lo tiene que poner **la
 * base**. Con el cliente, la hora la pone el proceso, y contra una base
 * administrada los relojes difieren en decimas de segundo: el trabajo recien
 * encolado queda con vencimiento en el futuro y el drenaje siguiente no lo ve.
 * El vencimiento se compara contra `now()` de la base, asi que se escribe con
 * `now()` de la base.
 */
export async function encolar(
  tipo: TipoTrabajo,
  carga: Prisma.InputJsonValue,
): Promise<{ id: string }> {
  const [fila] = await prismaBase.$queryRaw<{ id: string }[]>`
    INSERT INTO "TrabajoPendiente" (tipo, carga)
    VALUES (${tipo}::"TipoTrabajo", ${JSON.stringify(carga)}::jsonb)
    RETURNING id
  `
  return fila
}
