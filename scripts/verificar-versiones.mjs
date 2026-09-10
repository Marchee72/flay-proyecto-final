// FR-023: §14.1 se verifica contra package-lock.json, no se descubre despues.
// Si alguien actualiza una dependencia y no toca el documento, esto lo detiene.
import { readFileSync } from 'node:fs'

const DOCUMENTO = 'docs/entrega-final/14-codificacion.md'

// Lo que §14.1 compromete, con el nombre con que aparece en el documento.
const COMPROMETIDAS = [
  'next',
  'prisma',
  '@prisma/client',
  'zod',
  'next-auth',
  '@node-rs/argon2',
  'decimal.js',
  '@react-pdf/renderer',
  'recharts',
  'lucide-react',
  '@vercel/blob',
  'resend',
  'vitest',
  '@vitest/coverage-v8',
  '@playwright/test',
  '@axe-core/playwright',
  'eslint',
  'prettier',
  'eslint-config-prettier',
  '@typescript-eslint/parser',
]

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const documento = readFileSync(DOCUMENTO, 'utf8')

const faltantes = []
const instaladas = []

for (const paquete of COMPROMETIDAS) {
  const entrada = lock.packages?.[`node_modules/${paquete}`]
  if (!entrada) {
    faltantes.push(`${paquete}: no esta en package-lock.json`)
    continue
  }
  instaladas.push(`${paquete} ${entrada.version}`)
  if (!documento.includes(entrada.version)) {
    faltantes.push(`${paquete} ${entrada.version}: §14.1 no menciona esa version`)
  }
}

// La tabla no puede quedar con celdas sin decidir (SC-009).
const seccion = documento.slice(
  documento.indexOf('## 14.1'),
  documento.indexOf('## 14.2') === -1 ? undefined : documento.indexOf('## 14.2'),
)
if (/A fijar/i.test(seccion)) {
  faltantes.push('§14.1 todavia tiene celdas «A fijar»')
}

console.log(instaladas.join(' · '))

if (faltantes.length > 0) {
  console.error('\n§14.1 no coincide con package-lock.json:')
  for (const falta of faltantes) console.error(`  - ${falta}`)
  process.exit(1)
}

console.log(`\n§14.1 coincide con package-lock.json: ${instaladas.length} dependencias.`)
