import { randomUUID } from 'node:crypto'

import type { MayoriaRequerida, ModalidadPunto, TipoAsamblea } from '@prisma/client'

import { fechaParaMostrar } from '@/compartido/formato'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { transicionAsamblea } from '@/dominio/asambleas/estado'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import type { Transaccion } from '@/aplicacion/comunicacion/notificar'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'

import {
  administradoresDelConsorcio,
  avisarPorLosDosCanales,
  cargarAsamblea,
  DIA_MS,
  diaEnArgentina,
  enlaceCalendario,
  eventoDe,
  exigirPuedeDirigir,
  horaParaMostrar,
  propietariosPorCanal,
  ROLES_ORGANIZADORES,
  unidadesVigentes,
} from './comun'
import { AnticipacionInsuficiente, AsambleaInvalida, conReglas } from './errores'

/**
 * Convocatoria (RF-29, FR-001 a FR-009). El orden del día se edita solo en
 * borrador; convocada, la base lo congela (disparador `punto_reglas`).
 */

export interface PuntoNuevo {
  titulo: string
  descripcion?: string | null
  modalidad: ModalidadPunto
  mayoria?: MayoriaRequerida | null
  opciones?: string[]
}

export interface DatosAsamblea {
  tipo: TipoAsamblea
  titulo: string
  fechaHora: Date
  lugar: string
  administracionInvitada: boolean
  puntos: PuntoNuevo[]
}

function validar(datos: DatosAsamblea): void {
  if (!datos.titulo.trim()) throw new AsambleaInvalida('Poné un título a la asamblea.')
  if (!datos.lugar.trim()) throw new AsambleaInvalida('Indicá el lugar de la reunión.')
  if (Number.isNaN(datos.fechaHora.getTime())) {
    throw new AsambleaInvalida('Indicá la fecha y la hora de la primera convocatoria.')
  }
  if (datos.puntos.length === 0) {
    throw new AsambleaInvalida('El orden del día necesita al menos un punto.')
  }
  datos.puntos.forEach((p, i) => {
    const n = i + 1
    if (!p.titulo.trim()) throw new AsambleaInvalida(`El punto ${n} no tiene título.`)
    if (p.modalidad === 'binaria' && !p.mayoria) {
      throw new AsambleaInvalida(`Elegí qué mayoría necesita el punto ${n}.`)
    }
    if (p.modalidad === 'opcion_multiple') {
      const opciones = (p.opciones ?? []).map((o) => o.trim()).filter(Boolean)
      if (opciones.length < 2) {
        throw new AsambleaInvalida(`El punto ${n} es de opciones: necesita al menos dos.`)
      }
    }
  })
}

async function escribirOrdenDelDia(tx: Transaccion, asambleaId: string, puntos: PuntoNuevo[]) {
  // Por lote, con los ids generados en memoria (nota 11): dos sentencias, no una por fila.
  const filas = puntos.map((p, i) => ({
    id: randomUUID(),
    asambleaId,
    orden: i + 1,
    titulo: p.titulo.trim(),
    descripcion: p.descripcion?.trim() || null,
    modalidad: p.modalidad,
    mayoria: p.modalidad === 'binaria' ? (p.mayoria ?? null) : null,
  }))
  await tx.puntoAsamblea.createMany({ data: filas.map(sinConsorcio) })

  const opciones = filas.flatMap((fila, i) =>
    puntos[i].modalidad === 'opcion_multiple'
      ? (puntos[i].opciones ?? [])
          .map((o) => o.trim())
          .filter(Boolean)
          .map((texto, j) => ({ puntoId: fila.id, orden: j + 1, texto }))
      : [],
  )
  if (opciones.length > 0) await tx.opcionPunto.createMany({ data: opciones.map(sinConsorcio) })
}

