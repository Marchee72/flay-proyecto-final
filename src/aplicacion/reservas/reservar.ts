import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { notificar } from '@/aplicacion/comunicacion/notificar'
import { saldoImpagoPorUnidad } from '@/aplicacion/pagos/estado-de-cuenta'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'
import { ocupaUnidad, unidadesOcupadasPor } from '@/infraestructura/repositorios/ocupaciones'

/**
 * Reservas (`RF-16`, `CU-09`, `FR-010`, `FR-011`, research R-08). La
 * superposicion la rechaza **la base** con la restriccion de exclusion; aca no
 * hay verificacion previa que se pueda saltear: solo se traduce el error a un
 * mensaje. La deuda vencida se verifica antes, con el saldo de 003. Cada
 * cambio de estado avisa al solicitante (§ 12.7).
 */

const HORA = 3_600_000

export class ReservaRechazada extends ErrorDeAplicacion {
  constructor(mensaje: string, codigo = 'RF-16') {
    super(mensaje, codigo)
  }
}

const esSuperposicion = (error: unknown) =>
  error instanceof Error && /reserva_sin_superposicion|23P01/.test(error.message)

export interface ReservaDelConsorcio {
  id: string
  espacioId: string
  espacio: string
  unidad: string
  desde: string
  hasta: string
  cantidadPersonas: number | null
  estado: string
  motivoRechazo: string | null
  propia: boolean
}

export async function reservar(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    espacioId: string
    unidadId: string
    desde: Date
    hasta: Date
    cantidadPersonas?: number | null
    observaciones?: string | null
  },
): Promise<{ reservaId: string }> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'reservar' },
    async (acceso) => {
      const espacio = await prisma.espacioComun.findFirst({ where: { id: datos.espacioId } })
      if (!espacio || !espacio.activo) throw new NoEncontrado()
      const unidad = await prisma.unidad.findFirst({ where: { id: datos.unidadId } })
      if (!unidad) throw new NoEncontrado()

      // Un consorcista reserva para una unidad que ocupa; el administrador, para cualquiera.
      const esAdministrador = acceso.roles.includes('administrador')
      if (!esAdministrador && !(await ocupaUnidad(datos.usuarioId, unidad.id, reloj.hoy()))) {
        throw new NoEncontrado()
      }

      // 1) Deuda vencida: la precondicion de CU-09, con el saldo que 003 produce (SC-006).
      const deudas = await saldoImpagoPorUnidad(reloj.hoy())
      const deuda = deudas.get(unidad.id)
      if (deuda) {
        throw new ReservaRechazada(
          `La unidad ${unidad.designacion} tiene deuda vencida (${deuda.vencidos} ${deuda.vencidos === 1 ? 'período' : 'períodos'}). Se puede reservar una vez regularizada.`,
          'CU-09',
        )
      }

      // 2) Las reglas del espacio, cada una con su valor admitido (RNF-10).
      if (!(datos.desde < datos.hasta)) {
        throw new ReservaRechazada('La reserva tiene que terminar después de empezar.')
      }
      const ahora = reloj.ahora().getTime()
      if (datos.desde.getTime() - ahora < espacio.anticipacionMinimaHoras * HORA) {
        throw new ReservaRechazada(
          `${espacio.nombre} se reserva con al menos ${espacio.anticipacionMinimaHoras} horas de anticipación.`,
        )
      }
      if (datos.desde.getTime() - ahora > espacio.anticipacionMaximaDias * 24 * HORA) {
        throw new ReservaRechazada(
          `${espacio.nombre} se reserva con hasta ${espacio.anticipacionMaximaDias} días de anticipación.`,
        )
      }
      if (datos.hasta.getTime() - datos.desde.getTime() > espacio.duracionMaximaHoras * HORA) {
        throw new ReservaRechazada(
          `${espacio.nombre} se reserva por hasta ${espacio.duracionMaximaHoras} horas seguidas.`,
        )
      }
      if (
        datos.cantidadPersonas != null &&
        espacio.capacidadMaxima != null &&
        datos.cantidadPersonas > espacio.capacidadMaxima
      ) {
        throw new ReservaRechazada(
          `${espacio.nombre} admite hasta ${espacio.capacidadMaxima} personas.`,
        )
      }
      const inicioDeMes = new Date(
        Date.UTC(datos.desde.getUTCFullYear(), datos.desde.getUTCMonth(), 1),
      )
      const finDeMes = new Date(
        Date.UTC(datos.desde.getUTCFullYear(), datos.desde.getUTCMonth() + 1, 1),
      )
      const delMes = await prisma.reserva.count({
        where: {
          espacioId: espacio.id,
          unidadId: unidad.id,
          estado: 'confirmada',
          desde: { gte: inicioDeMes, lt: finDeMes },
        },
      })
      if (delMes >= espacio.reservasMaxMesUnidad) {
        throw new ReservaRechazada(
          `La unidad ya tiene ${delMes} ${delMes === 1 ? 'reserva' : 'reservas'} de ${espacio.nombre} este mes; el tope es ${espacio.reservasMaxMesUnidad}.`,
        )
      }

      // 3) La base decide la superposicion (SC-005). 4) Aviso.
      try {
        return await prisma.$transaction(async (tx) => {
          const reserva = await tx.reserva.create({
            data: sinConsorcio({
              espacioId: espacio.id,
              unidadId: unidad.id,
              solicitadaPor: datos.usuarioId,
              desde: datos.desde,
              hasta: datos.hasta,
              cantidadPersonas: datos.cantidadPersonas ?? null,
              observaciones: datos.observaciones?.trim() || null,
              estado: 'confirmada',
            }),
            select: { id: true },
          })
          await notificar(tx, [
            {
              usuarioId: datos.usuarioId,
              tipo: 'reserva_confirmada',
              titulo: `Reserva confirmada: ${espacio.nombre}`,
              cuerpo: `Tenés ${espacio.nombre} reservado para la unidad ${unidad.designacion} desde ${datos.desde.toISOString()} hasta ${datos.hasta.toISOString()}.`,
              entidadTipo: 'Reserva',
              entidadId: reserva.id,
            },
          ])
          return { reservaId: reserva.id }
        })
      } catch (error) {
        if (esSuperposicion(error)) {
          throw new ReservaRechazada(
            `Ese horario de ${espacio.nombre} ya está reservado. Elegí otro.`,
            'RN-10',
          )
        }
        throw error
      }
    },
  )
}

