import type { PersonaConocida } from '@/dominio/importacion/personas'
import { prismaBase } from '@/infraestructura/prisma'

/**
 * Personas ya guardadas que coinciden por correo (el de la persona o el de su
 * usuario) o por DNI. Global, no aislado: una persona no pertenece a un consorcio.
 * Los correos vienen en minúsculas (`identificadoresDePersonas`).
 */
export async function personasConocidas(
  correos: readonly string[],
  dnis: readonly string[],
): Promise<PersonaConocida[]> {
  if (correos.length === 0 && dnis.length === 0) return []
  const filas = await prismaBase.$queryRaw<
    {
      id: string
      nombre: string
      apellido: string
      documento: string | null
      correo: string | null
    }[]
  >`
    SELECT p."id", p."nombre", p."apellido", p."documento",
           COALESCE(p."correo", u."correo") AS correo
    FROM "Persona" p
    LEFT JOIN "Usuario" u ON u."persona_id" = p."id"
    WHERE lower(p."correo") = ANY(${correos}::text[])
       OR lower(u."correo") = ANY(${correos}::text[])
       OR p."documento" = ANY(${dnis}::text[])`
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    apellido: f.apellido,
    dni: f.documento,
    correo: f.correo,
  }))
}
