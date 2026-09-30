import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { notificar } from '@/aplicacion/comunicacion/notificar'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'

/**
 * Espacios comunes y sus reglas de uso (`RF-15`, `FR-009`): la traduccion a
 * datos del reglamento interno. Un espacio se deshabilita y se rehabilita
 * (reforma, suspension, etc.); al deshabilitar se cancelan las reservas que
 * caen en la ventana y se avisa. Cada tramo deshabilitado queda en
 * `SuspensionEspacio` para el calendario de uso; `activo` es el estado vigente.
 */

/** La suspension vigente de un espacio deshabilitado: por que y hasta cuando. */
export interface SuspensionVigente {
  desde: string
  hasta: string | null
  motivo: string
}

export interface EspacioDelConsorcio {
  id: string
  nombre: string
  capacidadMaxima: number | null
  anticipacionMinimaHoras: number
  anticipacionMaximaDias: number
  duracionMaximaHoras: number
  reservasMaxMesUnidad: number
  activo: boolean
  /** Presente solo si esta deshabilitado y tiene el tramo registrado. */
  suspension: SuspensionVigente | null
}

export interface DatosDeEspacio {
  nombre: string
  capacidadMaxima?: number | null
  anticipacionMinimaHoras?: number
  anticipacionMaximaDias?: number
  duracionMaximaHoras?: number
  reservasMaxMesUnidad?: number
}

export class EspacioInvalido extends ErrorDeAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 'RF-15')
  }
}

function validar(datos: DatosDeEspacio): void {
  if (datos.nombre.trim().length === 0 || datos.nombre.length > 80) {
    throw new EspacioInvalido('Poné un nombre de hasta 80 caracteres.')
  }
  const reglas = [
    datos.capacidadMaxima,
    datos.anticipacionMinimaHoras,
    datos.anticipacionMaximaDias,
    datos.duracionMaximaHoras,
    datos.reservasMaxMesUnidad,
  ]
  for (const valor of reglas) {
    if (valor != null && (!Number.isInteger(valor) || valor < 0)) {
      throw new EspacioInvalido(
        'Las reglas del espacio son números enteros, sin decimales ni negativos.',
      )
    }
  }
}

export async function listarEspacios(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; incluirInactivos?: boolean },
): Promise<EspacioDelConsorcio[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver los espacios' },
    // Con `await`: la consulta de Prisma se ejecuta al resolverse, y tiene que
    // resolverse **dentro** del contexto de aislamiento, no al devolverla.
    async () => {
      const espacios = await prisma.espacioComun.findMany({
        where: datos.incluirInactivos ? {} : { activo: true },
        orderBy: { nombre: 'asc' },
        select: {
          id: true,
          nombre: true,
          capacidadMaxima: true,
          anticipacionMinimaHoras: true,
          anticipacionMaximaDias: true,
          duracionMaximaHoras: true,
          reservasMaxMesUnidad: true,
          activo: true,
          // El tramo en curso del deshabilitado: el mas reciente (abierto o con
          // fin planificado). Solo se usa cuando el espacio esta inactivo.
          suspensiones: {
            orderBy: { desde: 'desc' },
            take: 1,
            select: { desde: true, hasta: true, motivo: true },
          },
        },
      })
      return espacios.map(({ suspensiones, ...e }) => ({
        ...e,
        suspension:
          !e.activo && suspensiones[0]
            ? {
                desde: suspensiones[0].desde.toISOString(),
                hasta: suspensiones[0].hasta?.toISOString() ?? null,
                motivo: suspensiones[0].motivo,
              }
            : null,
      }))
    },
  )
}

export async function altaEspacio(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string } & DatosDeEspacio,
): Promise<{ espacioId: string }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'administrar espacios',
    },
    async () => {
      validar(datos)
      const existente = await prisma.espacioComun.findFirst({
        where: { nombre: datos.nombre.trim() },
      })
      if (existente)
        throw new EspacioInvalido('Ya hay un espacio con ese nombre en este consorcio.')
      const espacio = await prisma.espacioComun.create({
        data: sinConsorcio({
          nombre: datos.nombre.trim(),
          capacidadMaxima: datos.capacidadMaxima ?? null,
          ...(datos.anticipacionMinimaHoras != null
            ? { anticipacionMinimaHoras: datos.anticipacionMinimaHoras }
            : {}),
          ...(datos.anticipacionMaximaDias != null
            ? { anticipacionMaximaDias: datos.anticipacionMaximaDias }
            : {}),
          ...(datos.duracionMaximaHoras != null
            ? { duracionMaximaHoras: datos.duracionMaximaHoras }
            : {}),
          ...(datos.reservasMaxMesUnidad != null
            ? { reservasMaxMesUnidad: datos.reservasMaxMesUnidad }
            : {}),
        }),
        select: { id: true },
      })
      return { espacioId: espacio.id }
    },
  )
}

export async function editarEspacio(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; espacioId: string } & DatosDeEspacio,
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'administrar espacios',
    },
    async () => {
      validar(datos)
      const espacio = await prisma.espacioComun.findFirst({ where: { id: datos.espacioId } })
      if (!espacio) throw new NoEncontrado()
      await prisma.espacioComun.update({
        where: { id: espacio.id },
        data: {
          nombre: datos.nombre.trim(),
          capacidadMaxima: datos.capacidadMaxima ?? null,
          ...(datos.anticipacionMinimaHoras != null
            ? { anticipacionMinimaHoras: datos.anticipacionMinimaHoras }
            : {}),
          ...(datos.anticipacionMaximaDias != null
            ? { anticipacionMaximaDias: datos.anticipacionMaximaDias }
            : {}),
          ...(datos.duracionMaximaHoras != null
            ? { duracionMaximaHoras: datos.duracionMaximaHoras }
            : {}),
          ...(datos.reservasMaxMesUnidad != null
            ? { reservasMaxMesUnidad: datos.reservasMaxMesUnidad }
            : {}),
        },
      })
    },
  )
}

