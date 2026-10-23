import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { ProcesadorDePagos } from '@/dominio/contratos/procesador-pagos'
import { verificarFirmaWebhookMercadoPago } from '@/dominio/pagos/firma-webhook'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import { enConsorcio } from '@/infraestructura/cliente-aislado'
import { obtenerCredencialesDescifradas } from '@/aplicacion/administradoras/credenciales-pago'
import { notificar } from '@/aplicacion/comunicacion/notificar'
import { detallesImpagosDe, imputarYRegistrar } from '@/aplicacion/pagos/registrar'
import { importeParaMostrar } from '@/compartido/formato'

/**
 * Confirmacion de pago en linea (`RF-28`, D-4).
 *
 * Invocable tanto por webhook como por la vista de retorno del usuario.
 * Siempre consulta la API oficial con el Access Token del servidor para
 * verificar el estado real y el importe acreditado (tolerancia cero al fraude).
 */

export interface ResultadoConfirmacionPago {
  estado: 'iniciado' | 'aprobado' | 'rechazado' | 'vencido' | 'pendiente'
  pagoId?: string | null
  intentoId: string
  mensaje?: string
}

export class PagoExternoNoEncontrado extends ErrorDeAplicacion {
  constructor() {
    super('No se encontro el pago en la pasarela de pagos.', 'RF-28')
  }
}

export async function confirmarPagoEnLinea(
  procesador: ProcesadorDePagos,
  datos: {
    consorcioId: string
    pagoExternoId: string
    intentoId?: string
  },
): Promise<ResultadoConfirmacionPago> {
  const id = datos.consorcioId
  const consorcio = await prismaBase.consorcio.findUnique({
    where: { id },
    select: { id: true, administradoraId: true },
  })

  if (!consorcio) {
    throw new NoEncontrado()
  }

  const credenciales = await obtenerCredencialesDescifradas(consorcio.administradoraId)
  if (!credenciales) {
    throw new ErrorDeAplicacion(
      'La administradora del consorcio no tiene credenciales configuradas.',
      'RF-28',
    )
  }

  // Consultar a la API oficial de Mercado Pago
  const pagoApi = await procesador.consultarPago({
    credenciales,
    pagoExternoId: datos.pagoExternoId,
  })

  const intentoId = pagoApi.referenciaExterna || datos.intentoId
  if (!intentoId) {
    throw new PagoExternoNoEncontrado()
  }

  // Buscar el intento de pago
  const intento = await prismaBase.intentoDePago.findUnique({
    where: { id: intentoId },
  })

  // Validar aislamiento: el intento debe pertenecer al consorcio notificado
  if (!intento || intento.consorcioId !== datos.consorcioId) {
    throw new NoEncontrado()
  }

  // Si ya fue aprobado o procesado previamente, retornar estado (idempotencia)
  if (intento.estado === 'aprobado') {
    return {
      estado: 'aprobado',
      pagoId: intento.pagoId,
      intentoId: intento.id,
      mensaje: 'El pago ya se encuentra registrado e imputado.',
    }
  }

  if (pagoApi.estado === 'rechazado' || pagoApi.estado === 'cancelado') {
    await prismaBase.intentoDePago.update({
      where: { id: intento.id },
      data: { estado: 'rechazado', pagoExternoId: datos.pagoExternoId },
    })

    return {
      estado: 'rechazado',
      intentoId: intento.id,
      mensaje: 'El pago fue rechazado o cancelado en la pasarela.',
    }
  }

  if (pagoApi.estado === 'pendiente') {
    return {
      estado: 'pendiente',
      intentoId: intento.id,
      mensaje: 'El pago se encuentra pendiente de acreditacion.',
    }
  }

  // Estado aprobado: registrar e imputar en una transaccion atomica
  return enConsorcio(datos.consorcioId, async () => {
    // El recargo se mide a la fecha en que se acredito el pago (RF-08).
    const impagos = await detallesImpagosDe(intento.unidadId, pagoApi.fechaAprobacion ?? new Date())

    // Contexto del aviso al pagador (RF-28): unidad y periodo del detalle.
    const contexto = await prisma.detalleLiquidacion.findFirst({
      where: { id: intento.detalleLiquidacionId },
      select: {
        unidad: { select: { designacion: true } },
        liquidacion: { select: { periodo: { select: { anio: true, mes: true } } } },
      },
    })

    const pagoRegistrado = await prisma.$transaction(async (tx) => {
      // Bloqueo optimista / idempotencia: solo actualiza si sigue iniciado
      const afectado = await tx.intentoDePago.updateMany({
        where: { id: intento.id, estado: 'iniciado' },
        data: {
          estado: 'aprobado',
          pagoExternoId: datos.pagoExternoId,
        },
      })

      if (afectado.count === 0) {
        // Otra ejecucion concurrente ya lo proceso
        const actual = await tx.intentoDePago.findUniqueOrThrow({ where: { id: intento.id } })
        return { pagoId: actual.pagoId }
      }

      // Imputar y registrar pago con medio mercado_pago
      const pago = await imputarYRegistrar(tx, {
        unidadId: intento.unidadId,
        importe: pagoApi.importe,
        fechaPago: pagoApi.fechaAprobacion ?? new Date(),
        medio: 'mercado_pago',
        referencia: `MP-${datos.pagoExternoId}`,
        registradoPor: intento.iniciadoPor,
        impagos,
      })

      // Enlazar intento de pago con el pago persistido
      await tx.intentoDePago.update({
        where: { id: intento.id },
        data: { pagoId: pago.pagoId },
      })

      // Aviso al pagador. Solo en este camino (el que creo el pago): la
      // reconfirmacion idempotente sale por `afectado.count === 0` y no vuelve
      // aca, asi que no se duplica.
      const periodo = contexto
        ? `${String(contexto.liquidacion.periodo.mes).padStart(2, '0')}/${contexto.liquidacion.periodo.anio}`
        : ''
      const unidad = contexto?.unidad.designacion
      await notificar(tx, [
        {
          usuarioId: intento.iniciadoPor,
          tipo: 'pago_acreditado',
          titulo: 'Pago acreditado',
          cuerpo:
            `Tu pago de ${importeParaMostrar(pagoApi.importe)}` +
            (unidad ? ` de la unidad ${unidad} (${periodo})` : '') +
            ' fue acreditado e imputado.',
          entidadTipo: 'Pago',
          entidadId: pago.pagoId,
        },
      ])

      return { pagoId: pago.pagoId }
    })

    return {
      estado: 'aprobado',
      pagoId: pagoRegistrado.pagoId,
      intentoId: intento.id,
      mensaje: 'Pago acreditado e imputado correctamente.',
    }
  })
}

