import type {
  HabilitacionVigente,
  RepositorioHabilitaciones,
} from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import type { Rol } from '@/dominio/identidad/rol'
import { NoEncontrado, RolInsuficiente } from '@/compartido/errores'
import { enConsorcio } from '@/infraestructura/cliente-aislado'

/**
 * El unico lugar que autoriza (FR-002, FR-003).
 *
 * Orden que ningun caso de uso puede alterar: primero se verifica la
 * habilitacion vigente por par (rol, consorcio), despues se abre el contexto de
 * aislamiento, y recien ahi corre el trabajo. Saltearse cualquiera de los dos
 * pasos es un defecto de aislamiento, no un descuido de estilo.
 *
 * Sin habilitacion se lanza «no encontrado», nunca «prohibido»: decir
 * «prohibido» revela que el recurso existe (SC-002).
 */
export async function conAutorizacion<T>(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  contexto: {
    usuarioId: string
    consorcioId: string
    rolesPermitidos?: readonly Rol[]
    accion: string
  },
  trabajo: (habilitacion: HabilitacionVigente) => Promise<T>,
): Promise<T> {
  const habilitacion = await repositorio.vigente(
    contexto.usuarioId,
    contexto.consorcioId,
    reloj.hoy(),
  )

  if (!habilitacion) throw new NoEncontrado()

  if (contexto.rolesPermitidos && !contexto.rolesPermitidos.includes(habilitacion.rol)) {
    throw new RolInsuficiente(contexto.accion)
  }

  return enConsorcio(contexto.consorcioId, () => trabajo(habilitacion))
}
