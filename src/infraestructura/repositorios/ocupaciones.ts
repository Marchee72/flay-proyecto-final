import type { Prisma, PrismaClient } from '@prisma/client'

import { ordenarUnidades } from '@/dominio/unidades/division'
import { prismaBase } from '@/infraestructura/prisma'

/**
 * Ocupaciones (FR-008). La vigencia es un **rango de fechas** de la base y no
 * dos columnas: es lo que permite la restriccion de exclusion que impide dos
 * inquilinos vigentes sobre la misma unidad (regla RN-09, research R-04).
 *
 * El mapeador no modela ese tipo, asi que las consultas van crudas. Quedan
 * encerradas aca: ninguna capa de arriba escribe SQL.
 */

export type TipoDeOcupacion = 'propietario' | 'inquilino'

export interface OcupacionNueva {
  unidadId: string
  personaId: string
  tipo: TipoDeOcupacion
  desde: Date
  /** Nulo: sin vencimiento. El rango queda abierto por la derecha. */
  hasta: Date | null
}

/**
 * Inserta la ocupacion. Si se superpone con otro inquilino vigente, **la base**
 * la rechaza por exclusion; no hay verificacion previa que se pueda saltear.
 */
export async function registrarOcupacion(
  ocupacion: OcupacionNueva,
  cliente: Prisma.TransactionClient | PrismaClient = prismaBase,
): Promise<{ ocupacionId: string }> {
  const [fila] = await cliente.$queryRaw<{ id: string }[]>`
    INSERT INTO "Ocupacion" ("unidad_id", "persona_id", "tipo", "vigencia", "actualizado_en")
    VALUES (
      ${ocupacion.unidadId}::uuid,
      ${ocupacion.personaId}::uuid,
      ${ocupacion.tipo}::"TipoOcupacion",
      daterange(${ocupacion.desde}::date, ${ocupacion.hasta}::date, '[)'),
      CURRENT_TIMESTAMP
    )
    RETURNING id
  `

  return { ocupacionId: fila.id }
}

/** Personas con ocupacion vigente sobre la unidad a esa fecha, por tipo. */
export async function ocupantesVigentes(
  unidadId: string,
  tipo: TipoDeOcupacion,
  fecha: Date,
): Promise<string[]> {
  const filas = await prismaBase.$queryRaw<{ persona_id: string }[]>`
    SELECT "persona_id" FROM "Ocupacion"
    WHERE "unidad_id" = ${unidadId}::uuid
      AND "tipo" = ${tipo}::"TipoOcupacion"
      AND "vigencia" @> ${fecha}::date
  `

  return filas.map((fila) => fila.persona_id)
}

/** Si el usuario (por su persona) ocupa la unidad a esa fecha, con cualquier tipo. */
export async function ocupaUnidad(
  usuarioId: string,
  unidadId: string,
  fecha: Date,
): Promise<boolean> {
  const filas = await prismaBase.$queryRaw<{ existe: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM "Ocupacion" o
      JOIN "Usuario" u ON u."persona_id" = o."persona_id"
      WHERE o."unidad_id" = ${unidadId}::uuid
        AND u."id" = ${usuarioId}::uuid
        AND o."vigencia" @> ${fecha}::date
    ) AS existe`

  return filas[0]?.existe === true
}

/** Las unidades del consorcio que el usuario ocupa a esa fecha: lo que puede elegir en un formulario. */
export async function unidadesOcupadasPor(
  usuarioId: string,
  consorcioId: string,
  fecha: Date,
): Promise<{ id: string; designacion: string }[]> {
  const filas = await prismaBase.$queryRaw<{ id: string; designacion: string }[]>`
    SELECT un."id", un."designacion" FROM "Ocupacion" o
    JOIN "Usuario" u ON u."persona_id" = o."persona_id"
    JOIN "Unidad" un ON un."id" = o."unidad_id"
    WHERE u."id" = ${usuarioId}::uuid
      AND un."consorcio_id" = ${consorcioId}::uuid
      AND o."vigencia" @> ${fecha}::date`
  return ordenarUnidades(filas)
}

/**
 * Los usuarios que ocupan alguna de esas unidades a esa fecha. Los ids tienen
 * que venir de una consulta ya aislada: esto no filtra por consorcio.
 */
export async function usuariosQueOcupan(
  unidadIds: readonly string[],
  fecha: Date,
): Promise<string[]> {
  if (unidadIds.length === 0) return []
  const filas = await prismaBase.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT u."id" FROM "Ocupacion" o
    JOIN "Usuario" u ON u."persona_id" = o."persona_id"
    WHERE o."unidad_id" = ANY(${unidadIds}::uuid[])
      AND o."vigencia" @> ${fecha}::date`
  return filas.map((fila) => fila.id)
}

