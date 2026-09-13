// Refresca las vistas materializadas de indicadores a mano (FR-018): lo mismo
// que la tarea programada y el boton del panel, desde la terminal.
import { existsSync } from 'node:fs'

import { PrismaClient } from '@prisma/client'

if (existsSync('.env')) process.loadEnvFile('.env')

const prisma = new PrismaClient()
try {
  const inicio = Date.now()
  await prisma.$executeRaw`SELECT fn_refrescar_indicadores()`
  const momento = new Date()
  await prisma.refrescoIndicadores.upsert({
    where: { id: 1 },
    update: { refrescadoEn: momento },
    create: { id: 1, refrescadoEn: momento },
  })
  console.log(`Vistas refrescadas en ${Date.now() - inicio} ms.`)
} finally {
  await prisma.$disconnect()
}
