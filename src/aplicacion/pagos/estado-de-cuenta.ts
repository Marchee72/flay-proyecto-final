import { NoEncontrado } from '@/compartido/errores'
import { Decimal, importe } from '@/compartido/dinero'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import { ocupaUnidad } from '@/infraestructura/repositorios/ocupaciones'

/**
 * Estado de cuenta de una unidad (`FR-028`) y morosidad del consorcio
 * (`FR-029`, regla RN-13 § 7.2).
 *
 * La nomina nominada de deudores es para administrador y consejo. El
 * consorcista recibe **el agregado y nada mas**, y no porque la pantalla
 * oculte nombres: son **dos consultas distintas**, y la suya no trae ninguno.
 */

const DECIMALES_IMPORTE = 2

export interface MovimientoDeCuenta {
  fecha: string
  concepto: string
  /** Positivo es deuda, negativo es pago. Como cadena, con signo. */
  importe: string
  saldo: string
}

export interface EstadoDeCuenta {
  unidadId: string
  designacion: string
  saldo: string
  saldoAFavor: string
  movimientos: MovimientoDeCuenta[]
}

async function estadoDe(unidad: { id: string; designacion: string }): Promise<EstadoDeCuenta> {
  const [detalles, pagos] = await Promise.all([
    prismaBase.detalleLiquidacion.findMany({
      where: { unidadId: unidad.id, liquidacion: { estado: 'vigente' } },
      include: { liquidacion: { include: { periodo: true } } },
    }),
    prismaBase.pago.findMany({
      where: { unidadId: unidad.id },
      include: { imputaciones: { where: { revertidaEn: null } } },
    }),
  ])

  const movimientos = [
    ...detalles.map((detalle) => ({
      momento: detalle.liquidacion.emitidaEn,
      fecha: detalle.liquidacion.vencimiento.toISOString().slice(0, 10),
      concepto:
        `Expensas ${String(detalle.liquidacion.periodo.mes).padStart(2, '0')}/` +
        `${detalle.liquidacion.periodo.anio}`,
      importe: importe(detalle.totalUnidad.toFixed(2)),
    })),
    ...pagos.map((pago) => ({
      momento: pago.creadoEn,
      fecha: pago.fechaPago.toISOString().slice(0, 10),
      concepto: `Pago (${pago.medio})`,
      // Lo que cuenta contra la deuda es lo imputado y vigente; el saldo a
      // favor se muestra aparte.
      importe: pago.imputaciones
        .reduce((total, i) => total.plus(importe(i.importeImputado.toFixed(2))), new Decimal(0))
        .negated(),
    })),
  ].sort((a, b) => a.momento.getTime() - b.momento.getTime())

  let saldo = new Decimal(0)
  const conSaldo = movimientos.map((movimiento) => {
    saldo = saldo.plus(movimiento.importe)
    return {
      fecha: movimiento.fecha,
      concepto: movimiento.concepto,
      importe: movimiento.importe.toFixed(DECIMALES_IMPORTE),
      saldo: saldo.toFixed(DECIMALES_IMPORTE),
    }
  })

  const saldoAFavor = pagos
    .reduce((total, pago) => total.plus(importe(pago.saldoAFavor.toFixed(2))), new Decimal(0))
    .toFixed(DECIMALES_IMPORTE)

  return {
    unidadId: unidad.id,
    designacion: unidad.designacion,
    saldo: saldo.toFixed(DECIMALES_IMPORTE),
    saldoAFavor,
    movimientos: conSaldo,
  }
}

export async function verEstadoDeCuenta(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; unidadId: string },
): Promise<EstadoDeCuenta> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      accion: 'ver el estado de cuenta',
    },
    async (acceso) => {
      const unidad = await prisma.unidad.findFirst({
        where: { id: datos.unidadId },
        select: { id: true, designacion: true },
      })
      if (!unidad) throw new NoEncontrado()

      const privilegiado = acceso.roles.some((rol) => rol === 'administrador' || rol === 'consejo')
      if (!privilegiado && !(await ocupaUnidad(datos.usuarioId, unidad.id, reloj.hoy()))) {
        throw new NoEncontrado()
      }

      return estadoDe(unidad)
    },
  )
}

