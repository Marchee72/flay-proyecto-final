import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { notificar } from '@/aplicacion/comunicacion/notificar'
import {
  dentroDelHorario,
  errorDeHorario,
  horaDesdeMinutos,
  horarioParaMostrar,
  type HorarioDeUso,
} from '@/dominio/reservas/horario'
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
  archivado: boolean
  horario: HorarioDeUso | null
  rechazaConDeuda: boolean
  /** Reservas de toda la historia (para avisar al archivar en vez de borrar). */
  reservasEnHistorial: number
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
  /** `undefined` no toca el horario; `null` lo borra. */
  horario?: HorarioDeUso | null
  rechazaConDeuda?: boolean
}

export class EspacioInvalido extends ErrorDeAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 'RF-15')
  }
}

export class EspacioArchivadoConEseNombre extends ErrorDeAplicacion {
  constructor() {
    super('Ya hay un espacio archivado con ese nombre. Restauralo desde Eliminados.', 'RF-15')
  }
}

export function validarEspacio(datos: DatosDeEspacio): void {
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
  const { horario } = datos
  if (horario) {
    const enRango = (m: number) => Number.isInteger(m) && m >= 0 && m <= 1439
    const mensaje =
      !enRango(horario.apertura) || !enRango(horario.cierre)
        ? 'Usá horas del día, de 00:00 a 23:59.'
        : errorDeHorario(horaDesdeMinutos(horario.apertura), horaDesdeMinutos(horario.cierre))
    if (mensaje) throw new EspacioInvalido(mensaje)
  }
}

/** Las tres columnas nuevas; `horario` ausente no las toca. */
function columnasDeReglas(datos: DatosDeEspacio) {
  return {
    ...(datos.horario !== undefined
      ? {
          aperturaMinutos: datos.horario?.apertura ?? null,
          cierreMinutos: datos.horario?.cierre ?? null,
        }
      : {}),
    ...(datos.rechazaConDeuda !== undefined ? { rechazaConDeuda: datos.rechazaConDeuda } : {}),
  }
}

export async function listarEspacios(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    incluirInactivos?: boolean
    incluirArchivados?: boolean
  },
): Promise<EspacioDelConsorcio[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver los espacios' },
    // Con `await`: la consulta de Prisma se ejecuta al resolverse, y tiene que
    // resolverse **dentro** del contexto de aislamiento, no al devolverla.
    async () => {
      const espacios = await prisma.espacioComun.findMany({
        where: {
          ...(datos.incluirInactivos ? {} : { activo: true }),
          ...(datos.incluirArchivados ? {} : { archivadoEn: null }),
        },
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
          archivadoEn: true,
          aperturaMinutos: true,
          cierreMinutos: true,
          rechazaConDeuda: true,
          _count: { select: { reservas: true } },
          // El tramo en curso del deshabilitado: el mas reciente (abierto o con
          // fin planificado). Solo se usa cuando el espacio esta inactivo.
          suspensiones: {
            orderBy: { desde: 'desc' },
            take: 1,
            select: { desde: true, hasta: true, motivo: true },
          },
        },
      })
      return espacios.map(
        ({ suspensiones, aperturaMinutos, cierreMinutos, _count, archivadoEn, ...e }) => ({
          ...e,
          archivado: archivadoEn !== null,
          reservasEnHistorial: _count.reservas,
          horario:
            aperturaMinutos != null && cierreMinutos != null
              ? { apertura: aperturaMinutos, cierre: cierreMinutos }
              : null,
          suspension:
            !e.activo && suspensiones[0]
              ? {
                  desde: suspensiones[0].desde.toISOString(),
                  hasta: suspensiones[0].hasta?.toISOString() ?? null,
                  motivo: suspensiones[0].motivo,
                }
              : null,
        }),
      )
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
      validarEspacio(datos)
      const existente = await prisma.espacioComun.findFirst({
        where: { nombre: datos.nombre.trim() },
      })
      if (existente?.archivadoEn) throw new EspacioArchivadoConEseNombre()
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
          ...columnasDeReglas(datos),
        }),
        select: { id: true },
      })
      return { espacioId: espacio.id }
    },
  )
}

/**
 * Las reservas confirmadas y futuras (`desde > ahora`) que no caben en el
 * horario dado. Una reserva en curso no se toca. Sin horario no queda ninguna.
 */
export async function reservasFueraDeHorario(
  cliente: Pick<typeof prisma, 'reserva'>,
  espacioId: string,
  horario: HorarioDeUso | null,
  ahora: Date,
): Promise<{ id: string; solicitadaPor: string }[]> {
  if (!horario) return []
  const futuras = await cliente.reserva.findMany({
    where: { espacioId, estado: 'confirmada', desde: { gt: ahora } },
    select: { id: true, solicitadaPor: true, desde: true, hasta: true },
  })
  return futuras
    .filter((r) => !dentroDelHorario(r.desde, r.hasta, horario))
    .map(({ id, solicitadaPor }) => ({ id, solicitadaPor }))
}

/** Cuantas reservas cancelaria un cambio de horario, sin escribir (tarjeta del espacio). */
export async function contarReservasAfectadas(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    espacioId: string
    horario: HorarioDeUso | null
  },
): Promise<number> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'administrar espacios',
    },
    async () =>
      (await reservasFueraDeHorario(prisma, datos.espacioId, datos.horario, reloj.ahora())).length,
  )
}

