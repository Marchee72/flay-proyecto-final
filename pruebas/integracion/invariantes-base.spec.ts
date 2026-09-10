import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { prismaBase } from '@/infraestructura/prisma'

import { crearAdministradora, crearConsorcio, limpiar } from './ayudas'

/**
 * SC-004b y SC-005: los dos invariantes que **la base** impone.
 *
 * Todo lo de este archivo se saltea la capa de aplicacion a proposito. Si estas
 * pruebas pasaran por los casos de uso no probarian nada: probarian el codigo
 * que ya se prueba en otro lado, y dejarian abierto justamente el camino que
 * preocupa —una migracion, una correccion manual, una consulta cruda—.
 */

let consorcioId: string
let unidadA: string
let unidadB: string
let personaId: string

/** Alta directa de dos unidades que suman 100, en una sola transaccion. */
async function cargarUnidades(): Promise<void> {
  await prismaBase.$transaction(async (tx) => {
    const [a] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "Unidad" ("consorcio_id", "designacion", "coeficiente", "actualizado_en")
      VALUES (${consorcioId}::uuid, '1A', 50.00000000, CURRENT_TIMESTAMP) RETURNING id`
    const [b] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "Unidad" ("consorcio_id", "designacion", "coeficiente", "actualizado_en")
      VALUES (${consorcioId}::uuid, '1B', 50.00000000, CURRENT_TIMESTAMP) RETURNING id`
    unidadA = a.id
    unidadB = b.id
  })
}

const sumaDelConsorcio = async (): Promise<string> => {
  const [fila] = await prismaBase.$queryRaw<{ suma: string }[]>`
    SELECT to_char(COALESCE(SUM("coeficiente"), 0), 'FM990.00000000') AS suma
    FROM "Unidad" WHERE "consorcio_id" = ${consorcioId}::uuid`
  return fila.suma
}

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Invariantes 100')).id
  personaId = (await prismaBase.persona.create({ data: { nombre: 'Ana', apellido: 'Diaz' } })).id
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Ocupacion"`
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await prismaBase.$executeRaw`DELETE FROM "Unidad"`
  await limpiar()
})

describe('suma de coeficientes impuesta por la base (regla RN-01)', () => {
  it('un consorcio sin ninguna unidad no es rechazado (FR-011c)', async () => {
    // El consorcio ya existe y no tiene unidades: nada que verificar.
    await expect(sumaDelConsorcio()).resolves.toBe('0.00000000')
  })

  it('una sola unidad al 99.99999999 es rechazada al confirmar (SC-004)', async () => {
    await expect(
      prismaBase.$executeRaw`
        INSERT INTO "Unidad" ("consorcio_id", "designacion", "coeficiente", "actualizado_en")
        VALUES (${consorcioId}::uuid, 'CASI', 99.99999999, CURRENT_TIMESTAMP)`,
    ).rejects.toThrow(/RN-01/)

    await expect(sumaDelConsorcio()).resolves.toBe('0.00000000')
  })

  it('N unidades en una transaccion pasan aunque las intermedias no cuadren', async () => {
    // Es la razon de que el disparador sea diferido: con verificacion inmediata
    // la primera unidad de un alta de doce ya seria un rechazo.
    await cargarUnidades()
    await expect(sumaDelConsorcio()).resolves.toBe('100.00000000')
  })

  it('dos transacciones simultaneas no pueden dejar la suma fuera de 100 (SC-004b)', async () => {
    await cargarUnidades()

    // Conexiones distintas: sin esto no habria concurrencia real, seria una cola.
    const uno = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
    const dos = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

    // Cada una baja **su** unidad a 40 dando por sentado que la otra sube a 60.
    // Por separado cada intencion es razonable; juntas dejarian 90.
    const bajar = (cliente: PrismaClient, unidadId: string) =>
      cliente.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE "Unidad" SET "coeficiente" = 40.00000000 WHERE "id" = ${unidadId}::uuid`
      })

    try {
      const resultados = await Promise.allSettled([bajar(uno, unidadA), bajar(dos, unidadB)])

      expect(resultados.filter((r) => r.status === 'rejected').length).toBeGreaterThanOrEqual(1)
      await expect(sumaDelConsorcio()).resolves.toBe('100.00000000')
    } finally {
      await uno.$disconnect()
      await dos.$disconnect()
    }
  })
})

describe('superposicion de ocupaciones impuesta por la base (regla RN-09)', () => {
  const ocupar = (tipo: 'propietario' | 'inquilino', persona: string, desde: string) =>
    prismaBase.$executeRaw`
      INSERT INTO "Ocupacion" ("unidad_id", "persona_id", "tipo", "vigencia", "actualizado_en")
      VALUES (
        ${unidadA}::uuid, ${persona}::uuid, ${tipo}::"TipoOcupacion",
        daterange(${desde}::date, NULL, '[)'), CURRENT_TIMESTAMP)`

  beforeEach(cargarUnidades)

  it('un segundo inquilino vigente sobre la misma unidad es rechazado (SC-005)', async () => {
    const otra = await prismaBase.persona.create({ data: { nombre: 'Luis', apellido: 'Paz' } })

    await ocupar('inquilino', personaId, '2026-01-01')

    await expect(ocupar('inquilino', otra.id, '2026-06-01')).rejects.toThrow(
      /Ocupacion_inquilino_sin_superposicion|exclusion/i,
    )
  })

  it('dos propietarios vigentes si: eso es el condominio, no un error', async () => {
    const otra = await prismaBase.persona.create({ data: { nombre: 'Eva', apellido: 'Paz' } })

    await ocupar('propietario', personaId, '2026-01-01')
    await expect(ocupar('propietario', otra.id, '2026-01-01')).resolves.toBe(1)
  })

  it('un inquilino nuevo entra si el anterior ya cerro', async () => {
    const otra = await prismaBase.persona.create({ data: { nombre: 'Sol', apellido: 'Paz' } })

    await prismaBase.$executeRaw`
      INSERT INTO "Ocupacion" ("unidad_id", "persona_id", "tipo", "vigencia", "actualizado_en")
      VALUES (
        ${unidadA}::uuid, ${personaId}::uuid, 'inquilino'::"TipoOcupacion",
        daterange('2026-01-01'::date, '2026-07-01'::date, '[)'), CURRENT_TIMESTAMP)`

    await expect(ocupar('inquilino', otra.id, '2026-07-01')).resolves.toBe(1)
  })
})

describe('auditoria de las tablas de esta historia (FR-025)', () => {
  it('el alta de una unidad deja asiento con imagen posterior', async () => {
    await cargarUnidades()

    const asientos = await prismaBase.bitacoraAuditoria.findMany({
      where: { tabla: 'Unidad', clave: unidadA },
    })

    expect(asientos).toHaveLength(1)
    expect(asientos[0].operacion).toBe('INSERTA')
    expect(asientos[0].posterior).toMatchObject({ designacion: '1A' })
  })
})
