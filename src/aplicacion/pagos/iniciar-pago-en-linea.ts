import { conAutorizacion } from '@/aplicacion/autorizacion'
import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import { importe } from '@/compartido/dinero'
import type { ProcesadorDePagos } from '@/dominio/contratos/procesador-pagos'
import type { Reloj } from '@/dominio/contratos/reloj'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import { exigible } from '@/dominio/liquidacion/vencimientos'
import { ocupaUnidad } from '@/infraestructura/repositorios/ocupaciones'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import { finDelDiaArgentino } from '@/infraestructura/reloj'
import { obtenerCredencialesDescifradas } from '@/aplicacion/administradoras/credenciales-pago'
import { encolar } from '@/aplicacion/pendientes/encolar'
import { deudaDeUnidad, PagoBloqueadoHastaLiquidar } from '@/aplicacion/pagos/registrar'

/**
 * El detalle es la ultima expensa vigente de su unidad: la unica que se paga en
 * linea, porque arrastra la deuda de los meses anteriores.
 */
async function esUltimaVigente(unidadId: string, detalleId: string): Promise<boolean> {
  const ultimo = await prisma.detalleLiquidacion.findFirst({
    where: { unidadId, liquidacion: { estado: 'vigente' } },
    select: { id: true },
    orderBy: { liquidacion: { vencimiento: 'desc' } },
  })
  return ultimo?.id === detalleId
}

/**
 * Inicio de cobro en linea de expensas con pasarela (`RF-28`, D-1, D-3).
 *
 * Valida que la expensa sea la ultima vigente de la unidad y crea un
 * IntentoDePago con el saldo exigible exacto calculado por el dominio.
 */

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
      // El vencimiento del intento (y de la preferencia) se cuenta desde el
      // instante, no desde la medianoche: con `hoy()` vencia a las 21 h de Argentina.
      const instante = reloj.ahora()

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

      if (!(await esUltimaVigente(detalle.unidadId, detalle.id))) {
        throw new ExpensaNoEsUltimaVigente()
      }

      // La misma lectura que el pago manual y la pantalla: deuda consolidada mas
      // el recargo del tramo vigente de cada expensa (RF-08), que es lo que la
      // imputacion consume al acreditarse.
      const deuda = await deudaDeUnidad(detalle.unidadId, ahora)
      if (importe(deuda.saldoTotal).lessThanOrEqualTo(0)) {
        throw new ExpensaSinSaldoPendiente()
      }
      if (deuda.bloqueado) throw new PagoBloqueadoHastaLiquidar()

      const importeACobrar = exigible(deuda.impagos)

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
        // Solo se reutiliza si sigue pidiendo lo mismo: un cambio de tramo o un
        // pago manual en el medio dejaban a la pasarela cobrando el monto viejo.
        if (
          intentoExistente.venceEn.getTime() > instante.getTime() &&
          intentoExistente.urlPago &&
          importe(intentoExistente.importe.toFixed(2)).equals(importe(importeACobrar))
        ) {
          return {
            intentoId: intentoExistente.id,
            urlPago: intentoExistente.urlPago,
          }
        }

        // Vencido o con otro monto: se descarta y se crea otro.
        await prismaBase.intentoDePago.update({
          where: { id: intentoExistente.id },
          data: { estado: 'vencido' },
        })
      }

      // 24 h, pero nunca mas alla del dia en que cambia el tramo: pasado ese dia
      // el monto es otro (o, pasado el firme, no se acepta el pago).
      const en24h = new Date(instante.getTime() + HORAS_VENCIMIENTO_INTENTO * 60 * 60 * 1000)
      const finDelTramo = deuda.vigenteHasta ? finDelDiaArgentino(deuda.vigenteHasta) : null
      const venceEn = finDelTramo && finDelTramo < en24h ? finDelTramo : en24h

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

      let preferenciaUrl: string
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

        preferenciaUrl = preferencia.urlPago
      } catch (error) {
        // Si la creacion de la preferencia falla, marcar como rechazado
        await prismaBase.intentoDePago.update({
          where: { id: intento.id },
          data: { estado: 'rechazado' },
        })
        throw error
      }

      // La preferencia ya existe y esta guardada: si la cola falla, el intento sigue
      // vivo y la conciliacion al abrir la vista cubre ese caso.
      try {
        await encolar('conciliar_pago', {
          consorcioId: datos.consorcioId,
          detalleLiquidacionId: detalle.id,
          intentoId: intento.id,
        })
      } catch (error) {
        console.error('[conciliar_pago]', error)
      }

      return { intentoId: intento.id, urlPago: preferenciaUrl }
    },
  )
}

export interface DisponibilidadPagoEnLinea {
  pagable: boolean
  motivo?:
    | 'no-es-ultima'
    | 'saldada'
    | 'pasarela-no-configurada'
    | 'vencida-en-firme'
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

  if (!(await esUltimaVigente(detalle.unidadId, detalle.id))) {
    return { pagable: false, motivo: 'no-es-ultima' }
  }

  const deuda = await deudaDeUnidad(detalle.unidadId, reloj.hoy())
  if (importe(deuda.saldoTotal).lessThanOrEqualTo(0)) {
    return { pagable: false, motivo: 'saldada', saldoExigible: '0.00' }
  }
  if (deuda.bloqueado) return { pagable: false, motivo: 'vencida-en-firme' }

  // El monto a cobrar incluye el recargo del tramo vigente (RF-08).
  const importeACobrar = exigible(deuda.impagos)

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
