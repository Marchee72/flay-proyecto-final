import type { Clasificacion } from '@prisma/client'

import { importe } from '@/compartido/dinero'
import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { exigirPeriodoConGastos } from '@/dominio/periodos/estado'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma, prismaBase } from '@/infraestructura/prisma'

import { IMPORTE_VALIDO, ImporteInvalido } from './registrar-gasto'

/**
 * Corregir o borrar un gasto con el periodo **abierto** (RF-04, A4). Cerrado o
 * liquidado, la expensa ya salio (o esta por salir) con ese numero: lo que haya
 * que corregir va como ajuste en el periodo siguiente (RN-03). El periodo del
 * gasto no se mueve; la auditoria (RN-15) la dejan los disparadores.
 */

export class GastoConVinculos extends ErrorDeAplicacion {
  constructor() {
    super(
      'Este gasto tiene comprobantes o un reclamo asociado: corregí sus datos en lugar de borrarlo.',
      'RF-04',
    )
  }
}

/** El gasto de este consorcio con su periodo; el aislamiento lo decide la extension. */
async function gastoConPeriodo(gastoId: string) {
  const gasto = await prisma.gasto.findFirst({
    where: { id: gastoId },
    include: { periodo: true },
  })
  if (!gasto) throw new NoEncontrado()
  exigirPeriodoConGastos(gasto.periodo.estado)
  return gasto
}

export async function editarGasto(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    gastoId: string
    rubroId: string
    clasificacion: Clasificacion
    proveedorId: string | null
    importe: string
    fecha: Date
    descripcion: string
  },
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'editar gastos',
    },
    async () => {
      const monto = datos.importe.trim()
      if (!IMPORTE_VALIDO.test(monto) || importe(monto).isZero()) throw new ImporteInvalido()

      const gasto = await gastoConPeriodo(datos.gastoId)

      const rubro = await prismaBase.rubroGasto.findUnique({ where: { id: datos.rubroId } })
      if (!rubro) throw new NoEncontrado()

      if (datos.proveedorId) {
        const proveedor = await prisma.proveedor.findFirst({ where: { id: datos.proveedorId } })
        if (!proveedor) throw new NoEncontrado()
      }

      await prisma.gasto.update({
        where: { id: gasto.id },
        data: {
          rubroId: rubro.id,
          proveedorId: datos.proveedorId,
          importe: monto,
          clasificacion: datos.clasificacion,
          fecha: datos.fecha,
          descripcion: datos.descripcion.trim(),
        },
      })
    },
  )
}

export async function eliminarGasto(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; gastoId: string },
): Promise<{ periodoId: string }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'eliminar gastos',
    },
    async () => {
      const gasto = await gastoConPeriodo(datos.gastoId)

      // Comprobante y reclamo cuelgan del gasto; la extraccion lo referencia.
      const [comprobantes, extracciones, reclamos] = await Promise.all([
        prismaBase.comprobante.count({ where: { gastoId: gasto.id } }),
        prisma.extraccionComprobante.count({ where: { gastoId: gasto.id } }),
        prisma.reclamo.count({ where: { gastoId: gasto.id } }),
      ])
      if (comprobantes + extracciones + reclamos > 0) throw new GastoConVinculos()

      await prisma.gasto.delete({ where: { id: gasto.id } })
      return { periodoId: gasto.periodoId }
    },
  )
}
