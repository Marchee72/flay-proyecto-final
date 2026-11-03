import { NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { verificarTope } from '@/dominio/asambleas/poderes'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { notificar, type Transaccion } from '@/aplicacion/comunicacion/notificar'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import { propietariosVigentesDe } from '@/infraestructura/repositorios/ocupaciones'

import { cargarAsamblea, exigirPuedeDirigir, ROLES_ORGANIZADORES } from './comun'
import {
  ApoderadoNoHabilitado,
  AsambleaYaAbierta,
  conReglas,
  NoEsPropietario,
  UnidadYaTienePoder,
} from './errores'

/**
 * Poderes para una asamblea (RF-30, FR-010 a FR-014, art. 23 del reglamento).
 * Valen para una sola asamblea y se revocan hasta que se abre. El tope por
 * apoderado se cuenta dentro de un candado de transacción, para que dos
 * otorgamientos simultáneos no lo superen (research R-12).
 */

type Datos = { usuarioId: string; consorcioId: string; asambleaId: string }

async function exigirConvocada(asambleaId: string) {
  const asamblea = await cargarAsamblea(asambleaId)
  if (asamblea.estado !== 'convocada') throw new AsambleaYaAbierta()
  return asamblea
}

async function exigirHabilitado(tx: Transaccion, usuarioId: string): Promise<void> {
  const habilitado = await tx.habilitacion.findFirst({
    where: { usuarioId, vigenciaHasta: null },
    select: { id: true },
  })
  if (!habilitado) throw new ApoderadoNoHabilitado()
}

/** Los usuarios del consorcio a los que se puede dar un poder, menos uno mismo. */
export async function apoderadosPosibles(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<{ id: string; nombre: string }[]> {
  return conAutorizacion(repositorio, reloj, { ...datos, accion: 'ver asambleas' }, async () => {
    const filas = await prisma.habilitacion.findMany({
      where: { vigenciaHasta: null, usuarioId: { not: datos.usuarioId } },
      select: { usuarioId: true },
      distinct: ['usuarioId'],
    })
    const usuarios = await prismaBase.usuario.findMany({
      where: { id: { in: filas.map((f) => f.usuarioId) } },
      select: { id: true, persona: { select: { nombre: true, apellido: true } } },
    })
    return usuarios
      .map((u) => ({ id: u.id, nombre: `${u.persona.nombre} ${u.persona.apellido}`.trim() }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  })
}

async function crearPoder(
  tx: Transaccion,
  poder: {
    asambleaId: string
    unidadId: string
    otorganteId: string
    apoderadoId: string
    origen: 'en_linea' | 'papel'
    registradoPorId: string
    tope: number
  },
): Promise<void> {
  // El tope se cuenta bajo un candado por (asamblea, apoderado): dos poderes
  // simultáneos al mismo apoderado esperan su turno (research R-12).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${poder.asambleaId + poder.apoderadoId}))`
  const representa = await tx.poder.count({
    where: { asambleaId: poder.asambleaId, apoderadoId: poder.apoderadoId, revocadoEn: null },
  })
  verificarTope(representa, poder.tope)
  const { tope: _tope, ...datos } = poder
  await tx.poder.create({ data: sinConsorcio(datos) })
}

async function avisarPoder(
  tx: Transaccion,
  tipo: 'poder_otorgado' | 'poder_revocado',
  asamblea: { id: string; titulo: string },
  designacion: string,
  usuarios: (string | null)[],
): Promise<void> {
  const titulo =
    tipo === 'poder_otorgado'
      ? `Poder otorgado para la unidad ${designacion}`
      : `Poder revocado para la unidad ${designacion}`
  const cuerpo =
    tipo === 'poder_otorgado'
      ? `Para la asamblea «${asamblea.titulo}», hay un poder vigente sobre la unidad ${designacion}: el apoderado puede acreditarse y votar por ella.`
      : `Se revocó el poder sobre la unidad ${designacion} para la asamblea «${asamblea.titulo}».`
  await notificar(
    tx,
    [...new Set(usuarios.filter((u): u is string => !!u))].map((usuarioId) => ({
      usuarioId,
      tipo,
      titulo,
      cuerpo,
      entidadTipo: 'asamblea',
      entidadId: asamblea.id,
    })),
  )
}

/** El propietario le da el poder a otro usuario del consorcio (FR-010). */
export async function otorgarPoder(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos & { unidadId: string; apoderadoId: string },
): Promise<void> {
  await conAutorizacion(repositorio, reloj, { ...datos, accion: 'otorgar poderes' }, async () => {
    const asamblea = await exigirConvocada(datos.asambleaId)
    const unidad = await prisma.unidad.findFirst({
      where: { id: datos.unidadId, bajaDesde: null },
      select: { id: true, designacion: true },
    })
    if (!unidad) throw new NoEncontrado('RF-30')
    const propio = (await propietariosVigentesDe([unidad.id], reloj.hoy())).find(
      (p) => p.usuarioId === datos.usuarioId,
    )
    if (!propio) throw new NoEsPropietario()
    if (datos.apoderadoId === datos.usuarioId) throw new ApoderadoNoHabilitado()

    await conReglas(
      () =>
        prisma.$transaction(async (tx) => {
          await exigirHabilitado(tx, datos.apoderadoId)
          await crearPoder(tx, {
            asambleaId: asamblea.id,
            unidadId: unidad.id,
            otorganteId: propio.personaId,
            apoderadoId: datos.apoderadoId,
            origen: 'en_linea',
            registradoPorId: datos.usuarioId,
            tope: asamblea.topeApoderado ?? 3,
          })
          await avisarPoder(tx, 'poder_otorgado', asamblea, unidad.designacion, [
            datos.usuarioId,
            datos.apoderadoId,
          ])
        }),
      () => new UnidadYaTienePoder(),
    )
  })
}

/**
 * La administración, o quien puede dirigir si no está invitada, registra el
 * poder que un propietario sin cuenta entregó en papel (FR-011).
 */
export async function registrarPoderEnPapel(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos & { unidadId: string; otorganteId: string; apoderadoId: string },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    { ...datos, rolesPermitidos: ROLES_ORGANIZADORES, accion: 'registrar poderes' },
    async (acceso) => {
      const asamblea = await exigirConvocada(datos.asambleaId)
      exigirPuedeDirigir(acceso, asamblea)
      const unidad = await prisma.unidad.findFirst({
        where: { id: datos.unidadId, bajaDesde: null },
        select: { id: true, designacion: true },
      })
      if (!unidad) throw new NoEncontrado('RF-30')
      const esPropietario = (await propietariosVigentesDe([unidad.id], reloj.hoy())).some(
        (p) => p.personaId === datos.otorganteId,
      )
      if (!esPropietario) throw new NoEsPropietario()

      await conReglas(
        () =>
          prisma.$transaction(async (tx) => {
            await exigirHabilitado(tx, datos.apoderadoId)
            await crearPoder(tx, {
              asambleaId: asamblea.id,
              unidadId: unidad.id,
              otorganteId: datos.otorganteId,
              apoderadoId: datos.apoderadoId,
              origen: 'papel',
              registradoPorId: datos.usuarioId,
              tope: asamblea.topeApoderado ?? 3,
            })
            await avisarPoder(tx, 'poder_otorgado', asamblea, unidad.designacion, [
              datos.apoderadoId,
            ])
          }),
        () => new UnidadYaTienePoder(),
      )
    },
  )
}

/** Hasta que se abre la asamblea, lo revoca quien lo otorgó o quien lo registró (FR-013). */
export async function revocarPoder(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos & { poderId: string },
): Promise<void> {
  await conAutorizacion(repositorio, reloj, { ...datos, accion: 'revocar poderes' }, async () => {
    const asamblea = await cargarAsamblea(datos.asambleaId)
    const poder = await prisma.poder.findFirst({
      where: { id: datos.poderId, asambleaId: asamblea.id, revocadoEn: null },
      include: { unidad: { select: { designacion: true } } },
    })
    if (!poder) throw new NoEncontrado('RF-30')
    const yo = await prismaBase.usuario.findUniqueOrThrow({
      where: { id: datos.usuarioId },
      select: { personaId: true },
    })
    if (poder.otorganteId !== yo.personaId && poder.registradoPorId !== datos.usuarioId) {
      throw new NoEncontrado('RF-30')
    }
    if (asamblea.estado !== 'convocada') throw new AsambleaYaAbierta()

    const otorgante = await prismaBase.usuario.findFirst({
      where: { personaId: poder.otorganteId },
      select: { id: true },
    })
    await conReglas(() =>
      prisma.$transaction(async (tx) => {
        await tx.poder.update({ where: { id: poder.id }, data: { revocadoEn: reloj.ahora() } })
        await avisarPoder(tx, 'poder_revocado', asamblea, poder.unidad.designacion, [
          otorgante?.id ?? null,
          poder.apoderadoId,
        ])
      }),
    )
  })
}
