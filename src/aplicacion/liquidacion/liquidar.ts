import { Prisma } from '@prisma/client'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { Decimal, importe } from '@/compartido/dinero'
import { imputar } from '@/dominio/liquidacion/imputacion'
import { interesPorMora, type DeudaVencida } from '@/dominio/liquidacion/interes'
import { prorratear, type UnidadDelPadron } from '@/dominio/liquidacion/prorrateo'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { habilitadosDelConsorcio, notificar } from '@/aplicacion/comunicacion/notificar'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Emision de la liquidacion (`RF-07`, `CU-03`, `FR-013`).
 *
 * **Todo en una sola transaccion**: calculo, persistencia, cambio de estado del
 * periodo, encolado de los documentos y notificaciones. Una liquidacion a
 * medias es peor que ninguna (SC-010).
 *
 * Esta capa **no calcula**: llama al dominio. Lo que hace es autorizar, leer,
 * escribir y auditar, que es exactamente su trabajo (§ 12.1).
 */

const DECIMALES_IMPORTE = 2

export class PeriodoNoCerrado extends ErrorDeAplicacion {
  constructor(estado: string) {
    super(
      estado === 'abierto'
        ? 'El período está abierto: cerralo primero, porque desde ahí no entran más gastos.'
        : `Un período ${estado} no se liquida.`,
      'RN-03',
      { estado },
    )
  }
}

export class PeriodoYaLiquidado extends ErrorDeAplicacion {
  constructor() {
    super(
      'Ese período ya tiene una liquidación vigente. Para corregirla hay que anularla y emitir otra.',
      'RN-06',
    )
  }
}

/** El dia de vencimiento del consorcio, sobre el mes siguiente al periodo. */
export function vencimientoDe(anio: number, mes: number, dia: number): Date {
  const siguiente = mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 }
  return new Date(Date.UTC(siguiente.anio, siguiente.mes - 1, dia))
}

export interface LiquidacionEmitida {
  liquidacionId: string
  totalGeneral: string
  vencimiento: string
  unidades: number
}