export interface Ocupante {
  tipo: TipoDeOcupacion
  nombre: string
  telefono: string | null
  correo: string | null
}

/**
 * Quienes ocupan cada unidad a esa fecha, propietario primero. Los ids tienen
 * que venir de una consulta ya aislada: esto no filtra por consorcio.
 */
export async function ocupantesVigentesDe(
  unidadIds: readonly string[],
  fecha: Date,
): Promise<Map<string, Ocupante[]>> {
  if (unidadIds.length === 0) return new Map()

  const filas = await prismaBase.$queryRaw<
    {
      unidad_id: string
      tipo: TipoDeOcupacion
      nombre: string
      apellido: string
      telefono: string | null
      correo: string | null
    }[]
  >`
    SELECT o."unidad_id", o."tipo", p."nombre", p."apellido", p."telefono", p."correo"
    FROM "Ocupacion" o
    JOIN "Persona" p ON p."id" = o."persona_id"
    WHERE o."unidad_id" = ANY(${unidadIds}::uuid[])
      AND o."vigencia" @> ${fecha}::date
    ORDER BY o."tipo", p."apellido", p."nombre"`

  const porUnidad = new Map<string, Ocupante[]>()
  for (const fila of filas) {
    porUnidad.set(fila.unidad_id, [
      ...(porUnidad.get(fila.unidad_id) ?? []),
      {
        tipo: fila.tipo,
        nombre: `${fila.nombre} ${fila.apellido}`,
        telefono: fila.telefono,
        correo: fila.correo,
      },
    ])
  }
  return porUnidad
}

/**
 * Quién ocupa cada unidad a esa fecha, plano y sin datos de contacto: lo que
 * necesita la nómina para poner «1A · propietario». Los ids tienen que venir
 * de una consulta ya aislada: esto no filtra por consorcio.
 */
export async function ocupacionesVigentesDe(
  unidadIds: string[],
  fecha: Date,
): Promise<{ unidadId: string; personaId: string; tipo: TipoDeOcupacion }[]> {
  if (unidadIds.length === 0) return []
  const filas = await prismaBase.$queryRaw<
    { unidad_id: string; persona_id: string; tipo: TipoDeOcupacion }[]
  >`
    SELECT "unidad_id", "persona_id", "tipo" FROM "Ocupacion"
    WHERE "unidad_id" = ANY(${unidadIds}::uuid[])
      AND "vigencia" @> ${fecha}::date`
  return filas.map((f) => ({ unidadId: f.unidad_id, personaId: f.persona_id, tipo: f.tipo }))
}

export interface PropietarioVigente {
  unidadId: string
  personaId: string
  /** Nulo: la persona no tiene cuenta en Flay. */
  usuarioId: string | null
  nombre: string
  correo: string | null
}

/**
 * Los **propietarios** vigentes de esas unidades a esa fecha, con su usuario si
 * lo tienen (016: convocatoria, poderes, acreditacion, oposicion). Varios por
 * unidad es el condominio. Los ids tienen que venir de una consulta ya
 * aislada: esto no filtra por consorcio.
 */
export async function propietariosVigentesDe(
  unidadIds: readonly string[],
  fecha: Date,
): Promise<PropietarioVigente[]> {
  if (unidadIds.length === 0) return []
  const filas = await prismaBase.$queryRaw<
    {
      unidad_id: string
      persona_id: string
      usuario_id: string | null
      nombre: string
      apellido: string
      correo: string | null
    }[]
  >`
    SELECT o."unidad_id", o."persona_id", u."id" AS usuario_id, p."nombre", p."apellido",
           COALESCE(p."correo", u."correo") AS correo
    FROM "Ocupacion" o
    JOIN "Persona" p ON p."id" = o."persona_id"
    LEFT JOIN "Usuario" u ON u."persona_id" = o."persona_id"
    WHERE o."unidad_id" = ANY(${unidadIds}::uuid[])
      AND o."tipo" = 'propietario'
      AND o."vigencia" @> ${fecha}::date
    ORDER BY p."apellido", p."nombre"`
  return filas.map((f) => ({
    unidadId: f.unidad_id,
    personaId: f.persona_id,
    usuarioId: f.usuario_id,
    nombre: `${f.nombre} ${f.apellido}`.trim(),
    correo: f.correo,
  }))
}
