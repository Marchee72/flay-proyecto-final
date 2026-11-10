import { Decimal, importe } from '@/compartido/dinero'
import { ErrorDeAplicacion } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma } from '@/infraestructura/prisma'

/**
 * Anulacion de una liquidacion (`FR-003b`, `FR-027`, regla RN-06 § 7.2).
 *
 * **Anular reabre el periodo.** Solo se anula la ultima liquidacion y el periodo
 * vuelve a `abierto`, para corregir ese mes y reemitir: la nueva referencia a la
 * anulada y las dos quedan registradas. Lo que ya se le mando a los consorcistas
 * no se reescribe: se reemplaza a la vista.
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

export class LiquidacionNoEsLaUltima extends ErrorDeAplicacion {
  constructor() {
    super(
      'Solo se puede anular la última liquidación. Para corregir un mes anterior, hacé el ajuste en el período siguiente.',
      'RN-06',
    )
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
        select: {
          id: true,
          estado: true,
          periodoId: true,
          periodo: { select: { anio: true, mes: true } },
        },
      })

      if (!liquidacion) throw new LiquidacionInexistente()
      if (liquidacion.estado === 'anulada') throw new LiquidacionYaAnulada()

      // Una liquidación posterior ya arrastró esta deuda en su `deudaAnterior`:
      // anular una anterior corrompería la cadena.
      const posterior = await prisma.liquidacion.findFirst({
        where: {
          estado: 'vigente',
          periodo: {
            OR: [
              { anio: { gt: liquidacion.periodo.anio } },
              { anio: liquidacion.periodo.anio, mes: { gt: liquidacion.periodo.mes } },
            ],
          },
        },
        select: { id: true },
      })
      if (posterior) throw new LiquidacionNoEsLaUltima()

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
        // Vuelve todo lo que el pago puso: el capital **y** el recargo cobrado
        // con el (RF-08); devolver solo el capital perdia el recargo.
        const revertidas = await tx.pagoImputacion.findMany({
          where: { detalle: { liquidacionId: liquidacion.id }, revertidaEn: { not: null } },
          select: { pagoId: true, importeImputado: true, recargoCobrado: true },
        })

        for (const imputacion of revertidas) {
          await tx.pago.update({
            where: { id: imputacion.pagoId },
            data: {
              saldoAFavor: {
                increment: importe(imputacion.importeImputado.toFixed(2))
                  .plus(importe(imputacion.recargoCobrado.toFixed(2)))
                  .toFixed(2),
              },
            },
          })
        }

        // El saldo a favor que esta liquidacion consumio al emitirse vuelve a los
        // pagos de la unidad (FR-026b), del mas nuevo al mas viejo y sin pasar el
        // importe de cada pago (`pago_saldo_a_favor_en_rango`).
        // ponytail: no hay rastro de que pago se consumio; alcanza porque el
        // saldo a favor se lee sumado por unidad.
        const aplicados = await tx.detalleLiquidacion.findMany({
          where: { liquidacionId: liquidacion.id, saldoAFavorAplicado: { gt: 0 } },
          select: { unidadId: true, saldoAFavorAplicado: true },
        })
        for (const detalle of aplicados) {
          let resta = importe(detalle.saldoAFavorAplicado.toFixed(2))
          const pagos = await tx.pago.findMany({
            where: { unidadId: detalle.unidadId },
            select: { id: true, importe: true, saldoAFavor: true },
            orderBy: [{ fechaPago: 'desc' }, { creadoEn: 'desc' }],
          })
          for (const pago of pagos) {
            if (resta.lessThanOrEqualTo(0)) break
            const lugar = importe(pago.importe.toFixed(2)).minus(
              importe(pago.saldoAFavor.toFixed(2)),
            )
            const repuesto = Decimal.min(resta, lugar)
            if (repuesto.lessThanOrEqualTo(0)) continue
            await tx.pago.update({
              where: { id: pago.id },
              data: { saldoAFavor: { increment: repuesto.toFixed(2) } },
            })
            resta = resta.minus(repuesto)
          }
        }

        await tx.liquidacion.update({
          where: { id: liquidacion.id },
          data: { estado: 'anulada' },
        })

        // Única vía que saca un período de `liquidado`: anular lo reabre para corregir
        // y reemitir (D2). La máquina de estados genérica sigue sin poder hacerlo.
        await tx.periodo.update({
          where: { id: liquidacion.periodoId },
          data: { estado: 'abierto' },
        })

        return { imputacionesRevertidas: count }
      })
    },
  )
}
