import { ErrorDeAplicacion } from '@/compartido/errores'
import { transicionValida, type EstadoPeriodo } from '@/dominio/periodos/estado'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma } from '@/infraestructura/prisma'

/**
 * Estado del periodo: cerrar y reabrir (`FR-001`, `FR-002`, regla RN-03 § 7.2).
 *
 * Las transiciones validas las decide el contrato del dominio que `002` dejo
 * declarado y congelado (M-04). Esta capa **no las reinventa**: pregunta.
 */

export class TransicionDePeriodoInvalida extends ErrorDeAplicacion {
  constructor(desde: EstadoPeriodo, hacia: EstadoPeriodo) {
    super(
      `Un período ${desde} no puede pasar a ${hacia}. ` +
        (desde === 'liquidado'
          ? 'Lo que haya que corregir se corrige anulando la liquidación y emitiendo otra.'
          : 'Revisá el estado del período.'),
      'RN-06',
      { desde, hacia },
    )
  }
}

async function cambiarEstado(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; periodoId: string },
  hacia: EstadoPeriodo,
  accion: string,
): Promise<{ estado: EstadoPeriodo }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion,
    },
    async () => {
      const periodo = await prisma.periodo.findFirst({ where: { id: datos.periodoId } })
      if (!periodo) throw new PeriodoInexistente()

      if (!transicionValida(periodo.estado, hacia)) {
        throw new TransicionDePeriodoInvalida(periodo.estado, hacia)
      }

      await prisma.periodo.update({ where: { id: periodo.id }, data: { estado: hacia } })

      return { estado: hacia }
    },
  )
}

export class PeriodoInexistente extends ErrorDeAplicacion {
  constructor() {
    super('No encontramos ese período.', 'RF-04')
  }
}

/** Cerrar es la condicion para liquidar: desde aca no entran mas gastos. */
export const cerrarPeriodo = (
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; periodoId: string },
) => cambiarEstado(repositorio, reloj, datos, 'cerrado', 'cerrar períodos')

/**
 * Reabrir un periodo cerrado es normal —se cierra para liquidar y aparece una
 * factura del mes—; reabrir uno liquidado no, y el contrato de `002` lo impide.
 */
export const reabrirPeriodo = (
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; periodoId: string },
) => cambiarEstado(repositorio, reloj, datos, 'abierto', 'reabrir períodos')
