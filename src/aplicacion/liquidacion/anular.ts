import { ErrorDeAplicacion } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma } from '@/infraestructura/prisma'

/**
 * Anulacion de una liquidacion (`FR-003b`, `FR-027`, regla RN-06 § 7.2).
 *
 * **Se anula la liquidacion, no el periodo.** El periodo queda `liquidado` para
 * siempre —el contrato de `002` no admite salida de ese estado (M-04)— y lo que
 * se reemplaza es la emision: la nueva referencia a la anulada y las dos quedan
 * registradas. Lo que ya se le mando a los consorcistas no se reescribe: se
 * reemplaza a la vista.
 *
 * Las imputaciones **se marcan**, no se borran: una imputacion borrada es plata
 * que se movio sin rastro.
 */

export class LiquidacionYaAnulada extends ErrorDeAplicacion {
  constructor() {
    super('Esa liquidación ya está anulada.', 'RN-06')
  }
}

export class LiquidacionInexistente extends ErrorDeAplicacion {
  constructor() {
    super('No encontramos esa liquidación.', 'RF-07')
  }
}

export async function anularLiquidacion(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; liquidacionId: string },
): Promise<{ imputacionesRevertidas: number }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'anular liquidaciones',
    },
    async () => {
      const liquidacion = await prisma.liquidacion.findFirst({
        where: { id: datos.liquidacionId },
        select: { id: true, estado: true },
      })

      if (!liquidacion) throw new LiquidacionInexistente()
      if (liquidacion.estado === 'anulada') throw new LiquidacionYaAnulada()

      return prisma.$transaction(async (tx) => {
        const { count } = await tx.pagoImputacion.updateMany({
          where: {
            revertidaEn: null,
            detalle: { liquidacionId: liquidacion.id },
          },
          data: { revertidaEn: reloj.ahora() },
        })

        // Lo revertido vuelve a estar disponible: el pago recupera como saldo a
        // favor lo que estaba aplicado a esta liquidacion (FR-027).
        const revertidas = await tx.pagoImputacion.findMany({
          where: { detalle: { liquidacionId: liquidacion.id }, revertidaEn: { not: null } },
          select: { pagoId: true, importeImputado: true },
        })

        for (const imputacion of revertidas) {
          await tx.pago.update({
            where: { id: imputacion.pagoId },
            data: { saldoAFavor: { increment: imputacion.importeImputado } },
          })
        }

        await tx.liquidacion.update({
          where: { id: liquidacion.id },
          data: { estado: 'anulada' },
        })

        return { imputacionesRevertidas: count }
      })
    },
  )
}