export async function liquidarPeriodo(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; periodoId: string },
): Promise<LiquidacionEmitida> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'liquidar períodos',
    },
    async () => {
      const periodo = await prisma.periodo.findFirst({ where: { id: datos.periodoId } })
      if (!periodo) throw new PeriodoNoCerrado('inexistente')

      // `liquidado` **tambien** admite emitir: es el estado en el que queda un
      // periodo cuya liquidacion se anulo, y reemitir es justamente lo que la
      // regla RN-06 manda para corregir (FR-003b). Lo que impide la emision
      // doble no es este estado sino el indice unico parcial de la base: acá
      // sólo se rechaza lo que no puede liquidarse nunca.
      if (periodo.estado === 'abierto' || periodo.estado === 'anulado') {
        throw new PeriodoNoCerrado(periodo.estado)
      }

      const consorcio = await prismaBase.consorcio.findUniqueOrThrow({
        where: { id: datos.consorcioId },
        select: { diaVencimiento: true, tasaMoraMensual: true },
      })

      const unidades = await prisma.unidad.findMany({ orderBy: { designacion: 'asc' } })
      const padron: UnidadDelPadron[] = unidades.map((unidad) => ({
        unidadId: unidad.id,
        designacion: unidad.designacion,
        coeficiente: unidad.coeficiente.toFixed(8),
      }))

      const gastos = await prisma.gasto.findMany({
        where: { periodoId: periodo.id },
        select: { importe: true, clasificacion: true },
      })

      const sumar = (clasificacion: 'ordinario' | 'extraordinario') =>
        gastos
          .filter((gasto) => gasto.clasificacion === clasificacion)
          .reduce((total, gasto) => total.plus(importe(gasto.importe.toFixed(2))), new Decimal(0))
          .toFixed(DECIMALES_IMPORTE)

      // El dominio verifica la suma de coeficientes y aborta antes de calcular
      // nada si no cierra (FR-006): el mensaje sale de ahi, no de aca.
      const reparto = prorratear({
        padron,
        totalOrdinario: sumar('ordinario'),
        totalExtraordinario: sumar('extraordinario'),
      })

      const vencimiento = vencimientoDe(periodo.anio, periodo.mes, consorcio.diaVencimiento)
      const hoy = reloj.hoy()
      const tasa = importe(consorcio.tasaMoraMensual.toFixed(4))

      // Deuda previa por unidad: lo impago de las liquidaciones **vigentes**.
      const deudaPorUnidad = await deudaVigentePorUnidad(datos.periodoId)
      const saldosPorUnidad = await saldosAFavorPorUnidad()

      const emitida = await prisma.$transaction(async (tx) => {
        const liquidacion = await tx.liquidacion.create({
          data: sinConsorcio({
            periodoId: periodo.id,
            totalOrdinario: reparto.totalOrdinario,
            totalExtraordinario: reparto.totalExtraordinario,
            totalGeneral: reparto.totalGeneral,
            vencimiento,
            emitidaPor: datos.usuarioId,
          }),
        })

        // Todo el calculo por unidad ocurre en memoria; despues **dos**
        // sentencias escriben las dos tablas. Cien detalles de a uno contra una
        // base remota no entran en el tope de la transaccion (research R-09).
        const detalles = reparto.detalles.map((detalle) => {
          const deudas = deudaPorUnidad.get(detalle.unidadId) ?? []
          const interes = interesPorMora(deudas, tasa, hoy)

          const deudaAnterior = deudas
            .reduce((total, deuda) => total.plus(importe(deuda.capital)), new Decimal(0))
            .toFixed(DECIMALES_IMPORTE)

          // El saldo a favor se aplica **despues** del interes: el interes corre
          // sobre lo que estuvo impago y el saldo a favor es plata que ya entro
          // (FR-026b).
          const antesDelSaldo = importe(detalle.totalUnidad)
            .plus(importe(deudaAnterior))
            .plus(importe(interes.total))

          const disponible = saldosPorUnidad.get(detalle.unidadId) ?? new Decimal(0)
          const aplicado = Decimal.min(disponible, antesDelSaldo)

          return {
            id: crypto.randomUUID(),
            liquidacionId: liquidacion.id,
            unidadId: detalle.unidadId,
            coeficienteAplicado: detalle.coeficienteAplicado,
            importeOrdinario: detalle.importeOrdinario,
            importeExtraordinario: detalle.importeExtraordinario,
            deudaAnterior,
            interesMora: interes.total,
            saldoAFavorAplicado: aplicado.toFixed(DECIMALES_IMPORTE),
            ajusteRedondeo: detalle.ajusteRedondeo,
            totalUnidad: antesDelSaldo.minus(aplicado).toFixed(DECIMALES_IMPORTE),
            desglose: interes.desglose,
          }
        })

        await tx.detalleLiquidacion.createMany({
          data: detalles.map(({ desglose, ...fila }) => (void desglose, fila)),
        })

        const lineasDeInteres = detalles.flatMap((detalle) =>
          detalle.desglose.map((linea) => ({
            detalleId: detalle.id,
            liquidacionOrigenId: linea.liquidacionId,
            capital: linea.capital,
            tasaMensual: linea.tasaMensual,
            meses: linea.meses,
            importe: linea.importe,
          })),
        )

        if (lineasDeInteres.length > 0) {
          await tx.interesLiquidado.createMany({ data: lineasDeInteres })
        }

        await tx.periodo.update({ where: { id: periodo.id }, data: { estado: 'liquidado' } })

        await encolarDocumentos(tx, liquidacion.id)
        await avisarALosHabilitados(tx, liquidacion.id, periodo)

        return liquidacion
      })

      return {
        liquidacionId: emitida.id,
        totalGeneral: reparto.totalGeneral,
        vencimiento: vencimiento.toISOString().slice(0, 10),
        unidades: reparto.detalles.length,
      }
    },
  )
}

type Transaccion = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Un trabajo por unidad para generar su documento (`FR-016`, research R-02).
 *
 * Va en SQL por lo mismo que `encolar`: `proximo_intento` lo tiene que poner la
 * base, porque el vencimiento se compara contra su reloj (decisión 9 de
 * `CLAUDE.md`).
 */