export interface MorosidadAgregada {
  unidadesEnMora: number
  unidadesTotales: number
  deudaTotal: string
}

export interface DeudorNominado {
  unidadId: string
  designacion: string
  deuda: string
  /** Liquidaciones vencidas e impagas. */
  periodosVencidos: number
}

export type Morosidad =
  | { nominada: false; agregado: MorosidadAgregada }
  | { nominada: true; agregado: MorosidadAgregada; deudores: DeudorNominado[] }

/**
 * Saldo impago por unidad, sobre liquidaciones vigentes ya vencidas.
 *
 * Se entra **por `Liquidacion`**, que lleva `consorcio_id` y queda filtrada por
 * la extension. `DetalleLiquidacion` no lo lleva: consultarla directo trae los
 * detalles de todos los consorcios, y una prueba de extremo a extremo con dos
 * consorcios en paralelo lo mostro sumando la mora ajena (Principio I, RT-04).
 */
async function deudaPorUnidad(
  hoy: Date,
): Promise<Map<string, { deuda: Decimal; vencidos: number }>> {
  const liquidaciones = await prisma.liquidacion.findMany({
    where: { estado: 'vigente', vencimiento: { lt: hoy } },
    select: {
      detalles: {
        select: {
          unidadId: true,
          totalUnidad: true,
          imputaciones: { where: { revertidaEn: null }, select: { importeImputado: true } },
        },
      },
    },
  })

  const porUnidad = new Map<string, { deuda: Decimal; vencidos: number }>()

  for (const detalle of liquidaciones.flatMap((liquidacion) => liquidacion.detalles)) {
    const pagado = detalle.imputaciones.reduce(
      (total, i) => total.plus(importe(i.importeImputado.toFixed(2))),
      new Decimal(0),
    )
    const saldo = importe(detalle.totalUnidad.toFixed(2)).minus(pagado)
    if (saldo.lessThanOrEqualTo(0)) continue

    const actual = porUnidad.get(detalle.unidadId) ?? { deuda: new Decimal(0), vencidos: 0 }
    porUnidad.set(detalle.unidadId, {
      deuda: actual.deuda.plus(saldo),
      vencidos: actual.vencidos + 1,
    })
  }

  return porUnidad
}

export async function verMorosidad(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<Morosidad> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver la morosidad' },
    async (acceso) => {
      const hoy = reloj.hoy()
      const [deudas, unidadesTotales] = await Promise.all([
        deudaPorUnidad(hoy),
        prisma.unidad.count(),
      ])

      const agregado: MorosidadAgregada = {
        unidadesEnMora: deudas.size,
        unidadesTotales,
        deudaTotal: [...deudas.values()]
          .reduce((total, fila) => total.plus(fila.deuda), new Decimal(0))
          .toFixed(DECIMALES_IMPORTE),
      }

      // El consorcista sale aca, con el agregado y sin un solo nombre: la
      // consulta nominada de abajo directamente no se ejecuta (regla RN-13).
      if (!acceso.roles.some((rol) => rol === 'administrador' || rol === 'consejo')) {
        return { nominada: false, agregado }
      }

      const unidades = await prisma.unidad.findMany({
        where: { id: { in: [...deudas.keys()] } },
        select: { id: true, designacion: true },
        orderBy: { designacion: 'asc' },
      })

      return {
        nominada: true,
        agregado,
        deudores: unidades.map((unidad) => ({
          unidadId: unidad.id,
          designacion: unidad.designacion,
          deuda: deudas.get(unidad.id)!.deuda.toFixed(DECIMALES_IMPORTE),
          periodosVencidos: deudas.get(unidad.id)!.vencidos,
        })),
      }
    },
  )
}
