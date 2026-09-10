import type { Reloj } from '@/dominio/contratos/reloj'
import type { Rol } from '@/dominio/identidad/rol'
import { prismaBase } from '@/infraestructura/prisma'

/**
 * Otorgar y revocar habilitaciones (FR-007). Ambas son de administrador; quien
 * las llama pasa antes por `conAutorizacion`.
 */

export async function otorgarHabilitacion(datos: {
  usuarioId: string
  consorcioId: string
  rol: Rol
  vigenciaDesde: Date
}) {
  return prismaBase.habilitacion.create({ data: datos })
}

/**
 * Revocar cierra la vigencia a hoy, no borra la fila: la habilitacion que
 * existio queda como registro. El efecto es inmediato porque la autorizacion se
 * evalua en cada operacion y no al iniciar sesion (FR-004).
 */
export async function revocarHabilitacion(reloj: Reloj, habilitacionId: string) {
  return prismaBase.habilitacion.update({
    where: { id: habilitacionId },
    data: { vigenciaHasta: reloj.hoy() },
  })
}
