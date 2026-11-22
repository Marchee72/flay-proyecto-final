import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { unidadesPropias } from '@/aplicacion/liquidacion/ver-expensa'
import { enConsorcio } from '@/infraestructura/cliente-aislado'
import { prismaBase } from '@/infraestructura/prisma'

import { vigentes } from './mis-consorcios'

/**
 * Las designaciones de las unidades que el usuario ocupa hoy, por consorcio
 * vigente (RF-03): decide si al entrar se elige edificio y que dice cada
 * tarjeta. **No autoriza nada**, como `rolesEn`. Cada consorcio se lee dentro
 * de su propio aislamiento (RN-12): ningun `IN` armado a mano. Los consorcios
 * sin unidades no van en el mapa.
 *
 * Sin ninguna ocupacion vigente no se recorre nada: `/` lo pide en cada
 * ingreso, y quien administra una cartera grande no es dueño de ninguna unidad.
 */
export async function misUnidadesPorConsorcio(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  usuarioId: string,
): Promise<Map<string, string[]>> {
  const [ocupa] = await prismaBase.$queryRaw<{ uno: number }[]>`
    SELECT 1 AS uno FROM "Ocupacion" o JOIN "Usuario" u ON u.persona_id = o.persona_id
    WHERE u.id = ${usuarioId}::uuid AND o.vigencia @> ${reloj.hoy()}::date
    LIMIT 1
  `
  if (!ocupa) return new Map()

  const consorcios = await vigentes(repositorio, reloj, usuarioId)
  const filas = await Promise.all(
    consorcios.map(async ({ id }) => {
      const unidades = await enConsorcio(id, () => unidadesPropias(usuarioId, reloj.hoy()))
      return [id, unidades.map((u) => u.designacion)] as const
    }),
  )
  return new Map(filas.filter(([, designaciones]) => designaciones.length > 0))
}