export class FirmaWebhookInvalida extends ErrorDeAplicacion {
  constructor() {
    super('Firma de la notificacion invalida.', 'RF-28')
  }
}

export class PasarelaNoConfiguradaWebhook extends ErrorDeAplicacion {
  constructor() {
    super('La pasarela de pagos no esta configurada para este consorcio.', 'RF-28')
  }
}

export interface ParametrosProcesarWebhook {
  consorcioId: string
  xSignature?: string | null
  xRequestId?: string | null
  body: Record<string, unknown>
}

export interface ResultadoProcesamientoWebhook {
  recibido: true
  ignorado?: boolean
  motivo?: string
  estado?: string
  pagoId?: string | null
}

export async function procesarWebhookPago(
  procesador: ProcesadorDePagos,
  datos: ParametrosProcesarWebhook,
): Promise<ResultadoProcesamientoWebhook> {
  const id = datos.consorcioId
  const consorcio = await prismaBase.consorcio.findUnique({
    where: { id },
    select: { id: true, administradoraId: true },
  })

  if (!consorcio) {
    throw new NoEncontrado()
  }

  const credenciales = await obtenerCredencialesDescifradas(consorcio.administradoraId)
  if (!credenciales || !credenciales.secretoWebhook) {
    throw new PasarelaNoConfiguradaWebhook()
  }

  const dataObj = datos.body?.data as { id?: string | number } | undefined
  const dataId = dataObj?.id ? String(dataObj.id) : datos.body?.id ? String(datos.body.id) : null
  const tipo =
    (datos.body?.type as string) || (datos.body?.topic as string) || (datos.body?.action as string)

  if (!dataId) {
    return { recibido: true, ignorado: true }
  }

  const firmaValida = verificarFirmaWebhookMercadoPago({
    xSignature: datos.xSignature,
    xRequestId: datos.xRequestId,
    dataId,
    secreto: credenciales.secretoWebhook,
  })

  if (!firmaValida) {
    throw new FirmaWebhookInvalida()
  }

  if (tipo && tipo !== 'payment' && !tipo.startsWith('payment.')) {
    return { recibido: true, ignorado: true }
  }

  try {
    const resultado = await confirmarPagoEnLinea(procesador, {
      consorcioId: datos.consorcioId,
      pagoExternoId: dataId,
    })

    return {
      recibido: true,
      estado: resultado.estado,
      pagoId: resultado.pagoId,
    }
  } catch (error) {
    if (error instanceof PagoExternoNoEncontrado || error instanceof NoEncontrado) {
      return { recibido: true, ignorado: true, motivo: error.message }
    }
    throw error
  }
}
