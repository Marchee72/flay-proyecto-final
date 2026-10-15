import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { ProcesadorDePagos } from '@/dominio/contratos/procesador-pagos'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import { enConsorcio } from '@/infraestructura/cliente-aislado'
import { obtenerCredencialesDescifradas } from '@/aplicacion/administradoras/credenciales-pago'
import { detallesImpagosDe, imputarYRegistrar } from '@/aplicacion/pagos/registrar'

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
  const consorcio = await prismaBase.consorcio.findUnique({
    where: { id: datos.consorcioId },
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
    const impagos = await detallesImpagosDe(intento.unidadId)

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