async function encolarDocumentos(tx: Transaccion, liquidacionId: string): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "TrabajoPendiente" (tipo, carga)
    SELECT 'documento_expensa'::"TipoTrabajo",
           jsonb_build_object('detalleId', d.id, 'liquidacionId', d.liquidacion_id)
    FROM "DetalleLiquidacion" d
    WHERE d.liquidacion_id = ${liquidacionId}::uuid
  `
}

/**
 * El aviso nace con su trabajo de despacho, en la misma transaccion, por
 * `notificar` (`004-servicios` FR-012, research R-07). Destinatarios: quienes
 * tienen habilitacion vigente sobre el consorcio, que son los que pueden ver la
 * liquidacion.
 */
async function avisarALosHabilitados(
  tx: Transaccion,
  liquidacionId: string,
  periodo: { anio: number; mes: number },
): Promise<void> {
  const mes = String(periodo.mes).padStart(2, '0')
  const habilitados = await habilitadosDelConsorcio(tx)

  await notificar(
    tx,
    habilitados.map((usuarioId) => ({
      usuarioId,
      tipo: 'liquidacion_publicada' as const,
      titulo: `Expensas de ${mes}/${periodo.anio}`,
      cuerpo: `Ya está publicada la liquidación de ${mes}/${periodo.anio}.`,
      entidadTipo: 'Liquidacion',
      entidadId: liquidacionId,
    })),
  )
}

/**
 * Lo impago por unidad, liquidacion por liquidacion: capital y **su propio**
 * vencimiento, que es lo que el interes necesita (`FR-024`).
 */
async function deudaVigentePorUnidad(
  periodoExcluido: string,
): Promise<Map<string, DeudaVencida[]>> {
  // Por `Liquidacion`, que si esta aislada: `DetalleLiquidacion` no lleva
  // `consorcio_id` y consultarla directo trae la deuda de todos los consorcios
  // (Principio I, RT-04).
  const liquidaciones = await prisma.liquidacion.findMany({
    where: { estado: 'vigente', periodoId: { not: periodoExcluido } },
    select: {
      id: true,
      vencimiento: true,
      detalles: {
        select: {
          unidadId: true,
          totalUnidad: true,
          imputaciones: { where: { revertidaEn: null }, select: { importeImputado: true } },
        },
      },
    },
  })

  const detalles = liquidaciones.flatMap((liquidacion) =>
    liquidacion.detalles.map((detalle) => ({
      ...detalle,
      liquidacionId: liquidacion.id,
      liquidacion: { vencimiento: liquidacion.vencimiento },
    })),
  )

  const porUnidad = new Map<string, DeudaVencida[]>()

  for (const detalle of detalles) {
    const pagado = detalle.imputaciones.reduce(
      (total, imputacion) => total.plus(importe(imputacion.importeImputado.toFixed(2))),
      new Decimal(0),
    )

    const saldo = importe(detalle.totalUnidad.toFixed(2)).minus(pagado)
    if (saldo.lessThanOrEqualTo(0)) continue

    const suyas = porUnidad.get(detalle.unidadId) ?? []
    suyas.push({
      liquidacionId: detalle.liquidacionId,
      capital: saldo.toFixed(DECIMALES_IMPORTE),
      vencimiento: detalle.liquidacion.vencimiento,
    })
    porUnidad.set(detalle.unidadId, suyas)
  }

  return porUnidad
}

/** Lo que cada unidad tiene a favor y todavia no se aplico (`FR-026b`). */
async function saldosAFavorPorUnidad(): Promise<Map<string, Decimal>> {
  const pagos = await prisma.pago.findMany({
    where: { saldoAFavor: { gt: new Prisma.Decimal(0) } },
    select: { unidadId: true, saldoAFavor: true },
  })

  const porUnidad = new Map<string, Decimal>()

  for (const pago of pagos) {
    const acumulado = porUnidad.get(pago.unidadId) ?? new Decimal(0)
    porUnidad.set(pago.unidadId, acumulado.plus(importe(pago.saldoAFavor.toFixed(2))))
  }

  return porUnidad
}

/** Reexportado para que el caso de uso de pagos use el mismo criterio. */
export { imputar }
