import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { prismaBase } from '@/infraestructura/prisma'

/**
 * Los consorcios que el usuario alcanza, por cualquiera de los tres niveles
 * (FR-007c). Es lo que llena el selector de consorcio activo: la pantalla no
 * decide el alcance, lo lee de aca.
 *
 * Va contra el cliente crudo porque justamente **resuelve** el alcance y no
 * puede estar sujeto a el, igual que el repositorio de habilitaciones.
 */
export async function misConsorcios(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  usuarioId: string,
): Promise<{ id: string; nombre: string }[]> {
  const alcanzables = await repositorio.consorciosDe(usuarioId, reloj.hoy())

  if (alcanzables.length === 0) return []

  return prismaBase.consorcio.findMany({
    where: { id: { in: alcanzables } },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  })
}

/**
 * Los roles que el usuario tiene sobre un consorcio, para que la pantalla no
 * ofrezca lo que el rol no puede hacer (RNF-03). **No autoriza nada**: la
 * autorizacion sigue estando en el caso de uso, contra la base, en cada
 * operacion. Esto solo decide que se dibuja.
 */
export async function rolesEn(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  usuarioId: string,
  consorcioId: string,
): Promise<string[]> {
  const acceso = await repositorio.accesoVigente(usuarioId, consorcioId, reloj.hoy())
  return acceso?.roles ?? []
}
