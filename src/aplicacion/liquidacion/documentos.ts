import { z } from 'zod'

import { importeSerializado } from '@/compartido/formato'
import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type { ExpensaParaDocumento, GeneradorDeDocumentos } from '@/dominio/contratos/documentos'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { drenar, type Manejador } from '@/aplicacion/pendientes/drenar'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Generacion diferida del documento de expensa (`FR-016`, `FR-019`, research
 * R-01 y R-02).
 *
 * La emision encolo un trabajo por unidad. Dos caminos lo drenan: el
 * oportunista de `002` —el siguiente pedido despacha un lote— y el disparo
 * explicito de abajo, acotado por tiempo, que es el que cierra las 96 unidades
 * sin depender de que alguien navegue (SC-007).
 *
 * Una falla en un documento se reintenta con la espera creciente de la cola y
 * **no** toca la liquidacion ya emitida: el detalle sigue ahi, con
 * `clave_documento` en nulo hasta que salga.
 */

const CARGA = z.object({ detalleId: z.string().uuid(), liquidacionId: z.string().uuid() })

const claveDe = (consorcioId: string, liquidacionId: string, unidadId: string) =>
  `expensas/${consorcioId}/${liquidacionId}/${unidadId}.pdf`

const periodoDe = (periodo: { anio: number; mes: number }) =>
  `${String(periodo.mes).padStart(2, '0')}/${periodo.anio}`

/**
 * El manejador recibe sus dependencias por parametro, como todo caso de uso,
 * para poder probarse con dobles (decision 5 de `CLAUDE.md`). El drenaje corre
 * **fuera** de todo contexto de consorcio, asi que lee con el cliente crudo:
 * el trabajo ya nacio dentro de una emision autorizada.
 */
export function manejadorDocumentoExpensa(
  generador: GeneradorDeDocumentos,
  almacen: AlmacenObjetos,
): Manejador {
  return async (carga) => {
    const { detalleId } = CARGA.parse(carga)

    const detalle = await prismaBase.detalleLiquidacion.findUniqueOrThrow({
      where: { id: detalleId },
      include: {
        unidad: { select: { designacion: true, tipo: true } },
        intereses: {
          include: { liquidacionOrigen: { select: { periodo: true } } },
          orderBy: { meses: 'desc' },
        },
        liquidacion: {
          include: {
            periodo: { select: { anio: true, mes: true } },
            consorcio: { select: { id: true, nombre: true, direccion: true, localidad: true } },
          },
        },
      },
    })

    // Una liquidacion anulada no genera documento: lo que se le manda al
    // consorcista es la vigente, y la cola puede traer trabajos viejos.
    if (detalle.liquidacion.estado !== 'vigente') return

    const datos: ExpensaParaDocumento = {
      consorcio: detalle.liquidacion.consorcio,
      periodo: periodoDe(detalle.liquidacion.periodo),
      vencimiento: detalle.liquidacion.vencimiento.toISOString().slice(0, 10),
      unidad: detalle.unidad,
      coeficienteAplicado: detalle.coeficienteAplicado.toFixed(8),
      importeOrdinario: importeSerializado(detalle.importeOrdinario),
      importeExtraordinario: importeSerializado(detalle.importeExtraordinario),
      deudaAnterior: importeSerializado(detalle.deudaAnterior),
      interesMora: importeSerializado(detalle.interesMora),
      desgloseInteres: detalle.intereses.map((linea) => ({
        periodo: periodoDe(linea.liquidacionOrigen.periodo),
        capital: importeSerializado(linea.capital),
        tasaMensual: linea.tasaMensual.toFixed(4),
        meses: linea.meses,
        importe: importeSerializado(linea.importe),
      })),
      saldoAFavorAplicado: importeSerializado(detalle.saldoAFavorAplicado),
      ajusteRedondeo: importeSerializado(detalle.ajusteRedondeo),
      totalUnidad: importeSerializado(detalle.totalUnidad),
    }

    const clave = claveDe(detalle.liquidacion.consorcio.id, detalle.liquidacionId, detalle.unidadId)

    await almacen.guardar(clave, await generador.expensa(datos), 'application/pdf')

    await prismaBase.detalleLiquidacion.update({
      where: { id: detalle.id },
      data: { claveDocumento: clave },
    })
  }
}

/** Como maximo por disparo: un pedido web no puede durar minutos. */
const PRESUPUESTO_MS = 20_000

export interface ProgresoDeDocumentos {
  generados: number
  total: number
}

/**
 * Disparo explicito del administrador: drena la cola hasta agotar el
 * presupuesto de tiempo o los trabajos, y devuelve cuantos documentos hay
 * sobre cuantos faltan (`FR-016`, SC-007). Se puede apretar de nuevo.
 */
export async function generarDocumentos(
  manejador: Manejador,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; liquidacionId: string },
): Promise<ProgresoDeDocumentos> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'generar los documentos',
    },
    async () => {
      const inicio = Date.now()

      while (Date.now() - inicio < PRESUPUESTO_MS) {
        const { despachados, fallidos } = await drenar({ documento_expensa: manejador })
        if (despachados + fallidos === 0) break
      }

      return progresoDe(datos.liquidacionId)
    },
  )
}

export async function progresoDe(liquidacionId: string): Promise<ProgresoDeDocumentos> {
  const [total, generados] = await Promise.all([
    prisma.detalleLiquidacion.count({ where: { liquidacionId } }),
    prisma.detalleLiquidacion.count({ where: { liquidacionId, claveDocumento: { not: null } } }),
  ])

  return { generados, total }
}
