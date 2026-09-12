import { NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { transicionar } from '@/aplicacion/reclamos/transicionar'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Asignacion y vinculo (`FR-008`, `CU-08`). Asignar responsable a un reclamo
 * `abierto` es una transicion —pasa por `transicionar`, con su asiento—; sobre
 * uno ya asignado solo cambia quien, y eso no es un estado nuevo.
 */

export async function asignar(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    reclamoId: string
    responsableId: string
    proveedorId?: string | null
    rubroId?: string | null
  },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'asignar reclamos',
    },
    async () => {
      const reclamo = await prisma.reclamo.findFirst({ where: { id: datos.reclamoId } })
      if (!reclamo) throw new NoEncontrado()

      // El responsable tiene que poder ver el consorcio.
      const responsable = await repositorio.accesoVigente(
        datos.responsableId,
        datos.consorcioId,
        reloj.hoy(),
      )
      if (!responsable) throw new NoEncontrado()

      if (datos.proveedorId) {
        const proveedor = await prisma.proveedor.findFirst({ where: { id: datos.proveedorId } })
        if (!proveedor) throw new NoEncontrado()
      }
      if (datos.rubroId) {
        const rubro = await prismaBase.rubroGasto.findUnique({ where: { id: datos.rubroId } })
        if (!rubro) throw new NoEncontrado()
      }

      await prisma.reclamo.update({
        where: { id: reclamo.id },
        data: {
          ...(datos.proveedorId !== undefined ? { proveedorId: datos.proveedorId } : {}),
          ...(datos.rubroId !== undefined ? { rubroId: datos.rubroId } : {}),
          // Sobre uno ya asignado, cambia el responsable sin transicion.
          ...(reclamo.estado !== 'abierto' ? { responsableId: datos.responsableId } : {}),
        },
      })
    },
  )

  // Fuera del contexto anterior: `transicionar` abre el suyo y deja el asiento.
  const reclamo = await prismaBase.reclamo.findUnique({ where: { id: datos.reclamoId } })
  if (reclamo?.estado === 'abierto') {
    await transicionar(repositorio, reloj, {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      reclamoId: datos.reclamoId,
      hacia: 'asignado',
      responsableId: datos.responsableId,
    })
  }
}

export async function vincularGasto(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; reclamoId: string; gastoId: string | null },
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'vincular gastos a reclamos',
    },
    async () => {
      const reclamo = await prisma.reclamo.findFirst({ where: { id: datos.reclamoId } })
      if (!reclamo) throw new NoEncontrado()
      if (datos.gastoId) {
        // El aislamiento decide si el gasto es de este consorcio.
        const gasto = await prisma.gasto.findFirst({ where: { id: datos.gastoId } })
        if (!gasto) throw new NoEncontrado()
      }
      await prisma.reclamo.update({
        where: { id: reclamo.id },
        data: { gastoId: datos.gastoId },
      })
    },
  )
}

/** Quienes pueden ser responsables: los administradores habilitados sobre el consorcio. */
export async function posiblesResponsables(
  consorcioId: string,
): Promise<{ id: string; nombre: string }[]> {
  const filas = await prismaBase.habilitacion.findMany({
    where: { consorcioId, rol: 'administrador', vigenciaHasta: null },
    select: {
      usuario: { select: { id: true, persona: { select: { nombre: true, apellido: true } } } },
    },
    distinct: ['usuarioId'],
  })
  return filas.map((f) => ({
    id: f.usuario.id,
    nombre: `${f.usuario.persona.nombre} ${f.usuario.persona.apellido}`,
  }))
}
