import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Ultima migracion aplicada segun la propia base. Es lo que hace verificable el
 * orden migrar-antes-de-servir (FR-019): si el deploy sirvio antes de migrar,
 * /api/salud lo delata.
 */
export async function ultimaMigracionAplicada(): Promise<string> {
  const filas = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name
    FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY finished_at DESC
    LIMIT 1
  `
  return filas[0]?.migration_name ?? 'ninguna'
}
