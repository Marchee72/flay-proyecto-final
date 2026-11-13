import {
  errorDeInstrucciones,
  InstruccionesDemasiadoLargas,
} from '@/dominio/consorcios/instrucciones-de-pago'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prismaBase } from '@/infraestructura/prisma'

/**
 * Instrucciones de pago por consorcio (RF-09): alias, CBU, horario de la
 * administracion. Las escribe el administrador; las ve cualquiera con acceso al
 * consorcio, porque se muestran en la expensa.
 */

export { InstruccionesDemasiadoLargas, errorDeInstrucciones }

export async function guardarInstruccionesDePago(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; texto: string },
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'guardar las instrucciones de pago',
    },
    async () => {
      if (errorDeInstrucciones(datos.texto)) throw new InstruccionesDemasiadoLargas()

      // `Consorcio` no lleva `consorcioId`: se actualiza por `id` explicito.
      await prismaBase.consorcio.update({
        where: { id: datos.consorcioId },
        data: { instruccionesPago: datos.texto.trim() || null },
      })
    },
  )
}

export async function verInstruccionesDePago(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<string | null> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      accion: 'ver las instrucciones de pago',
    },
    async () => {
      const consorcio = await prismaBase.consorcio.findUniqueOrThrow({
        where: { id: datos.consorcioId },
        select: { instruccionesPago: true },
      })
      return consorcio.instruccionesPago
    },
  )
}
