import type { AccesoVigente, RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import type { Rol } from '@/dominio/identidad/rol'
import { NoEncontrado, RolInsuficiente } from '@/compartido/errores'
import { enConsorcio } from '@/infraestructura/cliente-aislado'

/**
 * El unico lugar que autoriza (FR-002, FR-003, FR-007c).
 *
 * Orden que ningun caso de uso puede alterar: primero se resuelve el acceso
 * vigente —por plataforma, por administradora o por el consorcio mismo—,
 * despues se abre el contexto de aislamiento, y recien ahi corre el trabajo.
 * Saltearse cualquiera de los dos pasos es un defecto de aislamiento, no un
 * descuido de estilo.
 *
 * Sin acceso se lanza «no encontrado», nunca «prohibido»: decir «prohibido»
 * revela que el recurso existe (SC-002).
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
  trabajo: (acceso: AccesoVigente) => Promise<T>,
): Promise<T> {
  const acceso = await repositorio.accesoVigente(
    contexto.usuarioId,
    contexto.consorcioId,
    reloj.hoy(),
  )

  if (!acceso) throw new NoEncontrado()

  // Un usuario puede traer varios roles sobre el mismo consorcio: el consejo se
  // suma a consorcista. Alcanza con que uno de los suyos este permitido.
  if (
    contexto.rolesPermitidos &&
    !acceso.roles.some((rol) => contexto.rolesPermitidos!.includes(rol))
  ) {
    throw new RolInsuficiente(contexto.accion)
  }

  return enConsorcio(contexto.consorcioId, () => trabajo(acceso))
}

/**
 * Autorizacion de plataforma (FR-007b): para lo que no cuelga de un consorcio,
 * como dar de alta una administradora o un consorcio.
 *
 * No se abre contexto de aislamiento: quien opera aca trabaja por encima de el,
 * y por eso el rol es escaso, vence y queda auditado.
 */
export async function conAutorizacionDePlataforma<T>(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  contexto: { usuarioId: string; accion: string },
  trabajo: () => Promise<T>,
): Promise<T> {
  if (!(await repositorio.esSuperAdministrador(contexto.usuarioId, reloj.hoy()))) {
    throw new RolInsuficiente(contexto.accion)
  }

  return trabajo()
}
