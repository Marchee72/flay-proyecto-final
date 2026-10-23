import { conAutorizacion } from '@/aplicacion/autorizacion'
import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import { Decimal, importe } from '@/compartido/dinero'
import type { ProcesadorDePagos } from '@/dominio/contratos/procesador-pagos'
import type { Reloj } from '@/dominio/contratos/reloj'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import { saldosDeUnidad } from '@/dominio/liquidacion/saldo'
import { montoExigible } from '@/dominio/liquidacion/vencimientos'
import { ocupaUnidad } from '@/infraestructura/repositorios/ocupaciones'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import { obtenerCredencialesDescifradas } from '@/aplicacion/administradoras/credenciales-pago'
import { detallesImpagosDe } from '@/aplicacion/pagos/registrar'

/**
 * El monto a cobrar hoy: la deuda consolidada mas el recargo del tramo vigente
 * de cada expensa (RF-08). Coincide con lo que la imputacion consumira al
 * acreditarse (base a la deuda, recargo como cargo propio).
 */
async function exigibleConRecargo(unidadId: string, hoy: Date): Promise<string> {
  const impagos = await detallesImpagosDe(unidadId, hoy)
  return impagos
    .reduce(
      (total, i) => total.plus(importe(montoExigible(i.saldo, i.recargoPorcentaje ?? '0'))),
      new Decimal(0),
    )
    .toFixed(DECIMALES_IMPORTE)
}

/**
 * Inicio de cobro en linea de expensas con pasarela (`RF-28`, D-1, D-3).
 *
 * Valida que la expensa sea la ultima vigente de la unidad y crea un
 * IntentoDePago con el saldo exigible exacto calculado por el dominio.
 */

const DECIMALES_IMPORTE = 2
const HORAS_VENCIMIENTO_INTENTO = 24

export class ExpensaNoEsUltimaVigente extends ErrorDeAplicacion {
  constructor() {
    super(
      'Solo se puede pagar la ultima expensa emitida. La deuda de meses anteriores ya se encuentra consolidada en ella.',
      'RF-28',
    )
  }
}

export class ExpensaSinSaldoPendiente extends ErrorDeAplicacion {
  constructor() {
    super('La expensa ya se encuentra totalmente saldada.', 'RF-28')
  }
}

export class PasarelaNoConfigurada extends ErrorDeAplicacion {
  constructor() {
    super(
      'El cobro en linea no esta configurado para este consorcio. Consulta con tu administracion.',
      'RF-28',
    )
  }
}

export interface ResultadoInicioPagoEnLinea {
  intentoId: string
  urlPago: string
}

export async function iniciarPagoEnLinea(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  procesador: ProcesadorDePagos,
  datos: {
    usuarioId: string
    consorcioId: string
    detalleLiquidacionId: string
    urlBaseRetorno: string
    urlBaseNotificacion?: string
  },
): Promise<ResultadoInicioPagoEnLinea> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['consorcista', 'administrador', 'consejo'],
      accion: 'iniciar pago en linea de expensas',
    },
    async (acceso) => {
      const ahora = reloj.hoy()

      const detalle = await prisma.detalleLiquidacion.findFirst({
        where: { id: datos.detalleLiquidacionId },
        include: {
          unidad: true,
          liquidacion: { include: { periodo: true, consorcio: true } },
        },
      })

      if (!detalle || detalle.liquidacion.estado !== 'vigente') {
        throw new NoEncontrado()
      }

      // Si es consorcista, validar que ocupe la unidad
      const esPrivilegiado = acceso.roles.some((r) => r === 'administrador' || r === 'consejo')
      if (!esPrivilegiado && !(await ocupaUnidad(datos.usuarioId, detalle.unidadId, ahora))) {
        throw new NoEncontrado()
      }

      // Obtener todas las liquidaciones vigentes de la unidad para verificar que sea la ultima
      const todosDetalles = await prisma.detalleLiquidacion.findMany({
        where: {
          unidadId: detalle.unidadId,
          liquidacion: { estado: 'vigente' },
        },
        include: {
          liquidacion: { select: { vencimiento: true, emitidaEn: true } },
          imputaciones: { where: { revertidaEn: null }, select: { importeImputado: true } },
        },
        orderBy: { liquidacion: { vencimiento: 'asc' } },
      })

      if (todosDetalles.length === 0) {
        throw new NoEncontrado()
      }

      const ultimoDetalle = todosDetalles[todosDetalles.length - 1]
      if (ultimoDetalle.id !== detalle.id) {
        throw new ExpensaNoEsUltimaVigente()
      }

      // Calcular saldos propios y saldo exigible consolidado
      const saldos = saldosDeUnidad(
        todosDetalles.map((d) => ({
          detalleId: d.id,
          totalUnidad: d.totalUnidad.toFixed(DECIMALES_IMPORTE),
          deudaAnterior: d.deudaAnterior.toFixed(DECIMALES_IMPORTE),
          interesMora: d.interesMora.toFixed(DECIMALES_IMPORTE),
          vencimiento: d.liquidacion.vencimiento,
          imputado: d.imputaciones
            .reduce((tot, i) => tot.plus(importe(i.importeImputado.toFixed(2))), new Decimal(0))
            .toFixed(DECIMALES_IMPORTE),
        })),
      )

      if (importe(saldos.saldoExigible).lessThanOrEqualTo(0)) {
        throw new ExpensaSinSaldoPendiente()
      }

      // Lo que se cobra incluye el recargo del tramo vigente (RF-08).
      const importeACobrar = await exigibleConRecargo(detalle.unidadId, ahora)

      const credenciales = await obtenerCredencialesDescifradas(
        detalle.liquidacion.consorcio.administradoraId,
      )
      if (!credenciales) {
        throw new PasarelaNoConfigurada()
      }

      // Reutilizacion de intento vigente o marcado de vencidos
      const intentoExistente = await prismaBase.intentoDePago.findFirst({
        where: {
          detalleLiquidacionId: detalle.id,
          estado: 'iniciado',
        },
      })

      if (intentoExistente) {
        if (intentoExistente.venceEn.getTime() > ahora.getTime() && intentoExistente.urlPago) {
          return {
            intentoId: intentoExistente.id,
            urlPago: intentoExistente.urlPago,
          }
        }

        // Si ya expiro, marcarlo como vencido
        await prismaBase.intentoDePago.update({
          where: { id: intentoExistente.id },
          data: { estado: 'vencido' },
        })
      }

      const venceEn = new Date(ahora.getTime() + HORAS_VENCIMIENTO_INTENTO * 60 * 60 * 1000)

      // Crear intento de pago con aislamiento por consorcio
      const intento = await prisma.intentoDePago.create({
        data: sinConsorcio({
          unidadId: detalle.unidadId,
          detalleLiquidacionId: detalle.id,
          importe: importeACobrar,
          iniciadoPor: datos.usuarioId,
          venceEn,
          estado: 'iniciado',
        }),
      })

      const urlPublica =
        datos.urlBaseNotificacion || process.env.URL_PUBLICA || 'http://localhost:3000'
      const separadorRetorno = datos.urlBaseRetorno.includes('?') ? '&' : '?'
      const urlRetorno = `${datos.urlBaseRetorno}${separadorRetorno}intentoId=${intento.id}`
      const urlNotificacion = `${urlPublica}/api/pagos/webhook?consorcio=${datos.consorcioId}`

      const periodoMes = String(detalle.liquidacion.periodo.mes).padStart(2, '0')
      const titulo = `Expensas ${periodoMes}/${detalle.liquidacion.periodo.anio} - ${detalle.unidad.designacion}`

      try {
        const preferencia = await procesador.crearPreferencia({
          credenciales,
          intentoId: intento.id,
          titulo,
          importe: importeACobrar,
          urlRetorno,
          urlNotificacion,
          venceEn,
        })

        await prismaBase.intentoDePago.update({
          where: { id: intento.id },
          data: {
            preferenciaId: preferencia.preferenciaId,
            urlPago: preferencia.urlPago,
          },
        })

        return {
          intentoId: intento.id,
          urlPago: preferencia.urlPago,
        }
      } catch (error) {
        // Si la creacion de la preferencia falla, marcar como rechazado
        await prismaBase.intentoDePago.update({
          where: { id: intento.id },
          data: { estado: 'rechazado' },
        })
        throw error
      }
    },
  )
}

