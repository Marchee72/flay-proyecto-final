// Semilla del juego de datos de § 13.4 (FR-028): dos consorcios de 12 y 96
// unidades, con sus coeficientes sumando 100.00000000 exacto, mas el catalogo
// de rubros. Deterministica: dos corridas dejan exactamente lo mismo.
//
// No crea usuarios: el unico administrador sale de `npm run semilla:arranque`,
// con la contrasena en variable de entorno y jamas versionada (FR-005).
import { existsSync } from 'node:fs'

import { PrismaClient } from '@prisma/client'

import { sembrarJuego } from '../pruebas/fixtures/juego-13-4.ts'
import { sembrarRubros } from '../prisma/semilla-rubros.ts'

if (existsSync('.env')) process.loadEnvFile('.env')

const prisma = new PrismaClient()

try {
  const rubros = await sembrarRubros(prisma)
  const juego = await sembrarJuego(prisma)

  console.log(`Rubros asegurados: ${rubros}.`)
  for (const consorcio of juego.consorcios) {
    console.log(`Consorcio ${consorcio.nombre}: ${consorcio.unidades} unidades.`)
  }
  console.log('Para cargar el volumen anual: npm run semilla:volumen')
} finally {
  await prisma.$disconnect()
}
