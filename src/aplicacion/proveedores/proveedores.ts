import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Proveedores (RF-05, FR-015). Raiz del grafo de la etapa: no depende de nada y
 * se construye antes que el gasto.
 *
 * **Sin baja**: esta diferida (§ 9.11). Un proveedor que ya emitio facturas no
 * se puede borrar sin romper la historia, y desactivarlo es una funcionalidad
 * que nadie pidio todavia.
 */

export interface ProveedorDelConsorcio {
  id: string
  razonSocial: string
  cuit: string
  rubroHabitualId: string | null
  rubroHabitual: string | null
}

export class CuitDeProveedorRepetido extends ErrorDeAplicacion {
  constructor(cuit: string) {
    super(`Ya hay un proveedor con el CUIT ${cuit} en este consorcio.`, 'RF-05', { cuit })
  }
}

export async function altaProveedor(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    razonSocial: string
    cuit: string
    rubroHabitualId?: string | null
  },
): Promise<{ proveedorId: string }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'dar de alta proveedores',
    },
    async () => {
      const cuit = datos.cuit.trim()

      // La clave unica (consorcio, cuit) es la que garantiza; esto da el mensaje.
      if (await prisma.proveedor.findFirst({ where: { cuit } })) {
        throw new CuitDeProveedorRepetido(cuit)
      }

      const creado = await prisma.proveedor.create({
        data: sinConsorcio({
          razonSocial: datos.razonSocial.trim(),
          cuit,
          rubroHabitualId: datos.rubroHabitualId || null,
        }),
      })

      return { proveedorId: creado.id }
    },
  )
}

export async function editarProveedor(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    proveedorId: string
    razonSocial: string
    rubroHabitualId?: string | null
  },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'editar proveedores',
    },
    async () => {
      const existente = await prisma.proveedor.findFirst({ where: { id: datos.proveedorId } })
      if (!existente) throw new NoEncontrado()

      // El CUIT no se edita: identifica al proveedor ante la AFIP y cambiarlo es
      // dar de alta a otro. Que se corrija un error de tipeo es alta nueva.
      await prisma.proveedor.update({
        where: { id: datos.proveedorId },
        data: {
          razonSocial: datos.razonSocial.trim(),
          rubroHabitualId: datos.rubroHabitualId || null,
        },
      })
    },
  )
}

export async function listarProveedores(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<ProveedorDelConsorcio[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver los proveedores' },
    async () => {
      const proveedores = await prisma.proveedor.findMany({
        orderBy: { razonSocial: 'asc' },
        include: { rubroHabitual: { select: { nombre: true } } },
      })

      return proveedores.map((proveedor) => ({
        id: proveedor.id,
        razonSocial: proveedor.razonSocial,
        cuit: proveedor.cuit,
        rubroHabitualId: proveedor.rubroHabitualId,
        rubroHabitual: proveedor.rubroHabitual?.nombre ?? null,
      }))
    },
  )
}

/** Catalogo global de rubros: lo mismo para todos los consorcios (FR-014). */
export async function listarRubros(): Promise<{ id: string; nombre: string }[]> {
  return prismaBase.rubroGasto.findMany({
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  })
}
