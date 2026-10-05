import { Prisma } from '@prisma/client'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { Decimal, importe } from '@/compartido/dinero'
import { coeficienteSerializado, importeSerializado } from '@/compartido/formato'
import { imputar } from '@/dominio/liquidacion/imputacion'
import { interesPorMora, type DeudaVencida } from '@/dominio/liquidacion/interes'
import { prorratear, type UnidadDelPadron } from '@/dominio/liquidacion/prorrateo'
import { transicionValida } from '@/dominio/periodos/estado'
import { ordenarUnidades } from '@/dominio/unidades/division'
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
 *
 * La vista previa y la emision comparten `calcular`: lo que el administrador
 * revisa es exactamente lo que se emite, y la emision lo comprueba contra el
 * total que el reviso.
 */

const DECIMALES_IMPORTE = 2

export class PeriodoNoLiquidable extends ErrorDeAplicacion {
  constructor(estado: string) {
    super(
      estado === 'inexistente'
        ? 'No encontramos ese período.'
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

export class GastosCambiaron extends ErrorDeAplicacion {
  constructor() {
    super(
      'Los gastos del período cambiaron desde que los revisaste. Revisalos de nuevo antes de liquidar.',
      'RF-07',
    )
  }
}

/** El dia de vencimiento del consorcio, sobre el mes siguiente al periodo. */
export function vencimientoDe(anio: number, mes: number, dia: number): Date {
  const siguiente = mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 }
  return new Date(Date.UTC(siguiente.anio, siguiente.mes - 1, dia))
}

/**
 * Todo el calculo de una liquidacion, **sin escribir nada**: lee el padron
 * vigente, los gastos, la deuda y los saldos a favor, y devuelve las filas tal
 * como se guardarian.
 */
async function calcular(reloj: Reloj, consorcioId: string, periodoId: string) {
  const periodo = await prisma.periodo.findFirst({ where: { id: periodoId } })
  if (!periodo) throw new PeriodoNoLiquidable('inexistente')

  // `liquidado` **tambien** admite emitir: es el estado en el que queda un
  // periodo cuya liquidacion se anulo, y reemitir es justamente lo que la
  // regla RN-06 manda para corregir (FR-003b). Lo que impide la emision doble
  // no es este estado sino el indice unico parcial de la base. `abierto` se
  // liquida directo: liquidar lo cierra (RF-07).
  if (periodo.estado !== 'liquidado' && !transicionValida(periodo.estado, 'liquidado')) {
    throw new PeriodoNoLiquidable(periodo.estado)
  }

  const consorcio = await prismaBase.consorcio.findUniqueOrThrow({
    where: { id: consorcioId },
    select: { diaVencimiento: true, tasaMoraMensual: true },
  })

  // La dada de baja tiene coeficiente cero: no suma nada y no lleva detalle.
  const unidades = ordenarUnidades(
    await prisma.unidad.findMany({
      where: { bajaDesde: null },
    }),
  )

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
  const deudaPorUnidad = await deudaVigentePorUnidad(periodoId)
  const saldosPorUnidad = await saldosAFavorPorUnidad()

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
      designacion: detalle.designacion,
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

  return { periodo, reparto, vencimiento, detalles }
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
  datos: {
    usuarioId: string
    consorcioId: string
    periodoId: string
    /** El total que el administrador vio al revisar; si cambio, no se emite. */
    totalRevisado?: string
  },
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
      const { periodo, reparto, vencimiento, detalles } = await calcular(
        reloj,
        datos.consorcioId,
        datos.periodoId,
      )

      if (
        datos.totalRevisado !== undefined &&
        !importe(datos.totalRevisado).equals(importe(reparto.totalGeneral))
      ) {
        throw new GastosCambiaron()
      }

      const emitida = await prisma.$transaction(async (tx) => {
        // Primero el estado, condicionado al que se leyo: si otro pedido lo
        // cambio en el medio, no se emite sobre un periodo distinto del que se
        // calculo.
        const cambiado = await tx.periodo.updateMany({
          where: { id: periodo.id, estado: periodo.estado },
          data: { estado: 'liquidado' },
        })
        if (cambiado.count !== 1) throw new PeriodoYaLiquidado()

        // Desde un periodo abierto pudo entrar un gasto despues del calculo: se
        // vuelve a sumar con el periodo ya liquidado, que no admite mas.
        // ponytail: un alta que leyo «abierto» antes del update y confirma
        // despues todavia se cuela (READ COMMITTED); cerrarlo del todo pide un
        // disparador en `Gasto` que mire el estado del periodo.
        const suma = await tx.gasto.aggregate({
          where: { periodoId: periodo.id },
          _sum: { importe: true },
        })
        const gastado = importe((suma._sum.importe ?? new Prisma.Decimal(0)).toFixed(2))
        if (!gastado.equals(importe(reparto.totalGeneral))) throw new GastosCambiaron()

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

        // Todo el calculo por unidad ya ocurrio en memoria; aca **dos**
        // sentencias escriben las dos tablas. Cien detalles de a uno contra una
        // base remota no entran en el tope de la transaccion (research R-09).
        await tx.detalleLiquidacion.createMany({
          data: detalles.map(({ desglose, designacion, ...fila }) => {
            void desglose
            void designacion
            return { ...fila, liquidacionId: liquidacion.id }
          }),
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

export interface VistaPreviaDeLiquidacion {
  periodo: string
  estado: string
  /** ISO `AAAA-MM-DD`. */
  vencimiento: string
  totalOrdinario: string
  totalExtraordinario: string
  totalGeneral: string
  gastos: {
    id: string
    /** ISO `AAAA-MM-DD`. */
    fecha: string
    rubro: string
    proveedor: string | null
    descripcion: string
    clasificacion: string
    importe: string
  }[]
  detalles: {
    unidadId: string
    designacion: string
    coeficienteAplicado: string
    importeOrdinario: string
    importeExtraordinario: string
    deudaAnterior: string
    interesMora: string
    saldoAFavorAplicado: string
    ajusteRedondeo: string
    totalUnidad: string
  }[]
}

/**
 * La revision antes de emitir (`RF-07`, `CU-03`): los gastos del periodo y el
 * reparto por unidad tal como saldria, **sin escribir nada**. Si el padron no
 * cierra, el error del dominio llega aca igual que llegaria al emitir.
 */
export async function previsualizarLiquidacion(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; periodoId: string },
): Promise<VistaPreviaDeLiquidacion> {
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
      const vigente = await prisma.liquidacion.findFirst({
        where: { periodoId: datos.periodoId, estado: 'vigente' },
        select: { id: true },
      })
      if (vigente) throw new PeriodoYaLiquidado()

      const { periodo, reparto, vencimiento, detalles } = await calcular(
        reloj,
        datos.consorcioId,
        datos.periodoId,
      )

      const gastos = await prisma.gasto.findMany({
        where: { periodoId: periodo.id },
        select: {
          id: true,
          fecha: true,
          descripcion: true,
          importe: true,
          clasificacion: true,
          rubro: { select: { nombre: true } },
          proveedor: { select: { razonSocial: true } },
        },
        orderBy: [{ clasificacion: 'asc' }, { fecha: 'asc' }],
      })

      return {
        periodo: `${String(periodo.mes).padStart(2, '0')}/${periodo.anio}`,
        estado: periodo.estado,
        vencimiento: vencimiento.toISOString().slice(0, 10),
        totalOrdinario: reparto.totalOrdinario,
        totalExtraordinario: reparto.totalExtraordinario,
        totalGeneral: reparto.totalGeneral,
        gastos: gastos.map((gasto) => ({
          id: gasto.id,
          fecha: gasto.fecha.toISOString().slice(0, 10),
          rubro: gasto.rubro.nombre,
          proveedor: gasto.proveedor?.razonSocial ?? null,
          descripcion: gasto.descripcion,
          clasificacion: gasto.clasificacion,
          importe: importeSerializado(gasto.importe),
        })),
        detalles: detalles.map(({ desglose, id, ...detalle }) => {
          void desglose
          void id
          return {
            ...detalle,
            coeficienteAplicado: coeficienteSerializado(detalle.coeficienteAplicado),
          }
        }),
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
