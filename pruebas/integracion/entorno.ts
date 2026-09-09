import { existsSync } from 'node:fs'

// Vitest no lee .env; Node 22 si. Sin dependencia extra.
if (!process.env.DATABASE_URL && existsSync('.env')) {
  process.loadEnvFile('.env')
}

if (!process.env.DATABASE_URL) {
  throw new Error('Las pruebas de integracion necesitan DATABASE_URL (ver .env.example).')
}
