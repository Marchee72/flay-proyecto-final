import type { Clasificacion } from '@prisma/client'

import { importe } from '@/compartido/dinero'
import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
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
    super('Este gasto tiene un reclamo asociado: corregí sus datos en lugar de borrarlo.', 'RF-04')
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

/**
 * Borra el gasto con sus comprobantes y la extraccion que lo origino: viven
 * del gasto y sin el no tienen sentido. Un reclamo asociado si lo frena: es
 * de otra persona y apunta a ese gasto. Los archivos se sacan del almacen
 * despues, y un fallo ahi no deshace el borrado (queda un objeto huerfano).
 */
export async function eliminarGasto(
  almacen: Pick<AlmacenObjetos, 'eliminar'>,
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
      if ((await prisma.reclamo.count({ where: { gastoId: gasto.id } })) > 0) {
        throw new GastoConVinculos()
      }

      // `Comprobante` no lleva consorcio: se alcanza por el gasto, ya aislado arriba.
      const comprobantes = await prismaBase.comprobante.findMany({
        where: { gastoId: gasto.id },
        select: { id: true, claveObjeto: true },
      })
      // La extraccion apunta al gasto y al comprobante: cae antes que ellos.
      const vinculos = {
        OR: [{ gastoId: gasto.id }, { comprobanteId: { in: comprobantes.map((c) => c.id) } }],
      }
      const extracciones = await prisma.extraccionComprobante.findMany({
        where: vinculos,
        select: { claveObjeto: true },
      })
      await prisma.$transaction(async (tx) => {
        await tx.extraccionComprobante.deleteMany({ where: vinculos })
        await tx.comprobante.deleteMany({ where: { gastoId: gasto.id } })
        await tx.gasto.delete({ where: { id: gasto.id } })
      })

      // El comprobante y su extraccion suelen compartir archivo: una sola baja.
      const claves = new Set([...comprobantes, ...extracciones].map((c) => c.claveObjeto))
      for (const clave of claves) {
        try {
          await almacen.eliminar(clave)
        } catch {
          console.error('[gastos] objeto huérfano', clave)
        }
      }
      return { periodoId: gasto.periodoId }
    },
  )
}
