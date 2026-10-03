import { Prisma, type Clasificacion } from '@prisma/client'

import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { normalizarCuit } from '@/dominio/proveedores/cuit'
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

export class CuitInvalido extends ErrorDeAplicacion {
  constructor() {
    super('El CUIT tiene que tener 11 dígitos, con o sin guiones.', 'RF-05')
  }
}

export class ProveedorIncompleto extends ErrorDeAplicacion {
  constructor() {
    super('Poné la razón social del proveedor.', 'RF-05')
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
    telefono?: string | null
    correo?: string | null
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
      const razonSocial = datos.razonSocial.trim()
      if (!razonSocial) throw new ProveedorIncompleto()
      // Normalizado, «20123456789» y «20-12345678-9» son el mismo proveedor.
      const cuit = normalizarCuit(datos.cuit)
      if (!cuit) throw new CuitInvalido()

      // La clave unica (consorcio, cuit) es la que garantiza; esto da el mensaje.
      if (await prisma.proveedor.findFirst({ where: { cuit } })) {
        throw new CuitDeProveedorRepetido(cuit)
      }

      try {
        const creado = await prisma.proveedor.create({
          data: sinConsorcio({
            razonSocial,
            cuit,
            rubroHabitualId: datos.rubroHabitualId || null,
            telefono: datos.telefono?.trim() || null,
            correo: datos.correo?.trim() || null,
          }),
        })
        return { proveedorId: creado.id }
      } catch (error) {
        // Doble envio: los dos pasaron la consulta y la clave unica freno al segundo.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new CuitDeProveedorRepetido(cuit)
        }
        throw error
      }
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
    telefono?: string | null
    correo?: string | null
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
          telefono: datos.telefono?.trim() || null,
          correo: datos.correo?.trim() || null,
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
export async function listarRubros(): Promise<
  { id: string; nombre: string; clasificacion: Clasificacion }[]
> {
  return prismaBase.rubroGasto.findMany({
    // La clasificacion viaja para que el alta pueda proponerla (regla RN-04).
    select: { id: true, nombre: true, clasificacion: true },
    orderBy: { nombre: 'asc' },
  })
}
