import { NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import {
  ocupantesVigentes,
  registrarOcupacion as insertarOcupacion,
  type TipoDeOcupacion,
} from '@/infraestructura/repositorios/ocupaciones'

/**
 * Alta de ocupacion (FR-008, FR-008b, FR-008c).
 *
 * Dos cosas que no son evidentes:
 *
 * 1. La autorizacion tiene aca una **condicion de fila**, la unica de la etapa:
 *    ademas del administrador, el propietario vigente de una unidad puede
 *    registrar al inquilino **de esa unidad** y de ninguna otra. Quien lo
 *    intenta sobre la del vecino recibe «no encontrado», nunca «prohibido».
 * 2. El alta crea la habilitacion de consorcista en la **misma transaccion**
 *    (FR-008c): si no, alguien dueño en tres consorcios necesita tres
 *    habilitaciones cargadas a mano y olvidarse de una deja a un propietario
 *    sin ver su propio edificio.
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
      const unidad = await prisma.unidad.findFirst({ where: { id: datos.unidadId } })
      if (!unidad) throw new NoEncontrado()

      if (!acceso.roles.includes('administrador')) {
        await exigirPropietarioDeLaUnidad(datos, reloj)
      }

      const { ocupacionId } = await insertarOcupacion({
        unidadId: datos.unidadId,
        personaId: datos.personaId,
        tipo: datos.tipo,
        desde: datos.desde,
        hasta: datos.hasta ?? null,
      })

      await habilitarComoConsorcista(datos.personaId, datos.consorcioId, datos.desde)

      return { ocupacionId }
    },
  )
}

/** FR-008b: solo sobre su propia unidad, y solo para cargar un inquilino. */
async function exigirPropietarioDeLaUnidad(
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
 * FR-008c. Si la persona todavia no tiene usuario, no hay a quien habilitar:
 * la habilitacion nace cuando la invitan, con la ocupacion ya cargada.
 */
async function habilitarComoConsorcista(
  personaId: string,
  consorcioId: string,
  desde: Date,
): Promise<void> {
  const usuario = await prismaBase.usuario.findUnique({
    where: { personaId },
    select: { id: true },
  })

  if (!usuario) return

  await prismaBase.habilitacion.upsert({
    where: {
      usuarioId_consorcioId_rol: { usuarioId: usuario.id, consorcioId, rol: 'consorcista' },
    },
    update: {},
    create: { usuarioId: usuario.id, consorcioId, rol: 'consorcista', vigenciaDesde: desde },
  })
}