export async function crearAsamblea(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: DatosAsamblea & { usuarioId: string; consorcioId: string },
): Promise<{ asambleaId: string }> {
  validar(datos)
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ROLES_ORGANIZADORES,
      accion: 'convocar asambleas',
    },
    async (acceso) => {
      // Si organiza la administración, está invitada siempre (FR-003).
      const invitada = acceso.roles.includes('consejo') ? datos.administracionInvitada : true
      return prisma.$transaction(async (tx) => {
        const asamblea = await tx.asamblea.create({
          data: sinConsorcio({
            tipo: datos.tipo,
            titulo: datos.titulo.trim(),
            fechaHora: datos.fechaHora,
            lugar: datos.lugar.trim(),
            organizadorId: datos.usuarioId,
            administracionInvitada: invitada,
          }),
          select: { id: true },
        })
        await escribirOrdenDelDia(tx, asamblea.id, datos.puntos)
        return { asambleaId: asamblea.id }
      })
    },
  )
}

export async function editarBorrador(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: DatosAsamblea & { usuarioId: string; consorcioId: string; asambleaId: string },
): Promise<void> {
  validar(datos)
  await conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ROLES_ORGANIZADORES,
      accion: 'editar asambleas',
    },
    async (acceso) => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      if (asamblea.estado !== 'borrador') {
        throw new AsambleaInvalida('Solo se edita una asamblea en borrador.')
      }
      const invitada = acceso.roles.includes('consejo') ? datos.administracionInvitada : true
      await conReglas(() =>
        prisma.$transaction(async (tx) => {
          await tx.asamblea.update({
            where: { id: asamblea.id },
            data: {
              tipo: datos.tipo,
              titulo: datos.titulo.trim(),
              fechaHora: datos.fechaHora,
              lugar: datos.lugar.trim(),
              administracionInvitada: invitada,
            },
          })
          await tx.puntoAsamblea.deleteMany({ where: { asambleaId: asamblea.id } })
          await escribirOrdenDelDia(tx, asamblea.id, datos.puntos)
        }),
      )
    },
  )
}

export async function borrarBorrador(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; asambleaId: string },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    { ...datos, rolesPermitidos: ROLES_ORGANIZADORES, accion: 'borrar asambleas' },
    async () => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      if (asamblea.estado !== 'borrador') {
        throw new AsambleaInvalida(
          'Solo se borra una asamblea en borrador. Una convocada se cancela.',
        )
      }
      await prisma.asamblea.deleteMany({ where: { id: asamblea.id, estado: 'borrador' } })
    },
  )
}

const ETIQUETA_TIPO: Record<TipoAsamblea, string> = {
  ordinaria: 'ordinaria',
  extraordinaria: 'extraordinaria',
}

export interface ResultadoConvocatoria {
  /** Propietarios a los que Flay no puede avisar: sin cuenta ni correo (FR-009). */
  sinContacto: { unidad: string; nombre: string }[]
}

