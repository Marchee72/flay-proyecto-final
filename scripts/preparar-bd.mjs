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

// Las mismas tres que declara la migracion inicial (FR-010).
const EXTENSIONES = ['vector', 'btree_gist', 'pgcrypto']

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

// Lo que un proveedor administrado puede negar: se avisa y se sigue. Lo que no
// se puede negar —que flay_app no escriba la bitacora— lo impone la migracion.
const intentar = async (sql, queEs) => {
  try {
    await prisma.$executeRawUnsafe(sql)
  } catch (error) {
    console.warn(
      `Aviso: ${queEs} no se pudo aplicar (codigo ${error.meta?.code ?? 'desconocido'}).`,
    )
  }
}

try {
  await prisma.$executeRawUnsafe(rol('flay_owner', CLAVE_OWNER))
  await prisma.$executeRawUnsafe(rol('flay_app', CLAVE_APP))

  // Para ceder la propiedad hay que ser miembro del rol que la recibe.
  await intentar('GRANT flay_owner TO CURRENT_USER;', 'membresia en flay_owner')
  await intentar('GRANT flay_app TO CURRENT_USER;', 'membresia en flay_app')

  // El propietario manda sobre el esquema; la aplicacion solo lo usa.
  await intentar(`ALTER DATABASE "${BASE}" OWNER TO flay_owner;`, 'propiedad de la base')
  await intentar('ALTER SCHEMA public OWNER TO flay_owner;', 'propiedad del esquema public')
  await prisma.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${BASE}" TO flay_app;`)
  await intentar('REVOKE CREATE ON SCHEMA public FROM PUBLIC;', 'quitar CREATE a PUBLIC')

  // Las extensiones exigen superusuario en un PostgreSQL comun, y flay_owner no
  // lo es. Se crean aca, con la cadena administradora; la migracion las declara
  // igual con IF NOT EXISTS (FR-010), que sin privilegios es un no-op.
  for (const extension of EXTENSIONES) {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS ${extension};`)
  }

  const existe = await prisma.$queryRawUnsafe(
    `SELECT 1 AS hay FROM pg_database WHERE datname = '${SOMBRA}'`,
  )
  if (existe.length === 0) {
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${SOMBRA}" OWNER flay_owner;`)
  }

  // La sombra replica las migraciones para detectar deriva: necesita las mismas
  // extensiones, y tampoco puede crearlas flay_owner.
  const urlSombra = new URL(admin)
  urlSombra.pathname = `/${SOMBRA}`
  const sombra = new PrismaClient({ datasourceUrl: urlSombra.toString() })
  try {
    for (const extension of EXTENSIONES) {
      await sombra.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS ${extension};`)
    }
  } finally {
    await sombra.$disconnect()
  }

  console.log(
    `Roles flay_owner/flay_app listos; extensiones creadas; base sombra ${SOMBRA} disponible.`,
  )
} finally {
  await prisma.$disconnect()
}
