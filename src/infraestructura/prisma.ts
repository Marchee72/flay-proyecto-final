import { PrismaClient } from '@prisma/client'

import { crearClienteAislado } from './cliente-aislado'

/**
 * Una sola instancia por proceso. En desarrollo, la recarga en caliente crearia
 * una por cada cambio y agotaria las conexiones de la base administrada.
 */
const global_ = globalThis as unknown as { prismaBase?: PrismaClient }

export const prismaBase = global_.prismaBase ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') global_.prismaBase = prismaBase

/**
 * El cliente que usa todo el negocio: inyecta el filtro por consorcio y falla
 * sin contexto (Principio I, RN-12). El crudo se queda en infraestructura.
 */
export const prisma = crearClienteAislado(prismaBase)
