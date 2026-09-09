// Roles y base sombra, idempotentes (I-02, M-06).
// Corre igual en Windows local y en el runner de CI: sin psql, con el cliente
// que el proyecto ya tiene. Usa la cadena administradora, la unica con permiso
// de crear roles; la aplicacion nunca la ve.
import { existsSync } from 'node:fs'

import { PrismaClient } from '@prisma/client'

if (existsSync('.env')) process.loadEnvFile('.env')

const admin = process.env.ADMIN_DATABASE_URL
if (!admin) {
  console.error('Falta ADMIN_DATABASE_URL (ver .env.example).')
  process.exit(1)
}

const CLAVE_OWNER = process.env.FLAY_OWNER_PASSWORD ?? 'flay_local'
const CLAVE_APP = process.env.FLAY_APP_PASSWORD ?? 'flay_local'
const BASE = process.env.FLAY_DB ?? 'flay'
const SOMBRA = process.env.FLAY_DB_SOMBRA ?? 'flay_shadow'

const prisma = new PrismaClient({ datasourceUrl: admin })

const rol = (nombre, clave) => `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${nombre}') THEN
    CREATE ROLE ${nombre} LOGIN PASSWORD '${clave}';
  ELSE
    ALTER ROLE ${nombre} LOGIN PASSWORD '${clave}';
  END IF;
END
$$;`

try {
  await prisma.$executeRawUnsafe(rol('flay_owner', CLAVE_OWNER))
  await prisma.$executeRawUnsafe(rol('flay_app', CLAVE_APP))

  // El propietario manda sobre el esquema; la aplicacion solo lo usa.
  await prisma.$executeRawUnsafe(`ALTER DATABASE "${BASE}" OWNER TO flay_owner;`)
  await prisma.$executeRawUnsafe(`ALTER SCHEMA public OWNER TO flay_owner;`)
  await prisma.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${BASE}" TO flay_app;`)
  await prisma.$executeRawUnsafe(`REVOKE CREATE ON SCHEMA public FROM PUBLIC;`)

  const existe = await prisma.$queryRawUnsafe(
    `SELECT 1 AS hay FROM pg_database WHERE datname = '${SOMBRA}'`,
  )
  if (existe.length === 0) {
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${SOMBRA}" OWNER flay_owner;`)
  }

  console.log(`Roles flay_owner/flay_app listos; base sombra ${SOMBRA} disponible.`)
} finally {
  await prisma.$disconnect()
}