export interface DisponibilidadPagoEnLinea {
  pagable: boolean
  motivo?:
    | 'no-es-ultima'
    | 'saldada'
    | 'pasarela-no-configurada'
    | 'no-encontrada'
    | 'no-autorizado'
  saldoExigible?: string
}

export async function consultarDisponibilidadPagoEnLinea(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    detalleLiquidacionId: string
  },
): Promise<DisponibilidadPagoEnLinea> {
  const detalle = await prisma.detalleLiquidacion.findFirst({
    where: { id: datos.detalleLiquidacionId },
    include: {
      unidad: true,
      liquidacion: { include: { consorcio: true } },
    },
  })

  if (!detalle || detalle.liquidacion.estado !== 'vigente') {
    return { pagable: false, motivo: 'no-encontrada' }
  }

  const todosDetalles = await prisma.detalleLiquidacion.findMany({
    where: {
      unidadId: detalle.unidadId,
      liquidacion: { estado: 'vigente' },
    },
    include: {
      liquidacion: { select: { vencimiento: true } },
      imputaciones: { where: { revertidaEn: null }, select: { importeImputado: true } },
    },
    orderBy: { liquidacion: { vencimiento: 'asc' } },
  })

  if (todosDetalles.length === 0) {
    return { pagable: false, motivo: 'no-encontrada' }
  }

  const ultimo = todosDetalles[todosDetalles.length - 1]
  if (ultimo.id !== detalle.id) {
    return { pagable: false, motivo: 'no-es-ultima' }
  }

  const saldos = saldosDeUnidad(
    todosDetalles.map((d) => ({
      detalleId: d.id,
      totalUnidad: d.totalUnidad.toFixed(DECIMALES_IMPORTE),
      deudaAnterior: d.deudaAnterior.toFixed(DECIMALES_IMPORTE),
      interesMora: d.interesMora.toFixed(DECIMALES_IMPORTE),
      vencimiento: d.liquidacion.vencimiento,
      imputado: d.imputaciones
        .reduce((tot, i) => tot.plus(importe(i.importeImputado.toFixed(2))), new Decimal(0))
        .toFixed(DECIMALES_IMPORTE),
    })),
  )

  if (importe(saldos.saldoExigible).lessThanOrEqualTo(0)) {
    return { pagable: false, motivo: 'saldada', saldoExigible: '0.00' }
  }

  // El monto a cobrar incluye el recargo del tramo vigente (RF-08).
  const importeACobrar = await exigibleConRecargo(detalle.unidadId, reloj.hoy())

  const credencial = await prismaBase.credencialPagoAdministradora.findUnique({
    where: { administradoraId: detalle.liquidacion.consorcio.administradoraId },
    select: { id: true },
  })

  if (!credencial) {
    return {
      pagable: false,
      motivo: 'pasarela-no-configurada',
      saldoExigible: importeACobrar,
    }
  }

  return {
    pagable: true,
    saldoExigible: importeACobrar,
  }
}
