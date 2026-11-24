import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { finDelAcceso } from '@/dominio/ocupaciones/vigencia'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import {
  ocupacionesDePersonaEn,
  ocupantesVigentes,
  registrarOcupacion as insertarOcupacion,
  type TipoDeOcupacion,
} from '@/infraestructura/repositorios/ocupaciones'

type ClienteBase = Parameters<Parameters<typeof prismaBase.$transaction>[0]>[0] | typeof prismaBase

export class InquilinoSuperpuesto extends ErrorDeAplicacion {
  constructor() {
    super('La unidad ya tiene un inquilino vigente en esas fechas.', 'RF-03')
  }
}

/** La exclusion de la base (RN-09) vuelta mensaje; cualquier otro error pasa tal cual. */
export const comoInquilinoSuperpuesto = (error: unknown): unknown =>
  error instanceof Error && /Ocupacion_inquilino_sin_superposicion|23P01/.test(error.message)
    ? new InquilinoSuperpuesto()
    : error

/**
 * Alta de ocupacion (FR-008, FR-008b, FR-008c).
 *
 * Dos cosas que no son evidentes:
 *
 * 1. La autorizacion tiene aca una **condicion de fila**, la unica de la etapa:
 *    ademas del administrador, el propietario vigente de una unidad puede
 *    registrar al inquilino **de esa unidad** y de ninguna otra. Quien lo
 *    intenta sobre la del vecino recibe «no encontrado», nunca «prohibido».
 * 2. El alta sincroniza la habilitacion de consorcista en la **misma
 *    transaccion** (FR-008c, RN-24): si no, alguien dueño en tres consorcios
 *    necesita tres habilitaciones cargadas a mano y olvidarse de una deja a un
 *    propietario sin ver su propio edificio.
 *
 * La superposicion de dos inquilinos vigentes **no se verifica aca**: la
 * rechaza la restriccion de exclusion de la base (regla RN-09, SC-005).
 */
export async function registrarOcupacion(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    unidadId: string
    personaId: string
    tipo: TipoDeOcupacion
    desde: Date
    hasta?: Date | null
  },
): Promise<{ ocupacionId: string }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      accion: 'registrar ocupaciones',
    },
    async (acceso) => {
      // El aislamiento decide si la unidad es de este consorcio: la consulta no
      // escribe el filtro, lo pone la extension (Principio I).
      const unidad = await prisma.unidad.findFirst({
        where: { id: datos.unidadId, bajaDesde: null },
      })
      if (!unidad) throw new NoEncontrado()

      if (!acceso.roles.includes('administrador')) {
        await exigirPropietarioDeLaUnidad(datos, reloj)
      }

      return prismaBase
        .$transaction(async (tx) => {
          const { ocupacionId } = await insertarOcupacion(
            {
              unidadId: datos.unidadId,
              personaId: datos.personaId,
              tipo: datos.tipo,
              desde: datos.desde,
              hasta: datos.hasta ?? null,
            },
            tx,
          )

          await sincronizarHabilitacion(datos.personaId, datos.consorcioId, tx)

          return { ocupacionId }
        })
        .catch((error) => {
          throw comoInquilinoSuperpuesto(error)
        })
    },
  )
}

/** FR-008b: solo sobre su propia unidad, y solo para cargar un inquilino. */
export async function exigirPropietarioDeLaUnidad(
  datos: { usuarioId: string; unidadId: string; tipo: TipoDeOcupacion },
  reloj: Reloj,
): Promise<void> {
  if (datos.tipo !== 'inquilino') throw new NoEncontrado()

  const usuario = await prismaBase.usuario.findUnique({
    where: { id: datos.usuarioId },
    select: { personaId: true },
  })

  const propietarios = await ocupantesVigentes(datos.unidadId, 'propietario', reloj.hoy())

  if (!usuario || !propietarios.includes(usuario.personaId)) throw new NoEncontrado()
}

/**
 * FR-008c, RN-24. Recalcula la `vigenciaHasta` de la habilitacion de
 * consorcista de esa persona en ese consorcio a partir de todas sus
 * ocupaciones: la crea si no existe, la reabre si estaba cerrada, o la cierra
 * el dia en que termina la ultima. Si la persona no tiene usuario o no tiene
 * ocupaciones en el consorcio, no hace nada. Nunca toca otros roles.
 */
export async function sincronizarHabilitacion(
  personaId: string,
  consorcioId: string,
  cliente: ClienteBase = prismaBase,
): Promise<void> {
  const usuario = await cliente.usuario.findUnique({
    where: { personaId },
    select: { id: true },
  })
  if (!usuario) return

  const ocupaciones = await ocupacionesDePersonaEn(personaId, consorcioId, cliente)
  if (ocupaciones.length === 0) return

  const vigenciaHasta = finDelAcceso(ocupaciones.map((o) => o.hastaInclusivo))

  const existente = await cliente.habilitacion.findUnique({
    where: {
      usuarioId_consorcioId_rol: { usuarioId: usuario.id, consorcioId, rol: 'consorcista' },
    },
    select: { id: true },
  })

  if (existente) {
    await cliente.habilitacion.update({
      where: { id: existente.id },
      data: { vigenciaHasta },
    })
    return
  }

  const vigenciaDesde = ocupaciones.reduce(
    (masAntigua, o) => (o.desde.getTime() < masAntigua.getTime() ? o.desde : masAntigua),
    ocupaciones[0]!.desde,
  )

  await cliente.habilitacion.create({
    data: {
      usuarioId: usuario.id,
      consorcioId,
      rol: 'consorcista',
      vigenciaDesde,
      vigenciaHasta,
    },
  })
}
