import { conAutorizacion } from '@/aplicacion/autorizacion'
import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import { Decimal, importe } from '@/compartido/dinero'
import type { ProcesadorDePagos } from '@/dominio/contratos/procesador-pagos'
import type { Reloj } from '@/dominio/contratos/reloj'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import { saldosDeUnidad } from '@/dominio/liquidacion/saldo'
import { ocupaUnidad } from '@/infraestructura/repositorios/ocupaciones'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import { obtenerCredencialesDescifradas } from '@/aplicacion/administradoras/credenciales-pago'

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

      // Crear intento de pago
      const intento = await prismaBase.intentoDePago.create({
        data: {
          consorcioId: datos.consorcioId,
          unidadId: detalle.unidadId,
          detalleLiquidacionId: detalle.id,
          importe: saldos.saldoExigible,
          iniciadoPor: datos.usuarioId,
          venceEn,
          estado: 'iniciado',
        },
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
          importe: saldos.saldoExigible,
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