/**
 * Edita el espacio. Si el horario pedido difiere del guardado, las reservas
 * futuras que quedan afuera se cancelan y avisan en la misma transaccion.
 */
export async function editarEspacio(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; espacioId: string } & DatosDeEspacio,
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
      validarEspacio(datos)
      const espacio = await prisma.espacioComun.findFirst({
        where: { id: datos.espacioId, archivadoEn: null },
      })
      if (!espacio) throw new NoEncontrado()
      const nuevo = datos.horario
      const cambia =
        nuevo !== undefined &&
        ((nuevo?.apertura ?? null) !== espacio.aperturaMinutos ||
          (nuevo?.cierre ?? null) !== espacio.cierreMinutos)
      return prisma.$transaction(async (tx) => {
        await tx.espacioComun.update({
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
            ...columnasDeReglas(datos),
          },
        })
        if (!cambia || !nuevo) return { canceladas: 0 }
        const afuera = await reservasFueraDeHorario(tx, espacio.id, nuevo, reloj.ahora())
        if (afuera.length === 0) return { canceladas: 0 }
        await tx.reserva.updateMany({
          where: { id: { in: afuera.map((r) => r.id) } },
          data: { estado: 'cancelada', motivoRechazo: 'Cambió el horario de uso del espacio' },
        })
        const nombre = datos.nombre.trim()
        await notificar(
          tx,
          afuera.map((r) => ({
            usuarioId: r.solicitadaPor,
            tipo: 'reserva_rechazada' as const,
            titulo: `Reserva cancelada: ${nombre}`,
            cuerpo: `${nombre} ahora se usa ${horarioParaMostrar(nuevo)} y tu reserva quedó afuera, así que se canceló.`,
            entidadTipo: 'Reserva',
            entidadId: r.id,
          })),
        )
        return { canceladas: afuera.length }
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
      const espacio = await prisma.espacioComun.findFirst({
        where: { id: datos.espacioId, archivadoEn: null },
      })
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
      const espacio = await prisma.espacioComun.findFirst({
        where: { id: datos.espacioId, archivadoEn: null },
      })
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

/**
 * Elimina el espacio (RF-15, RN-22): sin reservas en toda su historia se borra;
 * con historia se archiva (`archivadoEn`), porque la historia de uso no se
 * pierde. A quienes tenían reservas futuras confirmadas se les cancela y avisa.
 */
export async function eliminarEspacio(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; espacioId: string },
): Promise<'borrado' | 'archivado'> {
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
      const espacio = await prisma.espacioComun.findFirst({
        where: { id: datos.espacioId, archivadoEn: null },
      })
      if (!espacio) throw new NoEncontrado()
      return prisma.$transaction(async (tx) => {
        if ((await tx.reserva.count({ where: { espacioId: espacio.id } })) === 0) {
          // La auditoría (RN-15) deja constancia de la baja.
          await tx.suspensionEspacio.deleteMany({ where: { espacioId: espacio.id } })
          await tx.espacioComun.deleteMany({ where: { id: espacio.id } })
          return 'borrado' as const
        }
        const futuras = await tx.reserva.findMany({
          where: { espacioId: espacio.id, estado: 'confirmada', hasta: { gt: reloj.ahora() } },
          select: { id: true, solicitadaPor: true },
        })
        if (futuras.length > 0) {
          await tx.reserva.updateMany({
            where: { id: { in: futuras.map((r) => r.id) } },
            data: { estado: 'cancelada', motivoRechazo: 'El espacio fue eliminado' },
          })
          await notificar(
            tx,
            futuras.map((r) => ({
              usuarioId: r.solicitadaPor,
              tipo: 'reserva_rechazada' as const,
              titulo: `Reserva cancelada: ${espacio.nombre}`,
              cuerpo: `El espacio ${espacio.nombre} fue eliminado y tu reserva quedó cancelada.`,
              entidadTipo: 'Reserva',
              entidadId: r.id,
            })),
          )
        }
        await tx.espacioComun.update({
          where: { id: espacio.id },
          data: { archivadoEn: reloj.ahora() },
        })
        return 'archivado' as const
      })
    },
  )
}

/** Devuelve un espacio archivado a la lista. Las reservas canceladas siguen canceladas. */
export async function restaurarEspacio(
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
      const { count } = await prisma.espacioComun.updateMany({
        where: { id: datos.espacioId, archivadoEn: { not: null } },
        data: { archivadoEn: null },
      })
      if (count === 0) throw new NoEncontrado()
    },
  )
}

export async function listarEspaciosArchivados(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<{ id: string; nombre: string; archivadoEn: string; reservasEnHistorial: number }[]> {
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
      const archivados = await prisma.espacioComun.findMany({
        where: { archivadoEn: { not: null } },
        orderBy: { archivadoEn: 'desc' },
        select: {
          id: true,
          nombre: true,
          archivadoEn: true,
          _count: { select: { reservas: true } },
        },
      })
      return archivados.map((e) => ({
        id: e.id,
        nombre: e.nombre,
        archivadoEn: e.archivadoEn!.toISOString(),
        reservasEnHistorial: e._count.reservas,
      }))
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
