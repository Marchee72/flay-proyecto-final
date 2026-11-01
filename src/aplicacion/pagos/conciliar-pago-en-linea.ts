import { NoEncontrado } from '@/compartido/errores'
import type { ProcesadorDePagos } from '@/dominio/contratos/procesador-pagos'
import type { Reloj } from '@/dominio/contratos/reloj'
import { obtenerCredencialesDescifradas } from '@/aplicacion/administradoras/credenciales-pago'
import { confirmarPagoEnLinea } from '@/aplicacion/pagos/confirmar-pago-en-linea'
import { enConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Conciliacion de pagos en linea (`RF-28`).
 *
 * La confirmacion *push* —webhook o vista de retorno con `payment_id`— no esta
 * garantizada: sin URL publica ninguna llega y el intento queda `iniciado` para
 * siempre. Esta es la red *pull*: pregunta a la pasarela por los pagos cuya
 * referencia externa es el intento y decide que confirmar. Quien escribe el
 * `Pago` sigue siendo `confirmarPagoEnLinea`, y solo el.
 */

/** Un pago con tarjeta en revision puede aprobarse despues de que vence la preferencia. */
const HORAS_MARGEN_ACREDITACION = 72

export type EstadoConciliacion = 'aprobado' | 'rechazado' | 'vencido' | 'esperando'
export interface ResultadoConciliacion {
  intentoId: string
  estado: EstadoConciliacion
}

export async function conciliarIntento(
  procesador: ProcesadorDePagos,
  reloj: Reloj,
  datos: { consorcioId: string; detalleLiquidacionId: string; intentoId: string },
): Promise<ResultadoConciliacion> {
  const { consorcioId, intentoId } = datos
  const resultado = (estado: EstadoConciliacion) => ({ intentoId, estado })

  const intento = await enConsorcio(consorcioId, async () =>
    prisma.intentoDePago.findFirst({
      where: { id: intentoId, detalleLiquidacionId: datos.detalleLiquidacionId },
    }),
  )
  if (!intento) throw new NoEncontrado()

  if (intento.estado === 'aprobado') return resultado('aprobado')
  if (intento.estado === 'vencido' || !intento.preferenciaId) return resultado('vencido')
  const limite = intento.venceEn.getTime() + HORAS_MARGEN_ACREDITACION * 60 * 60 * 1000
  if (reloj.ahora().getTime() > limite) return resultado('vencido')

  const id = consorcioId
  const consorcio = await prismaBase.consorcio.findUnique({
    where: { id },
    select: { administradoraId: true },
  })
  if (!consorcio) throw new NoEncontrado()
  const credenciales = await obtenerCredencialesDescifradas(consorcio.administradoraId)
  if (!credenciales) return resultado('esperando')

  const encontrados = await procesador.buscarPagosPorReferencia({
    credenciales,
    referenciaExterna: intentoId,
  })

  const aprobados = encontrados.filter((pago) => pago.estado === 'aprobado')
  if (aprobados.length > 0) {
    for (const pago of aprobados) {
      await confirmarPagoEnLinea(procesador, {
        consorcioId,
        pagoExternoId: pago.pagoExternoId,
        intentoId,
      })
    }
    return resultado('aprobado')
  }

  if (encontrados.some((pago) => pago.estado === 'pendiente')) return resultado('esperando')

  const ultimo = encontrados[0]
  if (ultimo && (ultimo.estado === 'rechazado' || ultimo.estado === 'cancelado')) {
    await confirmarPagoEnLinea(procesador, {
      consorcioId,
      pagoExternoId: ultimo.pagoExternoId,
      intentoId,
    })
    return resultado('rechazado')
  }

  return resultado('esperando')
}

export async function conciliarPagosDelDetalle(
  procesador: ProcesadorDePagos,
  reloj: Reloj,
  datos: { consorcioId: string; detalleLiquidacionId: string },
): Promise<ResultadoConciliacion[]> {
  const intentos = await enConsorcio(datos.consorcioId, async () =>
    prisma.intentoDePago.findMany({
      where: {
        detalleLiquidacionId: datos.detalleLiquidacionId,
        estado: { in: ['iniciado', 'rechazado'] },
        preferenciaId: { not: null },
      },
      orderBy: { creadoEn: 'asc' },
      select: { id: true },
    }),
  )

  const resultados: ResultadoConciliacion[] = []
  for (const { id } of intentos) {
    resultados.push(await conciliarIntento(procesador, reloj, { ...datos, intentoId: id }))
  }
  return resultados
}
