// db:drift multiplataforma: los guiones de npm no expanden variables igual en
// Windows y en Linux, asi que la sombra se pasa desde aca (I-01).
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

if (existsSync('.env')) process.loadEnvFile('.env')

const sombra = process.env.SHADOW_DATABASE_URL
if (!sombra) {
  console.error('Falta SHADOW_DATABASE_URL (ver .env.example).')
  process.exit(1)
}

const { status } = spawnSync(
  'npx',
  [
    'prisma',
    'migrate',
    'diff',
    '--from-migrations',
    'prisma/migrations',
    '--to-schema-datamodel',
    'prisma/schema.prisma',
    '--shadow-database-url',
    sombra,
    '--exit-code',
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' },
)

// 2 = hay diferencias entre migraciones y esquema: eso es deriva.
if (status === 2) {
  console.error(
    '\nDeriva: el esquema y las migraciones no coinciden. Generar la migracion faltante.',
  )
  process.exit(1)
}
process.exit(status ?? 1)
