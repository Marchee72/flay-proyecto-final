import { conAutorizacion } from '@/aplicacion/autorizacion'
import { NoEncontrado } from '@/compartido/errores'
import type { AvisoEnVivo, PermisoDeEscucha } from '@/dominio/contratos/aviso-en-vivo'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { prisma } from '@/infraestructura/prisma'

/**
 * El único punto que publica: si la acción falla no hay aviso, y si falla el
 * aviso la acción ya quedó hecha. `programar` es `after` en la aplicación, así
 * quien vota no espera al servicio.
 */
export async function conAviso<T>(
  aviso: AvisoEnVivo,
  programar: (tarea: () => Promise<void>) => void,
  asambleaId: string,
  trabajo: () => Promise<T>,
): Promise<T> {
  const resultado = await trabajo()
  programar(async () => {
    try {
      await aviso.publicar(asambleaId)
    } catch {
      console.error('AVISO_EN_VIVO_FALLO', asambleaId)
    }
  })
  return resultado
}

/** Solo escucha quien alcanza la asamblea, y solo mientras está en curso. */
export async function permisoDeEscucha(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  aviso: AvisoEnVivo,
  datos: { usuarioId: string; consorcioId: string; asambleaId: string },
): Promise<PermisoDeEscucha | null> {
  return conAutorizacion(repositorio, reloj, { ...datos, accion: 'ver asambleas' }, async () => {
    const asamblea = await prisma.asamblea.findFirst({
      where: { id: datos.asambleaId },
      select: { estado: true },
    })
    if (asamblea?.estado !== 'en_curso') throw new NoEncontrado('RF-29')
    return aviso.permisoDeEscucha(datos.asambleaId)
  })
}
