import { z } from 'zod'

import { Decimal, importe } from '@/compartido/dinero'
import { fechaParaMostrar, importeSerializado } from '@/compartido/formato'
import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type {
  ExpensaParaDocumento,
  GastosDeClasificacion,
  GeneradorDeDocumentos,
} from '@/dominio/contratos/documentos'
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

    // Fuera del contexto de aislamiento: el periodo de la liquidacion es de un
    // solo consorcio, y alcanza para no traer gastos ajenos (SC-003).
    const gastos = await prismaBase.gasto.findMany({
      where: { periodoId: detalle.liquidacion.periodoId },
      select: {
        clasificacion: true,
        fecha: true,
        descripcion: true,
        importe: true,
        rubro: { select: { nombre: true } },
        proveedor: { select: { razonSocial: true } },
      },
      orderBy: [{ clasificacion: 'asc' }, { rubro: { nombre: 'asc' } }, { fecha: 'asc' }],
    })

    const datos: ExpensaParaDocumento = {
      consorcio: detalle.liquidacion.consorcio,
      periodo: periodoDe(detalle.liquidacion.periodo),
      vencimiento: fechaParaMostrar(detalle.liquidacion.vencimiento.toISOString()),
      unidad: detalle.unidad,
      coeficienteAplicado: detalle.coeficienteAplicado.toFixed(8),
      gastos: agruparGastos(gastos, {
        ordinario: importeSerializado(detalle.liquidacion.totalOrdinario),
        extraordinario: importeSerializado(detalle.liquidacion.totalExtraordinario),
      }),
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

/**
 * Clasificacion → rubro → gasto, en el orden en que llegan. El subtotal por
 * rubro se suma aca, en decimal; el total por clasificacion es el que la
 * liquidacion guardo, no una suma nueva (medida 3 de § 14.1).
 */
function agruparGastos(
  gastos: {
    clasificacion: GastosDeClasificacion['clasificacion']
    fecha: Date
    descripcion: string
    importe: { toFixed(decimales: number): string }
    rubro: { nombre: string }
    proveedor: { razonSocial: string } | null
  }[],
  totales: Record<GastosDeClasificacion['clasificacion'], string>,
): GastosDeClasificacion[] {
  const grupos: GastosDeClasificacion[] = []

  for (const gasto of gastos) {
    let grupo = grupos.at(-1)
    if (grupo?.clasificacion !== gasto.clasificacion) {
      grupo = {
        clasificacion: gasto.clasificacion,
        rubros: [],
        total: totales[gasto.clasificacion],
      }
      grupos.push(grupo)
    }
    let rubro = grupo.rubros.at(-1)
    if (rubro?.rubro !== gasto.rubro.nombre) {
      rubro = { rubro: gasto.rubro.nombre, subtotal: '', lineas: [] }
      grupo.rubros.push(rubro)
    }
    rubro.lineas.push({
      fecha: fechaParaMostrar(gasto.fecha.toISOString()),
      proveedor: gasto.proveedor?.razonSocial ?? null,
      descripcion: gasto.descripcion,
      importe: importeSerializado(gasto.importe.toFixed(2)),
    })
  }

  for (const rubro of grupos.flatMap((grupo) => grupo.rubros)) {
    rubro.subtotal = rubro.lineas
      .reduce((total, linea) => total.plus(importe(linea.importe)), new Decimal(0))
      .toFixed(2)
  }

  return grupos
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
