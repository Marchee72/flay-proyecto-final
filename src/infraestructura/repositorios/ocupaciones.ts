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
): Promise<{ ocupacionId: string }> {
  const [fila] = await prismaBase.$queryRaw<{ id: string }[]>`
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
