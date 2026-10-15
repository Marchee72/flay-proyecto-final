import type { Prisma, MedioDePago } from '@prisma/client'

import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import { Decimal, importe } from '@/compartido/dinero'
import { imputar, type DetalleImpago } from '@/dominio/liquidacion/imputacion'
import { saldosDeUnidad } from '@/dominio/liquidacion/saldo'
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

/**
 * Operacion atomica de creacion de pago con sus imputaciones.
 * Compartida entre el registro manual del administrador (`RF-09`) y la
 * confirmacion de cobro en linea (`RF-28`).
 */
export async function imputarYRegistrar(
  tx: Prisma.TransactionClient,
  datos: {
    unidadId: string
    importe: string
    fechaPago: Date
    medio: MedioDePago
    referencia?: string | null
    registradoPor: string
    impagos: readonly DetalleImpago[]
  },
): Promise<PagoRegistrado> {
  const reparto = imputar(datos.importe, datos.impagos)

  const creado = await tx.pago.create({
    data: sinConsorcio({
      unidadId: datos.unidadId,
      fechaPago: datos.fechaPago,
      importe: datos.importe,
      medio: datos.medio,
      referencia: datos.referencia ?? null,
      saldoAFavor: reparto.sobrante,
      registradoPor: datos.registradoPor,
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

  return {
    pagoId: creado.id,
    imputaciones: reparto.imputaciones,
    saldoAFavor: reparto.sobrante,
  }
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

      return prisma.$transaction(async (tx) => {
        return imputarYRegistrar(tx, {
          unidadId: unidad.id,
          importe: datos.importe,
          fechaPago: datos.fechaPago,
          medio: datos.medio,
          referencia: datos.referencia,
          registradoPor: datos.usuarioId,
          impagos,
        })
      })
    },
  )
}

/**
 * Lo que la unidad debe, liquidacion por liquidacion, con su vencimiento: es
 * la entrada de `imputar`. Calcula el saldo propio por periodo aplicando la
 * regla de arrastre (RN-08 ampliada).
 */
export async function detallesImpagosDe(unidadId: string): Promise<DetalleImpago[]> {
  const detalles = await prisma.detalleLiquidacion.findMany({
    where: { unidadId, liquidacion: { estado: 'vigente' } },
    select: {
      id: true,
      totalUnidad: true,
      deudaAnterior: true,
      interesMora: true,
      liquidacion: { select: { vencimiento: true } },
      imputaciones: { where: { revertidaEn: null }, select: { importeImputado: true } },
    },
  })

  const formateados = detalles.map((d) => ({
    detalleId: d.id,
    totalUnidad: d.totalUnidad.toFixed(DECIMALES_IMPORTE),
    deudaAnterior: d.deudaAnterior.toFixed(DECIMALES_IMPORTE),
    interesMora: d.interesMora.toFixed(DECIMALES_IMPORTE),
    vencimiento: d.liquidacion.vencimiento,
    imputado: d.imputaciones
      .reduce((total, i) => total.plus(importe(i.importeImputado.toFixed(2))), new Decimal(0))
      .toFixed(DECIMALES_IMPORTE),
  }))

  const saldos = saldosDeUnidad(formateados)

  return saldos.detalles
    .filter((detalle) => importe(detalle.saldo).greaterThan(0))
    .map((detalle) => ({
      detalleId: detalle.detalleId,
      saldo: detalle.saldo,
      vencimiento: detalle.vencimiento,
    }))
}

