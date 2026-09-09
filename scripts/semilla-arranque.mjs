// Semilla de arranque (FR-005, cierra el hueco H-08): crea el unico
// administrador inicial y su primera habilitacion. Idempotente: correrla dos
// veces no duplica nada ni pisa la contrasena de nadie.
//
// La contrasena viene de variable de entorno y no se versiona jamas. Conviene
// rotarla apenas el administrador entra por primera vez.
import { existsSync } from 'node:fs'

import { hash } from '@node-rs/argon2'
import { PrismaClient } from '@prisma/client'

if (existsSync('.env')) process.loadEnvFile('.env')

const correo = process.env.ADMIN_SEMILLA_CORREO?.trim().toLowerCase()
const clave = process.env.ADMIN_SEMILLA_CLAVE

if (!correo || !clave) {
  console.error('Faltan ADMIN_SEMILLA_CORREO y ADMIN_SEMILLA_CLAVE (ver .env.example).')
  process.exit(1)
}

if (clave.length < 12) {
  console.error('La clave de la semilla tiene menos de 12 caracteres.')
  process.exit(1)
}

const prisma = new PrismaClient()

try {
  const existente = await prisma.usuario.findUnique({ where: { correo } })

  if (existente) {
    console.log(`El administrador ${correo} ya existe: no se toca nada.`)
    process.exit(0)
  }

  // El administrador de arranque es **de cartera**: el cuarto rol, el que da de
  // alta consorcios. No se le inventa un consorcio de mentira; crea el primero
  // desde la aplicacion (FR-007b).
  await prisma.$transaction(async (tx) => {
    const persona = await tx.persona.create({
      data: { nombre: 'Administrador', apellido: 'de cartera', correo },
    })

    const usuario = await tx.usuario.create({
      data: {
        personaId: persona.id,
        correo,
        estado: 'activo',
        claveDerivada: await hash(clave, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
      },
    })

    await tx.habilitacionCartera.create({
      data: { usuarioId: usuario.id, vigenciaDesde: new Date() },
    })
  })

  console.log(`Administrador de cartera ${correo} creado. Ya puede dar de alta consorcios.`)
  console.log('Rotá la clave de la semilla apenas entres por primera vez.')
} finally {
  await prisma.$disconnect()
}
