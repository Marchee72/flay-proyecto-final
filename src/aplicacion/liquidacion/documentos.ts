import { z } from 'zod'

import { Decimal, importe } from '@/compartido/dinero'
import { fechaParaMostrar, importeSerializado } from '@/compartido/formato'
import { montoExigible } from '@/dominio/liquidacion/vencimientos'
import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type {
  ExpensaParaDocumento,
  GastosDeClasificacion,
  GeneradorDeDocumentos,
} from '@/dominio/contratos/documentos'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { reintentarAhora, type Manejador } from '@/aplicacion/pendientes/drenar'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Generacion diferida del documento de expensa (`FR-016`, `FR-019`, research
 * R-01 y R-02).
 *
 * La emision encolo un trabajo por unidad, y los drena el `after()` del panel:
 * cada pedido despacha un lote. Mientras el administrador mira la liquidacion,
 * `EnVivo` refresca cada pocos segundos y cada refresco empuja un lote, asi que
 * las 96 unidades cierran solas sin volver a apretar nada (SC-007, decision 21).
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
            vencimientos: { orderBy: { orden: 'asc' } },
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
      // Los vencimientos escalonados con el monto a pagar hasta cada fecha
      // (RF-08). Al emitir el saldo es el total, asi que el monto sale del total.
      // Una liquidacion vieja sin tramos usa su vencimiento unico sin recargo.
      vencimientos: (detalle.liquidacion.vencimientos.length > 0
        ? detalle.liquidacion.vencimientos.map((v) => ({
            fecha: v.fecha,
            recargo: v.recargoPorcentaje.toFixed(4),
          }))
        : [{ fecha: detalle.liquidacion.vencimiento, recargo: '0.0000' }]
      ).map((tramo) => ({
        fecha: fechaParaMostrar(tramo.fecha.toISOString()),
        recargoPorcentaje: tramo.recargo,
        monto: montoExigible(importeSerializado(detalle.totalUnidad), tramo.recargo),
      })),
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

export interface ProgresoDeDocumentos {
  generados: number
  total: number
  /** Trabajos `documento_expensa` de esta liquidacion aun por despachar. */
  enCola: number
  /** Los que agotaron sus reintentos: faltan por un problema, no por demora. */
  agotados: number
}

/**
 * Como van los documentos de una liquidacion: cuantos salieron, cuantos quedan
 * en cola y cuantos se trabaron (`FR-016`, SC-007).
 *
 * No hay disparo explicito: la cola la drena el `after()` del panel en cada
 * pedido, y `EnVivo` la empuja refrescando mientras `enCola > 0` (decision 21).
 * `enCola`/`agotados` salen de `TrabajoPendiente` por su `liquidacionId`, que es
 * de un solo consorcio; el cliente crudo alcanza, como en el manejador (SC-003).
 */
export async function progresoDe(liquidacionId: string): Promise<ProgresoDeDocumentos> {
  const porLiquidacion = (estado: 'pendiente' | 'agotado') => ({
    tipo: 'documento_expensa' as const,
    estado,
    carga: { path: ['liquidacionId'], equals: liquidacionId },
  })

  const [total, generados, enCola, agotados] = await Promise.all([
    prisma.detalleLiquidacion.count({ where: { liquidacionId } }),
    prisma.detalleLiquidacion.count({ where: { liquidacionId, claveDocumento: { not: null } } }),
    prismaBase.trabajoPendiente.count({ where: porLiquidacion('pendiente') }),
    prismaBase.trabajoPendiente.count({ where: porLiquidacion('agotado') }),
  ])

  return { generados, total, enCola, agotados }
}

/**
 * Reintento explicito de los documentos agotados de **una** liquidacion: los
 * revive con el proximo intento ahora y el sondeo de `EnVivo` los despacha
 * (decision 21). Devuelve cuantos revivio.
 */
export async function reintentarDocumentos(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; liquidacionId: string },
): Promise<number> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'reintentar los documentos',
    },
    async () => {
      // La liquidacion se lee por la extension aislada: si no es de este consorcio, no existe.
      const propia = await prisma.liquidacion.findFirst({
        where: { id: datos.liquidacionId },
        select: { id: true },
      })
      if (!propia) return 0
      const agotados = await prismaBase.trabajoPendiente.findMany({
        where: {
          tipo: 'documento_expensa',
          estado: 'agotado',
          carga: { path: ['liquidacionId'], equals: datos.liquidacionId },
        },
        select: { id: true },
      })
      for (const trabajo of agotados) await reintentarAhora(trabajo.id)
      return agotados.length
    },
  )
}
