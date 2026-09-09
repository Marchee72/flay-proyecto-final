// Arnes de RNF-06 (I-07): entorno, volumen y percentil fijados, para que "2 s"
// sea una medicion repetible y no una impresion. Esta etapa solo mide /api/salud.
import { existsSync } from 'node:fs'

if (existsSync('.env')) process.loadEnvFile('.env')

const URL_BASE = process.env.URL_BASE ?? 'http://localhost:3000'
const RUTA = process.argv[2] ?? '/api/salud'
const MUESTRAS = Number(process.env.MUESTRAS ?? 50)
const LIMITE_MS = Number(process.env.LIMITE_P95_MS ?? 2000)

const percentil = (valores, p) => {
  const orden = [...valores].sort((a, b) => a - b)
  return orden[Math.min(orden.length - 1, Math.ceil((p / 100) * orden.length) - 1)]
}

const tiempos = []
for (let i = 0; i < MUESTRAS; i++) {
  const inicio = performance.now()
  const respuesta = await fetch(`${URL_BASE}${RUTA}`)
  await respuesta.arrayBuffer()
  if (!respuesta.ok) {
    console.error(`${RUTA} respondio ${respuesta.status} en la muestra ${i + 1}.`)
    process.exit(1)
  }
  tiempos.push(performance.now() - inicio)
}

const p50 = percentil(tiempos, 50)
const p95 = percentil(tiempos, 95)
console.log(
  `${RUTA} · ${MUESTRAS} muestras · p50 ${p50.toFixed(0)} ms · p95 ${p95.toFixed(0)} ms · limite ${LIMITE_MS} ms`,
)

if (p95 > LIMITE_MS) {
  console.error(`p95 por encima del limite de RNF-06 (${LIMITE_MS} ms).`)
  process.exit(1)
}
