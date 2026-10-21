import { NoEncontrado } from '@/compartido/errores'
import { Decimal, importe } from '@/compartido/dinero'
import { saldosDeUnidad } from '@/dominio/liquidacion/saldo'
import { ordenarUnidades } from '@/dominio/unidades/division'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'

import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { unidadesAlcanzables } from '@/aplicacion/liquidacion/ver-expensa'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import {
  ocupaUnidad,
  ocupantesVigentesDe,
  type Ocupante,
} from '@/infraestructura/repositorios/ocupaciones'

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
      include: {
        liquidacion: { include: { periodo: true } },
        imputaciones: { where: { revertidaEn: null } },
      },
    }),
    prismaBase.pago.findMany({
      where: { unidadId: unidad.id },
      include: { imputaciones: { where: { revertidaEn: null } } },
    }),
  ])

  // La parte propia (des-arrastrada) de cada expensa: `totalUnidad` arrastra la
  // deuda anterior, y contarla como importe del movimiento sumaria el arrastre
  // tantas veces como meses lo acarrean. Con el propio, el saldo corrido cuadra
  // con lo que realmente se debe (RN-08, nota #4).
  const propioPorDetalle = new Map(
    saldosDeUnidad(
      detalles.map((detalle) => ({
        detalleId: detalle.id,
        totalUnidad: detalle.totalUnidad.toFixed(2),
        deudaAnterior: detalle.deudaAnterior.toFixed(2),
        interesMora: detalle.interesMora.toFixed(2),
        imputado: detalle.imputaciones
          .reduce((total, i) => total.plus(importe(i.importeImputado.toFixed(2))), new Decimal(0))
          .toFixed(2),
        vencimiento: detalle.liquidacion.vencimiento,
      })),
    ).detalles.map((d) => [d.detalleId, importe(d.propio)]),
  )

  const movimientos = [
    ...detalles.map((detalle) => ({
      momento: detalle.liquidacion.emitidaEn,
      fecha: detalle.liquidacion.vencimiento.toISOString().slice(0, 10),
      concepto:
        `Expensas ${String(detalle.liquidacion.periodo.mes).padStart(2, '0')}/` +
        `${detalle.liquidacion.periodo.anio}`,
      importe: propioPorDetalle.get(detalle.id) ?? new Decimal(0),
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

export interface ResumenDeCuenta {
  unidadId: string
  designacion: string
  saldo: string
  saldoAFavor: string
  /** El movimiento mas reciente —expensa o pago—, o nulo si no hubo ninguno. */
  ultimoMovimiento: { fecha: string; concepto: string } | null
}

/**
 * Saldo de cada unidad alcanzable, en consultas acotadas y no una por unidad.
 *
 * La tabla de pagos solo necesita saldo, saldo a favor y el ultimo movimiento
 * de cada unidad; el detalle completo de movimientos es de una sola unidad y lo
 * trae `verEstadoDeCuenta`. Calcular el estado completo de todas disparaba `4N`
 * consultas en paralelo que agotaban el pool contra la base administrada. Se
 * entra por `Liquidacion` —aislada— para los detalles, igual que la morosidad.
 */
export async function resumenDeCuentas(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<ResumenDeCuenta[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      accion: 'ver el estado de cuenta',
    },
    async (acceso) => {
      const unidades = await unidadesAlcanzables(datos.usuarioId, acceso.roles, reloj.hoy())
      if (unidades.length === 0) return []
      const ids = unidades.map((unidad) => unidad.id)

      const [liquidaciones, pagos] = await Promise.all([
        prisma.liquidacion.findMany({
          where: { estado: 'vigente' },
          select: {
            emitidaEn: true,
            vencimiento: true,
            periodo: { select: { anio: true, mes: true } },
            detalles: {
              select: {
                id: true,
                unidadId: true,
                totalUnidad: true,
                deudaAnterior: true,
                interesMora: true,
                imputaciones: { where: { revertidaEn: null }, select: { importeImputado: true } },
              },
            },
          },
        }),
        // Por `unidadId` sobre los ids aislados de arriba, nunca un parametro
        // (mismo resguardo que la nomina de morosidad).
        prismaBase.pago.findMany({
          where: { unidadId: { in: ids } },
          select: {
            unidadId: true,
            medio: true,
            creadoEn: true,
            fechaPago: true,
            saldoAFavor: true,
          },
        }),
      ])

      type Acumulado = {
        // Un historico por unidad para des-arrastrar el saldo con `saldosDeUnidad`,
        // igual que la morosidad: `totalUnidad` arrastra la deuda anterior y
        // restarle lo imputado la contaria de mas (RN-08, nota #4).
        detalles: Parameters<typeof saldosDeUnidad>[0][number][]
        saldoAFavor: Decimal
        ultimo: { momento: Date; fecha: string; concepto: string } | null
      }
      const porUnidad = new Map<string, Acumulado>(
        ids.map((id) => [id, { detalles: [], saldoAFavor: new Decimal(0), ultimo: null }]),
      )

      const anotar = (acc: Acumulado, momento: Date, fecha: string, concepto: string) => {
        if (!acc.ultimo || momento.getTime() > acc.ultimo.momento.getTime()) {
          acc.ultimo = { momento, fecha, concepto }
        }
      }

      for (const liquidacion of liquidaciones) {
        const concepto =
          `Expensas ${String(liquidacion.periodo.mes).padStart(2, '0')}/` +
          `${liquidacion.periodo.anio}`
        const fecha = liquidacion.vencimiento.toISOString().slice(0, 10)
        for (const detalle of liquidacion.detalles) {
          const acc = porUnidad.get(detalle.unidadId)
          if (!acc) continue // detalle de una unidad fuera del alcance del usuario
          acc.detalles.push({
            detalleId: detalle.id,
            totalUnidad: detalle.totalUnidad.toFixed(2),
            deudaAnterior: detalle.deudaAnterior.toFixed(2),
            interesMora: detalle.interesMora.toFixed(2),
            imputado: detalle.imputaciones
              .reduce(
                (total, i) => total.plus(importe(i.importeImputado.toFixed(2))),
                new Decimal(0),
              )
              .toFixed(2),
            vencimiento: liquidacion.vencimiento,
          })
          anotar(acc, liquidacion.emitidaEn, fecha, concepto)
        }
      }

      for (const pago of pagos) {
        const acc = porUnidad.get(pago.unidadId)!
        acc.saldoAFavor = acc.saldoAFavor.plus(importe(pago.saldoAFavor.toFixed(2)))
        anotar(
          acc,
          pago.creadoEn,
          pago.fechaPago.toISOString().slice(0, 10),
          `Pago (${pago.medio})`,
        )
      }

      return unidades.map((unidad) => {
        const acc = porUnidad.get(unidad.id)!
        return {
          unidadId: unidad.id,
          designacion: unidad.designacion,
          saldo: saldosDeUnidad(acc.detalles).saldoTotal,
          saldoAFavor: acc.saldoAFavor.toFixed(DECIMALES_IMPORTE),
          ultimoMovimiento: acc.ultimo
            ? { fecha: acc.ultimo.fecha, concepto: acc.ultimo.concepto }
            : null,
        }
      })
    },
  )
}

export interface MorosidadAgregada {
  unidadesEnMora: number
  unidadesTotales: number
  deudaTotal: string
}

export interface PeriodoImpago {
  /** `07/2026` */
  periodo: string
  vencimiento: string
  saldo: string
}

export interface DeudorNominado {
  unidadId: string
  designacion: string
  deuda: string
  /** Liquidaciones vencidas e impagas. */
  periodosVencidos: number
  /** Cada una con lo que le falta, de la mas vieja a la mas nueva. */
  periodos: PeriodoImpago[]
  /** Propietario e inquilino vigentes, para poder llamarlos (dato personal, RNF-13). */
  ocupantes: Ocupante[]
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
export async function saldoImpagoPorUnidad(
  hoy: Date,
): Promise<Map<string, { deuda: Decimal; vencidos: number; periodos: PeriodoImpago[] }>> {
  const liquidaciones = await prisma.liquidacion.findMany({
    where: { estado: 'vigente', vencimiento: { lt: hoy } },
    orderBy: { vencimiento: 'asc' },
    select: {
      vencimiento: true,
      periodo: { select: { anio: true, mes: true } },
      detalles: {
        select: {
          id: true,
          unidadId: true,
          totalUnidad: true,
          deudaAnterior: true,
          interesMora: true,
          imputaciones: { where: { revertidaEn: null }, select: { importeImputado: true } },
        },
      },
    },
  })

  const porUnidadId = new Map<
    string,
    {
      detalleId: string
      periodo: string
      totalUnidad: string
      deudaAnterior: string
      interesMora: string
      imputado: string
      vencimiento: Date
    }[]
  >()

  for (const liquidacion of liquidaciones) {
    const periodoStr = `${String(liquidacion.periodo.mes).padStart(2, '0')}/${liquidacion.periodo.anio}`
    for (const d of liquidacion.detalles) {
      const suyos = porUnidadId.get(d.unidadId) ?? []
      const pagado = d.imputaciones.reduce(
        (total, i) => total.plus(importe(i.importeImputado.toFixed(2))),
        new Decimal(0),
      )
      suyos.push({
        detalleId: d.id,
        periodo: periodoStr,
        totalUnidad: d.totalUnidad.toFixed(DECIMALES_IMPORTE),
        deudaAnterior: d.deudaAnterior.toFixed(DECIMALES_IMPORTE),
        interesMora: d.interesMora.toFixed(DECIMALES_IMPORTE),
        imputado: pagado.toFixed(DECIMALES_IMPORTE),
        vencimiento: liquidacion.vencimiento,
      })
      porUnidadId.set(d.unidadId, suyos)
    }
  }

  const porUnidad = new Map<
    string,
    { deuda: Decimal; vencidos: number; periodos: PeriodoImpago[] }
  >()

  for (const [unidadId, lista] of porUnidadId.entries()) {
    const saldos = saldosDeUnidad(lista)
    if (importe(saldos.saldoTotal).lessThanOrEqualTo(0)) continue

    const mapPeriodo = new Map(lista.map((x) => [x.detalleId, x.periodo]))

    const periodosImpagos: PeriodoImpago[] = saldos.detalles
      .filter((d) => importe(d.saldo).greaterThan(0))
      .map((d) => ({
        periodo: mapPeriodo.get(d.detalleId)!,
        vencimiento: d.vencimiento.toISOString().slice(0, 10),
        saldo: d.saldo,
      }))

    porUnidad.set(unidadId, {
      deuda: importe(saldos.saldoTotal),
      vencidos: periodosImpagos.length,
      periodos: periodosImpagos,
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
        saldoImpagoPorUnidad(hoy),
        prisma.unidad.count({ where: { bajaDesde: null } }),
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

      const unidades = ordenarUnidades(
        await prisma.unidad.findMany({
          where: { id: { in: [...deudas.keys()] } },
          select: { id: true, designacion: true },
        }),
      )

      // Los ids salen de la consulta aislada de arriba: nunca de un parametro.
      const ocupantes = await ocupantesVigentesDe(
        unidades.map((unidad) => unidad.id),
        hoy,
      )

      return {
        nominada: true,
        agregado,
        deudores: unidades.map((unidad) => {
          const deuda = deudas.get(unidad.id)!
          return {
            unidadId: unidad.id,
            designacion: unidad.designacion,
            deuda: deuda.deuda.toFixed(DECIMALES_IMPORTE),
            periodosVencidos: deuda.vencidos,
            periodos: deuda.periodos,
            ocupantes: ocupantes.get(unidad.id) ?? [],
          }
        }),
      }
    },
  )
}
