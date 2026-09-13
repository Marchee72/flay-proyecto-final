import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { notificar } from '@/aplicacion/comunicacion/notificar'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'

/**
 * Espacios comunes y sus reglas de uso (`RF-15`, `FR-009`): la traduccion a
 * datos del reglamento interno. La baja es logica y cancela las reservas
 * futuras avisando (caso limite de la spec).
 */

export interface EspacioDelConsorcio {
  id: string
  nombre: string
  capacidadMaxima: number | null
  anticipacionMinimaHoras: number
  anticipacionMaximaDias: number
  duracionMaximaHoras: number
  reservasMaxMesUnidad: number
  activo: boolean
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
    async () =>
      await prisma.espacioComun.findMany({
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
        },
      }),
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

/** Baja logica: las reservas futuras se cancelan y se avisa; las pasadas se conservan. */
export async function bajaEspacio(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; espacioId: string },
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
      const espacio = await prisma.espacioComun.findFirst({ where: { id: datos.espacioId } })
      if (!espacio) throw new NoEncontrado()
      return prisma.$transaction(async (tx) => {
        const futuras = await tx.reserva.findMany({
          where: { espacioId: espacio.id, estado: 'confirmada', desde: { gt: reloj.ahora() } },
          select: { id: true, solicitadaPor: true },
        })
        await tx.espacioComun.update({ where: { id: espacio.id }, data: { activo: false } })
        if (futuras.length > 0) {
          await tx.reserva.updateMany({
            where: { id: { in: futuras.map((r) => r.id) } },
            data: { estado: 'cancelada', motivoRechazo: 'El espacio fue dado de baja.' },
          })
          await notificar(
            tx,
            futuras.map((r) => ({
              usuarioId: r.solicitadaPor,
              tipo: 'reserva_rechazada' as const,
              titulo: `Reserva cancelada: ${espacio.nombre}`,
              cuerpo: `El espacio ${espacio.nombre} fue dado de baja y tu reserva quedó cancelada.`,
              entidadTipo: 'Reserva',
              entidadId: r.id,
            })),
          )
        }
        return { canceladas: futuras.length }
      })
    },
  )
}
