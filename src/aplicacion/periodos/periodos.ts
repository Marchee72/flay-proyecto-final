import { ErrorDeAplicacion } from '@/compartido/errores'
import type { EstadoPeriodo } from '@/dominio/periodos/estado'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'

/**
 * Periodos (FR-024). **Solo apertura y listado**: cerrar, liquidar y anular son
 * alcance de `003-liquidacion`.
 *
 * Va en esta historia y no en la quinta, como decia la especificacion, por una
 * razon simple: un gasto no puede existir sin periodo al cual imputarse, asi
 * que dejarlo para despues haria que la historia de gastos no fuera
 * independientemente probable.
 */

export interface PeriodoDelConsorcio {
  id: string
  anio: number
  mes: number
  estado: EstadoPeriodo
  gastos: number
}

export class PeriodoRepetido extends ErrorDeAplicacion {
  constructor(anio: number, mes: number) {
    super(`El período ${mes}/${anio} ya está abierto en este consorcio.`, 'RF-04', { anio, mes })
  }
}

export class MesInvalido extends ErrorDeAplicacion {
  constructor() {
    super('El mes tiene que estar entre 1 y 12.', 'RF-04')
  }
}

export async function abrirPeriodo(
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
      accion: 'abrir períodos',
    },
    async () => {
      if (!Number.isInteger(datos.mes) || datos.mes < 1 || datos.mes > 12) throw new MesInvalido()

      // La clave unica (consorcio, anio, mes) es la que **garantiza** que no
      // haya dos; esto existe para que el rechazo diga cual es el mes repetido.
      const existente = await prisma.periodo.findFirst({
        where: { anio: datos.anio, mes: datos.mes },
      })

      if (existente) throw new PeriodoRepetido(datos.anio, datos.mes)

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
        include: { _count: { select: { gastos: true } } },
      })

      return periodos.map((periodo) => ({
        id: periodo.id,
        anio: periodo.anio,
        mes: periodo.mes,
        estado: periodo.estado,
        gastos: periodo._count.gastos,
      }))
    },
  )
}
