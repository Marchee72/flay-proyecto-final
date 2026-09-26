import type { AlcanceNovedad, Prisma } from '@prisma/client'

import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { divisionDe } from '@/dominio/unidades/division'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { habilitadosDelConsorcio, notificar } from '@/aplicacion/comunicacion/notificar'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'
import { unidadesOcupadasPor, usuariosQueOcupan } from '@/infraestructura/repositorios/ocupaciones'

/**
 * Novedades del consorcio (`RF-18`, `CU-12`, `FR-015`): el administrador
 * publica y los destinatarios reciben el aviso (§ 12.7), en la misma
 * transaccion que la publicacion.
 *
 * Cada novedad rige entre dos fechas y despues deja de mostrarse. Va a todo el
 * consorcio, a una unidad o a una division (1A, 2A, 3A...), y cada uno puede
 * descartarla para no verla mas. El administrador ve todas en la seccion, con
 * su estado, porque es su pantalla de gestion.
 */

const DIA = 24 * 60 * 60 * 1000

export type EstadoNovedad = 'programada' | 'vigente' | 'vencida'

export interface NovedadDelConsorcio {
  id: string
  titulo: string
  cuerpo: string
  publicadaEn: string
  fijada: boolean
  vigenteDesde: string
  vigenteHasta: string
  estado: EstadoNovedad
  /** Null si va a todo el consorcio; si no, «Unidad 3B» o «División A». */
  destinatario: string | null
}

export class NovedadIncompleta extends ErrorDeAplicacion {
  constructor() {
    super('La novedad necesita un título (hasta 140 caracteres) y un cuerpo.', 'RF-18')
  }
}

export class VigenciaDeNovedadInvalida extends ErrorDeAplicacion {
  constructor() {
    super('La novedad tiene que terminar hoy o después, y no antes de empezar.', 'RF-18')
  }
}

export class DestinatarioInvalido extends ErrorDeAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 'RF-18')
  }
}

export async function publicarNovedad(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    titulo: string
    cuerpo: string
    fijada?: boolean
    /** Por omision, desde hoy y por treinta dias. */
    vigenteDesde?: Date
    vigenteHasta?: Date
    alcance?: AlcanceNovedad
    unidadId?: string | null
    division?: string | null
  },
): Promise<{ novedadId: string; avisados: number }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'publicar novedades',
    },
    async () => {
      const titulo = datos.titulo.trim()
      const cuerpo = datos.cuerpo.trim()
      if (!titulo || titulo.length > 140 || !cuerpo) throw new NovedadIncompleta()
      const vigenteDesde = datos.vigenteDesde ?? reloj.hoy()
      const vigenteHasta = datos.vigenteHasta ?? new Date(vigenteDesde.getTime() + 30 * DIA)
      if (
        Number.isNaN(vigenteDesde.getTime()) ||
        Number.isNaN(vigenteHasta.getTime()) ||
        vigenteHasta < vigenteDesde ||
        vigenteHasta < reloj.hoy()
      ) {
        throw new VigenciaDeNovedadInvalida()
      }

      const alcance = datos.alcance ?? 'general'
      const destino = await unidadesDestino(alcance, datos.unidadId, datos.division)

      return prisma.$transaction(async (tx) => {
        const novedad = await tx.novedad.create({
          data: sinConsorcio({
            titulo,
            cuerpo,
            publicadaPor: datos.usuarioId,
            fijada: datos.fijada ?? false,
            vigenteDesde,
            vigenteHasta,
            alcance,
            unidadId: alcance === 'unidad' ? destino.unidadIds[0] : null,
            division: alcance === 'division' ? destino.division : null,
          }),
          select: { id: true },
        })
        const habilitados = await habilitadosDelConsorcio(tx)
        const ocupantes =
          alcance === 'general'
            ? null
            : new Set(await usuariosQueOcupan(destino.unidadIds, reloj.hoy()))
        const avisados = habilitados.filter(
          (usuarioId) =>
            usuarioId !== datos.usuarioId && (ocupantes === null || ocupantes.has(usuarioId)),
        )
        await notificar(
          tx,
          avisados.map((usuarioId) => ({
            usuarioId,
            tipo: 'novedad' as const,
            titulo: `Novedad: ${titulo}`,
            cuerpo,
            entidadTipo: 'Novedad',
            entidadId: novedad.id,
          })),
        )
        return { novedadId: novedad.id, avisados: avisados.length }
      })
    },
  )
}