export async function cancelarReserva(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; reservaId: string },
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'cancelar reservas' },
    async (acceso) => {
      const reserva = await prisma.reserva.findFirst({
        where: { id: datos.reservaId },
        include: { espacio: { select: { nombre: true } } },
      })
      if (!reserva) throw new NoEncontrado()
      const esAdministrador = acceso.roles.includes('administrador')
      if (!esAdministrador && reserva.solicitadaPor !== datos.usuarioId) throw new NoEncontrado()
      if (reserva.estado !== 'confirmada') {
        throw new ReservaRechazada('Esa reserva ya no está confirmada.')
      }
      await prisma.$transaction(async (tx) => {
        await tx.reserva.update({ where: { id: reserva.id }, data: { estado: 'cancelada' } })
        await notificar(tx, [
          {
            usuarioId: reserva.solicitadaPor,
            tipo: 'reserva_rechazada',
            titulo: `Reserva cancelada: ${reserva.espacio.nombre}`,
            cuerpo: `La reserva de ${reserva.espacio.nombre} del ${reserva.desde.toISOString()} quedó cancelada.`,
            entidadTipo: 'Reserva',
            entidadId: reserva.id,
          },
        ])
      })
    },
  )
}

/**
 * Las reservas del consorcio en un rango. El consorcista ve todas —para
 * elegir horario— pero solo con la unidad, sin nombre de nadie.
 */
export async function listarReservas(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; desde: Date; hasta: Date; espacioId?: string },
): Promise<ReservaDelConsorcio[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver las reservas' },
    async () => {
      const reservas = await prisma.reserva.findMany({
        where: {
          ...(datos.espacioId ? { espacioId: datos.espacioId } : {}),
          desde: { lt: datos.hasta },
          hasta: { gt: datos.desde },
          estado: { in: ['confirmada', 'cancelada'] },
        },
        include: {
          espacio: { select: { nombre: true } },
          unidad: { select: { designacion: true } },
        },
        orderBy: { desde: 'asc' },
      })
      return reservas.map((r) => ({
        id: r.id,
        espacioId: r.espacioId,
        espacio: r.espacio.nombre,
        unidad: r.unidad.designacion,
        desde: r.desde.toISOString(),
        hasta: r.hasta.toISOString(),
        cantidadPersonas: r.cantidadPersonas,
        estado: r.estado,
        motivoRechazo: r.motivoRechazo,
        propia: r.solicitadaPor === datos.usuarioId,
      }))
    },
  )
}

/** Las unidades para las que el usuario puede reservar. */
export async function unidadesParaReservar(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<{ id: string; designacion: string }[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'reservar' },
    async (acceso) => {
      if (acceso.roles.includes('administrador')) {
        return prisma.unidad.findMany({
          select: { id: true, designacion: true },
          orderBy: { designacion: 'asc' },
        })
      }
      return unidadesOcupadasPor(datos.usuarioId, datos.consorcioId, reloj.hoy())
    },
  )
}
