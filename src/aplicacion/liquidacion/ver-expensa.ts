import { importeSerializado } from '@/compartido/formato'
import { NoEncontrado } from '@/compartido/errores'
import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * La expensa de una unidad, para quien tiene derecho a verla (`FR-018`,
 * `CU-06`, regla RN-12 § 7.2).
 *
 * Es la segunda condicion de fila del sistema, despues de la de ocupaciones:
 * el consorcista ve **su** unidad y ninguna otra. Una ajena responde «no
 * encontrado», nunca «prohibido», para no revelar que existe (SC-008).
 */

const SEGUNDOS_DE_LECTURA = 600

export interface ExpensaVisible {
  detalleId: string
  designacion: string
  periodo: string
  vencimiento: string
  totalUnidad: string
  /** Nulo mientras el documento no se genero: la liquidacion ya existe igual. */
  direccion: string | null
}

export interface UnidadConExpensas {
  unidadId: string
  designacion: string
  expensas: ExpensaVisible[]
}

/**
 * Las unidades que el usuario puede ver: todas si es administrador o consejo,
 * y solo las que ocupa si es consorcista.
 */
async function unidadesAlcanzables(
  usuarioId: string,
  roles: readonly string[],
  hoy: Date,
): Promise<{ id: string; designacion: string }[]> {
  if (roles.includes('administrador') || roles.includes('consejo')) {
    return prisma.unidad.findMany({
      select: { id: true, designacion: true },
      orderBy: { designacion: 'asc' },
    })
  }

  const usuario = await prismaBase.usuario.findUnique({
    where: { id: usuarioId },
    select: { personaId: true },
  })
  if (!usuario) return []

  // Ocupacion vigente hoy, de cualquier tipo: el inquilino tambien recibe la
  // expensa, porque la ordinaria es suya (regla RN-05).
  const ocupadas = await prismaBase.$queryRaw<{ unidad_id: string }[]>`
    SELECT DISTINCT "unidad_id" FROM "Ocupacion"
    WHERE "persona_id" = ${usuario.personaId}::uuid AND "vigencia" @> ${hoy}::date
  `

  // El aislamiento vuelve a filtrar: una ocupacion sobre una unidad de otro
  // consorcio no aparece, aunque exista.
  return prisma.unidad.findMany({
    where: { id: { in: ocupadas.map((fila) => fila.unidad_id) } },
    select: { id: true, designacion: true },
    orderBy: { designacion: 'asc' },
  })
}

export async function misExpensas(
  almacen: AlmacenObjetos,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<UnidadConExpensas[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver expensas' },
    async (acceso) => {
      const unidades = await unidadesAlcanzables(datos.usuarioId, acceso.roles, reloj.hoy())

      return Promise.all(
        unidades.map(async (unidad) => ({
          unidadId: unidad.id,
          designacion: unidad.designacion,
          expensas: await expensasDe(almacen, unidad.id),
        })),
      )
    },
  )
}

/** Una sola, por identificador directo: es la que el consorcista abre o descarga. */
export async function verExpensa(
  almacen: AlmacenObjetos,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; detalleId: string },
): Promise<ExpensaVisible> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver expensas' },
    async (acceso) => {
      const alcanzables = await unidadesAlcanzables(datos.usuarioId, acceso.roles, reloj.hoy())

      const detalle = await prismaBase.detalleLiquidacion.findUnique({
        where: { id: datos.detalleId },
        include: { liquidacion: { include: { periodo: true } }, unidad: true },
      })

      if (
        !detalle ||
        detalle.liquidacion.estado !== 'vigente' ||
        !alcanzables.some((unidad) => unidad.id === detalle.unidadId)
      ) {
        throw new NoEncontrado()
      }

      return aVisible(almacen, detalle)
    },
  )
}

type DetalleConContexto = NonNullable<
  Awaited<
    ReturnType<
      typeof prismaBase.detalleLiquidacion.findFirst<{
        include: { liquidacion: { include: { periodo: true } }; unidad: true }
      }>
    >
  >
>

async function expensasDe(almacen: AlmacenObjetos, unidadId: string): Promise<ExpensaVisible[]> {
  const detalles = await prismaBase.detalleLiquidacion.findMany({
    where: { unidadId, liquidacion: { estado: 'vigente' } },
    include: { liquidacion: { include: { periodo: true } }, unidad: true },
    orderBy: { liquidacion: { emitidaEn: 'desc' } },
  })

  return Promise.all(detalles.map((detalle) => aVisible(almacen, detalle)))
}

async function aVisible(
  almacen: AlmacenObjetos,
  detalle: DetalleConContexto,
): Promise<ExpensaVisible> {
  const { periodo } = detalle.liquidacion

  return {
    detalleId: detalle.id,
    designacion: detalle.unidad.designacion,
    periodo: `${String(periodo.mes).padStart(2, '0')}/${periodo.anio}`,
    vencimiento: detalle.liquidacion.vencimiento.toISOString().slice(0, 10),
    totalUnidad: importeSerializado(detalle.totalUnidad),
    direccion: detalle.claveDocumento
      ? await almacen.resolverLecturaAutorizada(detalle.claveDocumento, SEGUNDOS_DE_LECTURA)
      : null,
  }
}
