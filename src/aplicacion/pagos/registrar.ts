import type { MedioDePago } from '@prisma/client'

import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import { Decimal, importe } from '@/compartido/dinero'
import { imputar, type DetalleImpago } from '@/dominio/liquidacion/imputacion'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'

/**
 * Registro de un pago con su imputacion (`RF-09`, `CU-04`, `FR-021` a `FR-023`,
 * `FR-026`, regla RN-08 § 7.2).
 *
 * El pago y sus imputaciones entran en **una sola transaccion**: un pago sin
 * imputar, o una imputacion sin pago, es plata que no se sabe donde esta.
 * Quien decide el reparto es el dominio; esta capa lee los saldos, llama y
 * escribe.
 */

const DECIMALES_IMPORTE = 2

export const MEDIOS_DE_PAGO: readonly { valor: MedioDePago; etiqueta: string }[] = [
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'deposito', etiqueta: 'Depósito' },
  { valor: 'debito', etiqueta: 'Débito automático' },
]

export class ImporteDePagoInvalido extends ErrorDeAplicacion {
  constructor() {
    super('El importe del pago tiene que ser mayor que cero, con hasta dos decimales.', 'RF-09')
  }
}

export class MedioDePagoDesconocido extends ErrorDeAplicacion {
  constructor() {
    super('Elegí un medio de pago de la lista.', 'RF-09')
  }
}

export function medioDesdeFormulario(valor: unknown): MedioDePago {
  const medio = MEDIOS_DE_PAGO.find((candidato) => candidato.valor === valor)
  if (!medio) throw new MedioDePagoDesconocido()
  return medio.valor
}

export interface PagoRegistrado {
  pagoId: string
  imputaciones: { detalleId: string; importeImputado: string }[]
  saldoAFavor: string
}

export async function registrarPago(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    unidadId: string
    importe: string
    fechaPago: Date
    medio: MedioDePago
    referencia?: string | null
  },
): Promise<PagoRegistrado> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'registrar pagos',
    },
    async () => {
      if (!/^\d+(\.\d{1,2})?$/.test(datos.importe) || importe(datos.importe).lessThanOrEqualTo(0)) {
        throw new ImporteDePagoInvalido()
      }

      // El aislamiento decide si la unidad es de este consorcio.
      const unidad = await prisma.unidad.findFirst({ where: { id: datos.unidadId } })
      if (!unidad) throw new NoEncontrado()

      const impagos = await detallesImpagosDe(unidad.id)
      const reparto = imputar(datos.importe, impagos)

      const pago = await prisma.$transaction(async (tx) => {
        const creado = await tx.pago.create({
          data: sinConsorcio({
            unidadId: unidad.id,
            fechaPago: datos.fechaPago,
            importe: datos.importe,
            medio: datos.medio,
            referencia: datos.referencia ?? null,
            saldoAFavor: reparto.sobrante,
            registradoPor: datos.usuarioId,
          }),
        })

        if (reparto.imputaciones.length > 0) {
          await tx.pagoImputacion.createMany({
            data: reparto.imputaciones.map((imputacion) => ({
              pagoId: creado.id,
              detalleLiquidacionId: imputacion.detalleId,
              importeImputado: imputacion.importeImputado,
            })),
          })
        }

        return creado
      })

      return {
        pagoId: pago.id,
        imputaciones: reparto.imputaciones,
        saldoAFavor: reparto.sobrante,
      }
    },
  )
}

/**
 * Lo que la unidad debe, liquidacion por liquidacion, con su vencimiento: es
 * la entrada de `imputar`. El saldo de un detalle es su total menos lo ya
 * imputado y no revertido, el mismo criterio que usa la emision.
 */
export async function detallesImpagosDe(unidadId: string): Promise<DetalleImpago[]> {
  const detalles = await prisma.detalleLiquidacion.findMany({
    where: { unidadId, liquidacion: { estado: 'vigente' } },
    select: {
      id: true,
      totalUnidad: true,
      liquidacion: { select: { vencimiento: true } },
      imputaciones: { where: { revertidaEn: null }, select: { importeImputado: true } },
    },
  })

  return detalles
    .map((detalle) => {
      const pagado = detalle.imputaciones.reduce(
        (total, imputacion) => total.plus(importe(imputacion.importeImputado.toFixed(2))),
        new Decimal(0),
      )
      return {
        detalleId: detalle.id,
        saldo: importe(detalle.totalUnidad.toFixed(2)).minus(pagado).toFixed(DECIMALES_IMPORTE),
        vencimiento: detalle.liquidacion.vencimiento,
      }
    })
    .filter((detalle) => importe(detalle.saldo).greaterThan(0))
}
