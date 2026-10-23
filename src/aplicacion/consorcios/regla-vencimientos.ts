import { importe } from '@/compartido/dinero'
import { validarReglaVencimientos, type TramoRegla } from '@/dominio/liquidacion/vencimientos'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Regla de vencimientos escalonados del consorcio (RF-08).
 *
 * Configuracion fija por consorcio, como `diaVencimiento`/`tasaMoraMensual`: de 1
 * a 3 tramos (dia del mes + recargo %), el primero base (0 %). La valida el
 * dominio (`validarReglaVencimientos`), incluida la condicion mora > ultimo
 * recargo. Un consorcio sin regla equivale a un solo tramo al `diaVencimiento`.
 */

export interface TramoVencimientoVisible {
  orden: number
  diaDelMes: number
  /** Porcentaje como cadena, p. ej. `'5.0000'`. */
  recargoPorcentaje: string
}

export interface ReglaVencimientosVisible {
  tramos: TramoVencimientoVisible[]
  /** La tasa de mora del consorcio, para que la UI pueda explicar el tope. */
  tasaMoraMensual: string
  /** Verdadero si todavia no se configuro y se muestra el equivalente por omision. */
  porOmision: boolean
}

/** La regla equivalente de un consorcio sin tramos cargados: un solo vencimiento. */
function reglaPorOmision(diaVencimiento: number): TramoVencimientoVisible[] {
  return [{ orden: 1, diaDelMes: diaVencimiento, recargoPorcentaje: '0.0000' }]
}

export async function verReglaVencimientos(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<ReglaVencimientosVisible> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'ver la regla de vencimientos',
    },
    async () => {
      const consorcio = await prismaBase.consorcio.findUniqueOrThrow({
        where: { id: datos.consorcioId },
        select: { diaVencimiento: true, tasaMoraMensual: true },
      })
      const tramos = await prisma.tramoVencimiento.findMany({ orderBy: { orden: 'asc' } })

      return {
        tramos:
          tramos.length > 0
            ? tramos.map((t) => ({
                orden: t.orden,
                diaDelMes: t.diaDelMes,
                recargoPorcentaje: importe(t.recargoPorcentaje.toFixed(4)).toFixed(4),
              }))
            : reglaPorOmision(consorcio.diaVencimiento),
        tasaMoraMensual: importe(consorcio.tasaMoraMensual.toFixed(4)).toFixed(4),
        porOmision: tramos.length === 0,
      }
    },
  )
}

export async function guardarReglaVencimientos(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; tramos: readonly TramoRegla[] },
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'configurar la regla de vencimientos',
    },
    async () => {
      const consorcio = await prismaBase.consorcio.findUniqueOrThrow({
        where: { id: datos.consorcioId },
        select: { tasaMoraMensual: true },
      })

      // El dominio valida: 1 a 3 tramos, dias ascendentes <= 28, primero en 0 %,
      // y mora > recargo del ultimo (si no, lanza con mensaje comprensible).
      validarReglaVencimientos(datos.tramos, consorcio.tasaMoraMensual.toFixed(4))

      // Reemplazo completo en una transaccion: la regla es el conjunto, no filas
      // sueltas. El aislamiento acota el delete y el create a este consorcio.
      await prisma.$transaction(async (tx) => {
        await tx.tramoVencimiento.deleteMany({})
        await tx.tramoVencimiento.createMany({
          data: datos.tramos.map((tramo) =>
            sinConsorcio({
              orden: tramo.orden,
              diaDelMes: tramo.diaDelMes,
              recargoPorcentaje: tramo.recargoPorcentaje,
            }),
          ),
        })
      })
    },
  )
}
