import { importeSerializado } from '@/compartido/formato'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma } from '@/infraestructura/prisma'

/**
 * Listado de gastos (RF-10, FR-021). Es la pantalla del consorcista (`CU-05`) y
 * la primera que ve un usuario final, asi que la ven **todos** los habilitados
 * del consorcio, no solo quien carga.
 *
 * El filtro por consorcio **no se escribe aca**: lo pone la extension del
 * cliente porque `Gasto` declara `consorcio_id` (Principio I, SC-003). Lo que
 * esta consulta filtra es periodo y rubro, que son del negocio.
 *
 * El total se calcula sobre **todo** el conjunto filtrado y no sobre la pagina:
 * un total que cambia al pasar de pagina no es un total.
 */

export const POR_PAGINA = 50

export interface GastoDelListado {
  id: string
  fecha: string
  rubro: string
  proveedor: string | null
  descripcion: string
  clasificacion: string
  importe: string
  comprobantes: number
}

export interface ListadoDeGastos {
  gastos: GastoDelListado[]
  total: string
  cantidad: number
  pagina: number
  paginas: number
}

export async function listarGastos(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    periodoId?: string
    rubroId?: string
    pagina?: number
  },
): Promise<ListadoDeGastos> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver los gastos' },
    async () => {
      const filtro = {
        ...(datos.periodoId ? { periodoId: datos.periodoId } : {}),
        ...(datos.rubroId ? { rubroId: datos.rubroId } : {}),
      }

      const pagina = Math.max(1, Math.trunc(datos.pagina ?? 1))

      const [gastos, agregado] = await Promise.all([
        prisma.gasto.findMany({
          where: filtro,
          orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }],
          skip: (pagina - 1) * POR_PAGINA,
          take: POR_PAGINA,
          include: {
            rubro: { select: { nombre: true } },
            proveedor: { select: { razonSocial: true } },
            _count: { select: { comprobantes: true } },
          },
        }),
        prisma.gasto.aggregate({
          where: filtro,
          _sum: { importe: true },
          _count: true,
        }),
      ])

      return {
        gastos: gastos.map((gasto) => ({
          id: gasto.id,
          fecha: gasto.fecha.toISOString().slice(0, 10),
          rubro: gasto.rubro.nombre,
          proveedor: gasto.proveedor?.razonSocial ?? null,
          descripcion: gasto.descripcion,
          clasificacion: gasto.clasificacion,
          importe: importeSerializado(gasto.importe),
          comprobantes: gasto._count.comprobantes,
        })),
        // La suma la hace la base en decimal; convertirla a numero para sumarla
        // en el servidor perderia centavos justo en los totales largos.
        total: importeSerializado(agregado._sum.importe ?? '0'),
        cantidad: agregado._count,
        pagina,
        paginas: Math.max(1, Math.ceil(agregado._count / POR_PAGINA)),
      }
    },
  )
}
