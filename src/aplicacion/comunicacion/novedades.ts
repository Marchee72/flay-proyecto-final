import { ErrorDeAplicacion } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { habilitadosDelConsorcio, notificar } from '@/aplicacion/comunicacion/notificar'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'

/**
 * Novedades del consorcio (`RF-18`, `CU-12`, `FR-015`): el administrador
 * publica, todos los habilitados la ven y reciben el aviso (§ 12.7), en la
 * misma transaccion que la publicacion.
 */

export interface NovedadDelConsorcio {
  id: string
  titulo: string
  cuerpo: string
  publicadaEn: string
  fijada: boolean
}

export class NovedadIncompleta extends ErrorDeAplicacion {
  constructor() {
    super('La novedad necesita un título (hasta 140 caracteres) y un cuerpo.', 'RF-18')
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

      return prisma.$transaction(async (tx) => {
        const novedad = await tx.novedad.create({
          data: sinConsorcio({
            titulo,
            cuerpo,
            publicadaPor: datos.usuarioId,
            fijada: datos.fijada ?? false,
          }),
          select: { id: true },
        })
        const habilitados = (await habilitadosDelConsorcio(tx)).filter(
          (usuarioId) => usuarioId !== datos.usuarioId,
        )
        await notificar(
          tx,
          habilitados.map((usuarioId) => ({
            usuarioId,
            tipo: 'novedad' as const,
            titulo: `Novedad: ${titulo}`,
            cuerpo,
            entidadTipo: 'Novedad',
            entidadId: novedad.id,
          })),
        )
        return { novedadId: novedad.id, avisados: habilitados.length }
      })
    },
  )
}

export async function listarNovedades(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<NovedadDelConsorcio[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver novedades' },
    async () => {
      const novedades = await prisma.novedad.findMany({
        orderBy: [{ fijada: 'desc' }, { publicadaEn: 'desc' }],
        take: 50,
      })
      return novedades.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        cuerpo: n.cuerpo,
        publicadaEn: n.publicadaEn.toISOString(),
        fijada: n.fijada,
      }))
    },
  )
}
