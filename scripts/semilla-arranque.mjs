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

  // El administrador necesita al menos una habilitacion para poder operar, y
  // una habilitacion necesita un consorcio: el primero lo crea la semilla.
  const consorcio =
    (await prisma.consorcio.findFirst({ orderBy: { creadoEn: 'asc' } })) ??
    (await prisma.consorcio.create({
      data: {
        nombre: process.env.CONSORCIO_SEMILLA_NOMBRE ?? 'Consorcio inicial',
        direccion: process.env.CONSORCIO_SEMILLA_DIRECCION ?? 'A completar',
        localidad: process.env.CONSORCIO_SEMILLA_LOCALIDAD ?? 'Rosario',
        cuit: process.env.CONSORCIO_SEMILLA_CUIT ?? '30-00000000-0',
      },
    }))

  await prisma.$transaction(async (tx) => {
    const persona = await tx.persona.create({
      data: { nombre: 'Administrador', apellido: 'inicial', correo },
    })

    const usuario = await tx.usuario.create({
      data: {
        personaId: persona.id,
        correo,
        estado: 'activo',
        claveDerivada: await hash(clave, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
      },
    })

    await tx.habilitacion.create({
      data: {
        usuarioId: usuario.id,
        consorcioId: consorcio.id,
        rol: 'administrador',
        vigenciaDesde: new Date(),
      },
    })
  })

  console.log(`Administrador ${correo} creado sobre el consorcio "${consorcio.nombre}".`)
  console.log('Rotá la clave de la semilla apenas entres por primera vez.')
} finally {
  await prisma.$disconnect()
}