/** Las unidades a las que va la novedad, validadas contra el padron del consorcio activo. */
async function unidadesDestino(
  alcance: AlcanceNovedad,
  unidadId: string | null | undefined,
  division: string | null | undefined,
): Promise<{ unidadIds: string[]; division: string | null }> {
  if (alcance === 'general') return { unidadIds: [], division: null }
  if (alcance === 'unidad') {
    // Aislada: una unidad de otro consorcio no aparece.
    const unidad = unidadId
      ? await prisma.unidad.findFirst({
          where: { id: unidadId, bajaDesde: null },
          select: { id: true },
        })
      : null
    if (!unidad) throw new DestinatarioInvalido('Elegí una unidad del consorcio.')
    return { unidadIds: [unidad.id], division: null }
  }
  const letra = division?.trim().toUpperCase() ?? ''
  const unidades = await prisma.unidad.findMany({
    where: { bajaDesde: null },
    select: { id: true, designacion: true },
  })
  const deLaDivision = unidades.filter((u) => letra && divisionDe(u.designacion) === letra)
  if (deLaDivision.length === 0) {
    throw new DestinatarioInvalido('Elegí una división que exista en el padrón.')
  }
  return { unidadIds: deLaDivision.map((u) => u.id), division: letra }
}

/** Para el formulario de publicacion: las unidades y divisiones del padron. */
export async function destinatariosPosibles(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<{ unidades: { id: string; designacion: string }[]; divisiones: string[] }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'publicar novedades',
    },
    async () => {
      const unidades = await prisma.unidad.findMany({
        where: { bajaDesde: null },
        select: { id: true, designacion: true },
        orderBy: { designacion: 'asc' },
      })
      const divisiones = [
        ...new Set(unidades.map((u) => divisionDe(u.designacion)).filter((d) => d !== null)),
      ].sort()
      return { unidades, divisiones }
    },
  )
}

/**
 * `soloVigentes` es la vista del inicio. Quien no administra siempre la recibe
 * asi: vigentes, dirigidas a el y sin las que descarto.
 */
export async function listarNovedades(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; soloVigentes?: boolean },
): Promise<NovedadDelConsorcio[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver novedades' },
    async (acceso) => {
      const hoy = reloj.hoy()
      const administra = acceso.roles.includes('administrador')
      const where: Prisma.NovedadWhereInput = {}

      if (!administra || datos.soloVigentes) {
        where.vigenteDesde = { lte: hoy }
        where.vigenteHasta = { gte: hoy }
        where.descartes = { none: { usuarioId: datos.usuarioId } }
      }
      if (!administra) {
        const mias = await unidadesOcupadasPor(datos.usuarioId, datos.consorcioId, hoy)
        const divisiones = [
          ...new Set(mias.map((u) => divisionDe(u.designacion)).filter((d) => d !== null)),
        ]
        where.OR = [
          { alcance: 'general' },
          { alcance: 'unidad', unidadId: { in: mias.map((u) => u.id) } },
          { alcance: 'division', division: { in: divisiones } },
        ]
      }

      const novedades = await prisma.novedad.findMany({
        where,
        orderBy: [{ fijada: 'desc' }, { publicadaEn: 'desc' }],
        take: 50,
        include: { unidad: { select: { designacion: true } } },
      })
      return novedades.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        cuerpo: n.cuerpo,
        publicadaEn: n.publicadaEn.toISOString(),
        fijada: n.fijada,
        vigenteDesde: n.vigenteDesde.toISOString().slice(0, 10),
        vigenteHasta: n.vigenteHasta.toISOString().slice(0, 10),
        estado: n.vigenteDesde > hoy ? 'programada' : n.vigenteHasta < hoy ? 'vencida' : 'vigente',
        destinatario:
          n.alcance === 'unidad'
            ? `Unidad ${n.unidad?.designacion ?? ''}`
            : n.alcance === 'division'
              ? `División ${n.division}`
              : null,
      }))
    },
  )
}

/** Cualquiera que la ve puede dejar de verla. Solo para el que la descarta. */
export async function descartarNovedad(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; novedadId: string },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'descartar novedades' },
    async () => {
      // Aislada: una novedad de otro consorcio es «no encontrada».
      const novedad = await prisma.novedad.findFirst({
        where: { id: datos.novedadId },
        select: { id: true },
      })
      if (!novedad) throw new NoEncontrado()
      await prisma.novedadDescartada.createMany({
        data: [{ novedadId: novedad.id, usuarioId: datos.usuarioId }],
        skipDuplicates: true,
      })
    },
  )
}
