import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { prismaBase } from '@/infraestructura/prisma'

/**
 * Las administradoras que el usuario alcanza. El super administrador de
 * plataforma las alcanza todas: es quien da de alta consorcios en cualquiera
 * (FR-007b). El resto, solo aquellas donde tiene habilitacion de empresa.
 */
export async function misAdministradoras(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  usuarioId: string,
): Promise<{ id: string; razonSocial: string }[]> {
  const hoy = reloj.hoy()
  const seleccion = { id: true, razonSocial: true }
  const orden = { razonSocial: 'asc' } as const

  if (await repositorio.esSuperAdministrador(usuarioId, hoy)) {
    return prismaBase.administradora.findMany({ select: seleccion, orderBy: orden })
  }

  const alcanzables = await repositorio.administradorasDe(usuarioId, hoy)

  if (alcanzables.length === 0) return []

  return prismaBase.administradora.findMany({
    where: { id: { in: alcanzables } },
    select: seleccion,
    orderBy: orden,
  })
}
