import type { Prisma, TipoTrabajo } from '@prisma/client'

import { prismaBase } from '@/infraestructura/prisma'

/**
 * Todo efecto externo que puede fallar sin invalidar la operacion se registra
 * aca antes de intentarse (FR-006b). El camino feliz y el de reintento son el
 * mismo camino.
 */
export async function encolar(tipo: TipoTrabajo, carga: Prisma.InputJsonValue) {
  return prismaBase.trabajoPendiente.create({ data: { tipo, carga } })
}
