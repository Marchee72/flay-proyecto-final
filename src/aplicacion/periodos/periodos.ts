import { ErrorDeAplicacion } from '@/compartido/errores'
import { importeSerializado } from '@/compartido/formato'
import type { EstadoPeriodo } from '@/dominio/periodos/estado'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'

/**
 * Periodos (FR-024). **Solo resolucion y listado**: cerrar, liquidar y anular son
 * alcance de `003-liquidacion`.
 *
 * El periodo no se abre a mano: es la consecuencia del primer gasto que se
 * imputa a ese mes. `periodoPara` lo devuelve si existe y lo crea si no, asi
 * que la unica pantalla que lo produce es la de gastos.
 */

export interface PeriodoDelConsorcio {
  id: string
  anio: number
  mes: number
  estado: EstadoPeriodo
  gastos: number
  /** Lo acumulado en gastos del periodo, `'0.00'` sin ninguno. */
  gastado: string
  /** La liquidacion **vigente**, si la hay: la anulada no cuenta (FR-003b). */
  liquidacion: { id: string; totalGeneral: string; vencimiento: string } | null
}

export class MesInvalido extends ErrorDeAplicacion {
  constructor() {
    super('El mes tiene que estar entre 1 y 12.', 'RF-04')
  }
}

/** El periodo de ese mes, creado si todavia no existia. Idempotente. */
export async function periodoPara(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; anio: number; mes: number },
): Promise<{ periodoId: string }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'imputar gastos a un período',
    },
    async () => {
      if (!Number.isInteger(datos.mes) || datos.mes < 1 || datos.mes > 12) throw new MesInvalido()

      // La clave unica (consorcio, anio, mes) garantiza que no haya dos; aca
      // solo se evita el rechazo devolviendo el que ya esta.
      const existente = await prisma.periodo.findFirst({
        where: { anio: datos.anio, mes: datos.mes },
      })

      if (existente) return { periodoId: existente.id }

      const creado = await prisma.periodo.create({
        data: sinConsorcio({ anio: datos.anio, mes: datos.mes }),
      })

      return { periodoId: creado.id }
    },
  )
}

/** Del mas nuevo al mas viejo: el mes en curso es el que se mira todo el tiempo. */
export async function listarPeriodos(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<PeriodoDelConsorcio[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      accion: 'ver los períodos',
    },
    async () => {
      const periodos = await prisma.periodo.findMany({
        orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
        include: {
          _count: { select: { gastos: true } },
          liquidaciones: {
            where: { estado: 'vigente' },
            select: { id: true, totalGeneral: true, vencimiento: true },
          },
        },
      })

      // Lo gastado sale de **una** agrupacion para todos los periodos, no de
      // una consulta por fila: con doce meses en pantalla serian doce viajes.
      const porPeriodo = await prisma.gasto.groupBy({
        by: ['periodoId'],
        _sum: { importe: true },
      })
      const gastado = new Map(porPeriodo.map((fila) => [fila.periodoId, fila._sum.importe]))

      return periodos.map((periodo) => {
        const [vigente] = periodo.liquidaciones

        return {
          id: periodo.id,
          anio: periodo.anio,
          mes: periodo.mes,
          estado: periodo.estado,
          gastos: periodo._count.gastos,
          gastado: importeSerializado(gastado.get(periodo.id) ?? '0'),
          liquidacion: vigente
            ? {
                id: vigente.id,
                // Como cadena, siempre: el importe no cruza como numero
                // (medida 3 de § 14.1).
                totalGeneral: importeSerializado(vigente.totalGeneral),
                vencimiento: vigente.vencimiento.toISOString().slice(0, 10),
              }
            : null,
        }
      })
    },
  )
}
