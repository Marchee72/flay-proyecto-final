import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'

/**
 * Si el usuario administra al menos un consorcio: decide si el panel ofrece la
 * Bandeja, que junta lo pendiente de los consorcios administrados (RNF-03).
 * **No autoriza nada**, como `rolesEn`: solo decide que se dibuja. Corta en el
 * primero que encuentra.
 */
export async function administraAlguno(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  usuarioId: string,
): Promise<boolean> {
  const hoy = reloj.hoy()
  for (const consorcioId of await repositorio.consorciosDe(usuarioId, hoy)) {
    const acceso = await repositorio.accesoVigente(usuarioId, consorcioId, hoy)
    if (acceso?.roles.includes('administrador')) return true
  }
  return false
}
