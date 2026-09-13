import { filaCsv } from '@/compartido/csv'
import { importeSerializado } from '@/compartido/formato'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma } from '@/infraestructura/prisma'

/**
 * Exportacion abierta por consorcio (`FR-032b`, SC-018, research R-13): lo que
 * permite irse del sistema con los datos. Se sirve por paginas para que el
 * manejador de ruta la emita en flujo; cada pagina vuelve a pasar por la
 * habilitacion y por el aislamiento, que es lo que hace imposible que una
 * pagina traiga filas ajenas. Importes como cadena, nunca `number`.
 */

export const TABLAS = ['gastos', 'liquidaciones', 'pagos'] as const
export type TablaExportable = (typeof TABLAS)[number]

const ENCABEZADOS: Record<TablaExportable, readonly string[]> = {
  gastos: [
    'id',
    'fecha',
    'periodo',
    'rubro',
    'clasificacion',
    'proveedor',
    'cuit_proveedor',
    'importe',
    'descripcion',
  ],
  liquidaciones: [
    'liquidacion_id',
    'periodo',
    'estado',
    'emitida_en',
    'vencimiento',
    'unidad',
    'coeficiente',
    'importe_ordinario',
    'importe_extraordinario',
    'ajuste_redondeo',
    'deuda_anterior',
    'interes_mora',
    'saldo_a_favor_aplicado',
    'total_unidad',
  ],
  pagos: ['id', 'fecha_pago', 'unidad', 'medio', 'referencia', 'importe', 'saldo_a_favor'],
}

export const TAMANO_DE_PAGINA = 500

export interface PaginaExportada {
  /** Lineas CSV ya escapadas, sin encabezado. */
  lineas: string[]
  /** Cursor para la pagina siguiente, o null si esta fue la ultima. */
  siguiente: string | null
}

export const encabezadoCsv = (tabla: TablaExportable) => filaCsv(ENCABEZADOS[tabla])

const periodo = (p: { anio: number; mes: number }) => `${p.anio}-${String(p.mes).padStart(2, '0')}`
const dia = (fecha: Date) => fecha.toISOString().slice(0, 10)

export async function paginaExportada(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    tabla: TablaExportable
    despuesDe?: string | null
    tamano?: number
  },
): Promise<PaginaExportada> {
  const tamano = datos.tamano ?? TAMANO_DE_PAGINA
  const cursor = datos.despuesDe ? { cursor: { id: datos.despuesDe }, skip: 1 } : {}
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador', 'consejo'],
      accion: 'exportar los datos del consorcio',
    },
    async () => {
      switch (datos.tabla) {
        case 'gastos': {
          const filas = await prisma.gasto.findMany({
            ...cursor,
            take: tamano,
            orderBy: { id: 'asc' },
            include: { periodo: true, rubro: true, proveedor: true },
          })
          return {
            lineas: filas.map((g) =>
              filaCsv([
                g.id,
                dia(g.fecha),
                periodo(g.periodo),
                g.rubro.nombre,
                g.clasificacion,
                g.proveedor?.razonSocial ?? null,
                g.proveedor?.cuit ?? null,
                importeSerializado(g.importe),
                g.descripcion,
              ]),
            ),
            siguiente: filas.length === tamano ? filas[filas.length - 1].id : null,
          }
        }
        case 'liquidaciones': {
          // Los detalles no llevan consorcio: se alcanzan por la liquidacion,
          // que si esta aislada (nota 10 de CLAUDE.md).
          const filas = await prisma.liquidacion.findMany({
            ...cursor,
            take: tamano,
            orderBy: { id: 'asc' },
            include: {
              periodo: true,
              detalles: { include: { unidad: true }, orderBy: { unidad: { designacion: 'asc' } } },
            },
          })
          return {
            lineas: filas.flatMap((l) =>
              l.detalles.map((d) =>
                filaCsv([
                  l.id,
                  periodo(l.periodo),
                  l.estado,
                  l.emitidaEn.toISOString(),
                  dia(l.vencimiento),
                  d.unidad.designacion,
                  d.coeficienteAplicado.toFixed(8),
                  importeSerializado(d.importeOrdinario),
                  importeSerializado(d.importeExtraordinario),
                  importeSerializado(d.ajusteRedondeo),
                  importeSerializado(d.deudaAnterior),
                  importeSerializado(d.interesMora),
                  importeSerializado(d.saldoAFavorAplicado),
                  importeSerializado(d.totalUnidad),
                ]),
              ),
            ),
            siguiente: filas.length === tamano ? filas[filas.length - 1].id : null,
          }
        }
        case 'pagos': {
          const filas = await prisma.pago.findMany({
            ...cursor,
            take: tamano,
            orderBy: { id: 'asc' },
            include: { unidad: true },
          })
          return {
            lineas: filas.map((p) =>
              filaCsv([
                p.id,
                dia(p.fechaPago),
                p.unidad.designacion,
                p.medio,
                p.referencia,
                importeSerializado(p.importe),
                importeSerializado(p.saldoAFavor),
              ]),
            ),
            siguiente: filas.length === tamano ? filas[filas.length - 1].id : null,
          }
        }
      }
    },
  )
}