export async function convocar(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; asambleaId: string },
): Promise<ResultadoConvocatoria> {
  return conAutorizacion(
    repositorio,
    reloj,
    { ...datos, rolesPermitidos: ROLES_ORGANIZADORES, accion: 'convocar asambleas' },
    async () => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      transicionAsamblea(asamblea.estado, 'convocar')

      // Las reglas vigentes del consorcio se copian a la asamblea (FR-035).
      const consorcio = await prisma.consorcio.findUniqueOrThrow({
        where: { id: datos.consorcioId },
        select: {
          nombre: true,
          reglaMayoriaAsamblea: true,
          anticipacionConvocatoriaDias: true,
          topeUnidadesPorApoderado: true,
          umbralExpensasSinVoto: true,
        },
      })

      const dias = consorcio.anticipacionConvocatoriaDias
      const fechaMinima = new Date(diaEnArgentina(reloj.ahora()).getTime() + dias * DIA_MS)
      if (diaEnArgentina(asamblea.fechaHora) < fechaMinima) {
        throw new AnticipacionInsuficiente(dias, fechaParaMostrar(fechaMinima.toISOString()))
      }

      const puntos = await prisma.puntoAsamblea.findMany({
        where: { asambleaId: asamblea.id },
        select: { orden: true, titulo: true },
        orderBy: { orden: 'asc' },
      })
      const unidades = await unidadesVigentes()
      const destinatarios = await propietariosPorCanal(unidades, reloj.hoy())
      const evento = eventoDe(asamblea, puntos, consorcio.nombre)

      const titulo = `Convocatoria: ${asamblea.titulo}`
      const cuerpo = [
        `Asamblea ${ETIQUETA_TIPO[asamblea.tipo]} de ${consorcio.nombre}.`,
        `Primera convocatoria: ${horaParaMostrar(asamblea.fechaHora)}. Segunda convocatoria, media hora después.`,
        `Lugar: ${asamblea.lugar}.`,
        '',
        evento.descripcion,
        '',
        `Si no podés ir, podés darle un poder a otra persona desde Flay: ${evento.enlace}`,
        `Agregar a Google Calendar: ${enlaceCalendario(evento)}`,
      ].join('\n')

      await conReglas(() =>
        prisma.$transaction(async (tx) => {
          await tx.asamblea.update({
            where: { id: asamblea.id },
            data: {
              estado: 'convocada',
              convocadaEn: reloj.ahora(),
              reglaMayoria: consorcio.reglaMayoriaAsamblea,
              anticipacionDias: dias,
              topeApoderado: consorcio.topeUnidadesPorApoderado,
              umbralSinVoto: consorcio.umbralExpensasSinVoto,
            },
          })
          const administracion = asamblea.administracionInvitada
            ? await administradoresDelConsorcio(tx)
            : []
          await avisarPorLosDosCanales(tx, {
            tipo: 'asamblea_convocada',
            titulo,
            cuerpo,
            asambleaId: asamblea.id,
            usuarios: [...destinatarios.conUsuario, ...administracion],
            porCorreo: destinatarios.porCorreo,
          })
        }),
      )

      return { sinContacto: destinatarios.sinContacto }
    },
  )
}

export async function cancelar(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; asambleaId: string; motivo: string },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ROLES_ORGANIZADORES,
      accion: 'cancelar asambleas',
    },
    async (acceso) => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      exigirPuedeDirigir(acceso, asamblea)
      transicionAsamblea(asamblea.estado, 'cancelar', {
        constituida: asamblea.constituidaEn !== null,
      })

      const consorcio = await prisma.consorcio.findUniqueOrThrow({
        where: { id: datos.consorcioId },
        select: { nombre: true },
      })
      const destinatarios = await propietariosPorCanal(await unidadesVigentes(), reloj.hoy())
      const motivo = datos.motivo.trim()

      await conReglas(() =>
        prisma.$transaction(async (tx) => {
          await tx.asamblea.update({
            where: { id: asamblea.id },
            data: {
              estado: 'cancelada',
              canceladaEn: reloj.ahora(),
              motivoCancelacion: motivo || null,
            },
          })
          const administracion = asamblea.administracionInvitada
            ? await administradoresDelConsorcio(tx)
            : []
          await avisarPorLosDosCanales(tx, {
            tipo: 'asamblea_cancelada',
            titulo: `Asamblea cancelada: ${asamblea.titulo}`,
            cuerpo: [
              `Se canceló la asamblea de ${consorcio.nombre} del ${horaParaMostrar(asamblea.fechaHora)}.`,
              motivo ? `Motivo: ${motivo}` : '',
              'Si la tenías agendada, borrá el evento de tu calendario.',
            ]
              .filter(Boolean)
              .join('\n'),
            asambleaId: asamblea.id,
            usuarios: [...destinatarios.conUsuario, ...administracion],
            porCorreo: destinatarios.porCorreo,
          })
        }),
      )
    },
  )
}
