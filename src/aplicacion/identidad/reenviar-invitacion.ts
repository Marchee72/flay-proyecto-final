import { conAutorizacion } from '@/aplicacion/autorizacion'
import { drenar, reintentarAhora } from '@/aplicacion/pendientes/drenar'
import { MANEJADORES } from '@/aplicacion/pendientes/manejadores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'

/**
 * Reenvio explicito del administrador (FR-006b, SC-013b): adelanta el proximo
 * intento y **despacha en el acto**, sin esperar la espera creciente. Es la
 * salida cuando el correo se perdio y el invitado no puede entrar.
 *
 * Si el proveedor vuelve a fallar, el drenaje lo anota y lo deja pendiente: el
 * reenvio no lanza, para que la pantalla muestre el estado en vez de un error.
 */
export async function reenviarInvitacion(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; trabajoId: string },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'reenviar invitaciones',
    },
    async () => {
      await reintentarAhora(datos.trabajoId)
      await drenar(MANEJADORES)
    },
  )
}