/**
 * Deshabilita el espacio (RF-15): registra el tramo con su motivo, pasa `activo`
 * a false y cancela avisando las reservas confirmadas que caen en la ventana
 * `[ahora, hasta]` —o `[ahora, ...)` si queda abierta—. Las reservas posteriores
 * al fin planificado se conservan.
 */
export async function deshabilitarEspacio(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    espacioId: string
    motivo: string
    /** Fin planificado (reforma); nulo o ausente = abierta hasta rehabilitar. */
    hasta?: Date | null
  },
): Promise<{ canceladas: number }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'administrar espacios',
    },
    async () => {
      const motivo = datos.motivo.trim()
      if (!motivo) throw new EspacioInvalido('Poné un motivo para deshabilitar el espacio.')
      const ahora = reloj.ahora()
      const fin = datos.hasta ?? null
      if (fin && fin <= ahora) {
        throw new EspacioInvalido('La fecha de fin tiene que ser posterior a hoy.')
      }
      const espacio = await prisma.espacioComun.findFirst({ where: { id: datos.espacioId } })
      if (!espacio) throw new NoEncontrado()
      if (!espacio.activo) throw new EspacioInvalido('El espacio ya está deshabilitado.')
      return prisma.$transaction(async (tx) => {
        // Confirmadas que solapan la ventana: no terminaron y empiezan antes del fin.
        const enVentana = await tx.reserva.findMany({
          where: {
            espacioId: espacio.id,
            estado: 'confirmada',
            hasta: { gt: ahora },
            ...(fin ? { desde: { lt: fin } } : {}),
          },
          select: { id: true, solicitadaPor: true },
        })
        await tx.espacioComun.update({ where: { id: espacio.id }, data: { activo: false } })
        await tx.suspensionEspacio.create({
          data: sinConsorcio({
            espacioId: espacio.id,
            desde: ahora,
            hasta: fin,
            motivo,
            creadoPor: datos.usuarioId,
          }),
        })
        if (enVentana.length > 0) {
          await tx.reserva.updateMany({
            where: { id: { in: enVentana.map((r) => r.id) } },
            data: { estado: 'cancelada', motivoRechazo: `El espacio fue deshabilitado: ${motivo}` },
          })
          await notificar(
            tx,
            enVentana.map((r) => ({
              usuarioId: r.solicitadaPor,
              tipo: 'reserva_rechazada' as const,
              titulo: `Reserva cancelada: ${espacio.nombre}`,
              cuerpo: `El espacio ${espacio.nombre} fue deshabilitado (${motivo}) y tu reserva quedó cancelada.`,
              entidadTipo: 'Reserva',
              entidadId: r.id,
            })),
          )
        }
        return { canceladas: enVentana.length }
      })
    },
  )
}

/**
 * Rehabilita el espacio (RF-15): vuelve `activo` a true y cierra el tramo en
 * curso escribiendo el fin real (ahora), para que el calendario muestre cuánto
 * estuvo deshabilitado. Un espacio dado de baja antes de esta funcionalidad no
 * tiene tramo: solo se reactiva.
 */
export async function habilitarEspacio(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; espacioId: string },
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'administrar espacios',
    },
    async () => {
      const espacio = await prisma.espacioComun.findFirst({ where: { id: datos.espacioId } })
      if (!espacio) throw new NoEncontrado()
      if (espacio.activo) throw new EspacioInvalido('El espacio ya está habilitado.')
      const ahora = reloj.ahora()
      await prisma.$transaction(async (tx) => {
        await tx.espacioComun.update({ where: { id: espacio.id }, data: { activo: true } })
        const enCurso = await tx.suspensionEspacio.findFirst({
          where: { espacioId: espacio.id },
          orderBy: { desde: 'desc' },
          select: { id: true },
        })
        if (enCurso) {
          await tx.suspensionEspacio.update({ where: { id: enCurso.id }, data: { hasta: ahora } })
        }
      })
    },
  )
}

/** Un tramo deshabilitado, para el calendario de uso. */
export interface TramoDeshabilitado {
  id: string
  espacioId: string
  espacio: string
  desde: string
  hasta: string | null
  motivo: string
}

/**
 * Los tramos deshabilitados que solapan un rango (RF-15), para pintarlos en el
 * calendario de uso. Solo el administrador, como el historial de reservas.
 */
export async function suspensionesEnRango(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; desde: Date; hasta: Date; espacioId?: string },
): Promise<TramoDeshabilitado[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'ver el historial de reservas',
    },
    async () => {
      const tramos = await prisma.suspensionEspacio.findMany({
        where: {
          ...(datos.espacioId ? { espacioId: datos.espacioId } : {}),
          desde: { lt: datos.hasta },
          OR: [{ hasta: null }, { hasta: { gt: datos.desde } }],
        },
        include: { espacio: { select: { nombre: true } } },
        orderBy: { desde: 'asc' },
      })
      return tramos.map((t) => ({
        id: t.id,
        espacioId: t.espacioId,
        espacio: t.espacio.nombre,
        desde: t.desde.toISOString(),
        hasta: t.hasta?.toISOString() ?? null,
        motivo: t.motivo,
      }))
    },
  )
}
