// Volumen anual de SC-006: 10.800 gastos repartidos en doce periodos sobre los
// dos consorcios del juego de § 13.4, para medir el listado con datos de verdad
// y no con tres filas.
//
// Deterministica: el generador es una congruencia lineal con semilla fija, asi
// que la medicion de hoy se puede comparar con la de la semana que viene. Correr
// dos veces no duplica: si el periodo ya tiene sus gastos, se saltea.
import { existsSync } from 'node:fs'

import { PrismaClient } from '@prisma/client'

import { sembrarJuego } from '../pruebas/fixtures/juego-13-4.ts'
import { sembrarRubros } from '../prisma/semilla-rubros.ts'

if (existsSync('.env')) process.loadEnvFile('.env')

const GASTOS = Number(process.env.VOLUMEN_GASTOS ?? 10_800)
const ANIO = Number(process.env.VOLUMEN_ANIO ?? 2026)
const MESES = 12
const LOTE = 500

/** Congruencia lineal: reproducible, y alcanza de sobra para datos de prueba. */
function generador(semilla) {
  let estado = semilla
  return () => {
    estado = (estado * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return estado / 4_294_967_296
  }
}

const prisma = new PrismaClient()

try {
  await sembrarRubros(prisma)
  const juego = await sembrarJuego(prisma)

  const rubros = await prisma.rubroGasto.findMany({ select: { id: true, clasificacion: true } })
  const autor = await prisma.usuario.findFirst({ select: { id: true } })

  if (!autor) {
    console.error('No hay ningun usuario: correr antes `npm run semilla:arranque`.')
    process.exit(1)
  }

  const azar = generador(20_260_909)
  const porPeriodo = Math.round(GASTOS / (MESES * juego.consorcios.length))
  let escritos = 0

  for (const consorcio of juego.consorcios) {
    for (let mes = 1; mes <= MESES; mes++) {
      const periodo = await prisma.periodo.upsert({
        where: { consorcioId_anio_mes: { consorcioId: consorcio.id, anio: ANIO, mes } },
        update: {},
        create: { consorcioId: consorcio.id, anio: ANIO, mes },
      })

      const cargados = await prisma.gasto.count({ where: { periodoId: periodo.id } })
      if (cargados >= porPeriodo) continue

      const filas = []
      for (let i = cargados; i < porPeriodo; i++) {
        const rubro = rubros[Math.floor(azar() * rubros.length)]
        const dia = 1 + Math.floor(azar() * 28)
        // Entre 1.000,00 y 501.000,00: el orden de magnitud de una expensa real.
        const centavos = 100_000 + Math.floor(azar() * 50_000_000)

        filas.push({
          consorcioId: consorcio.id,
          periodoId: periodo.id,
          rubroId: rubro.id,
          importe: `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`,
          clasificacion: rubro.clasificacion,
          fecha: new Date(Date.UTC(ANIO, mes - 1, dia)),
          descripcion: `Gasto ${mes}/${ANIO} numero ${i + 1}`,
          cargadoPor: autor.id,
        })
      }

      for (let i = 0; i < filas.length; i += LOTE) {
        await prisma.gasto.createMany({ data: filas.slice(i, i + LOTE) })
      }

      escritos += filas.length
    }
  }

  const total = await prisma.gasto.count()
  console.log(`Gastos escritos en esta corrida: ${escritos}. Total en la base: ${total}.`)
  console.log('Para medir: npm run medir:p95 /gastos')
} finally {
  await prisma.$disconnect()
}
