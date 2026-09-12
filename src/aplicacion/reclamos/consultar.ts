import type { AlcanceReclamo, EstadoReclamo, Urgencia } from '@prisma/client'

import { NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Bandeja y detalle (`CU-07`, `CU-08`). Segun rol: administrador y consejo ven
 * todo el consorcio; el consorcista, los propios y los de alcance general. Otro
 * consorcio responde «no encontrado» (regla RN-12 § 7.2), por el aislamiento.
 */

export interface ReclamoResumen {
  id: string
  titulo: string
  estado: EstadoReclamo
  urgencia: Urgencia
  alcance: AlcanceReclamo
  unidad: string | null
  rubro: string | null
  autor: string
  responsable: string | null
  fechaApertura: string
  propio: boolean
}

export interface ReclamoDetalle extends ReclamoResumen {
  descripcion: string
  proveedor: { id: string; nombre: string } | null
  gastoId: string | null
  fechaResolucion: string | null
  responsableId: string | null
  rubroId: string | null
  proveedorId: string | null
  historial: {
    estadoAnterior: EstadoReclamo | null
    estadoNuevo: EstadoReclamo
    comentario: string | null
    usuario: string
    ocurridoEn: string
  }[]
  sugerencia: {
    rubro: { id: string; nombre: string } | null
    urgencia: Urgencia | null
    proveedor: { id: string; nombre: string } | null
    horasEstimadas: number | null
    confianza: string | null
    aceptada: boolean | null
  } | null
  puedeAdministrar: boolean
}

async function nombresDe(usuarioIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(usuarioIds.filter(Boolean))]
  if (ids.length === 0) return new Map()
  const usuarios = await prismaBase.usuario.findMany({
    where: { id: { in: ids } },
    select: { id: true, persona: { select: { nombre: true, apellido: true } } },
  })
  return new Map(usuarios.map((u) => [u.id, `${u.persona.nombre} ${u.persona.apellido}`]))
}

export async function listarReclamos(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; estado?: EstadoReclamo | null },
): Promise<ReclamoResumen[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver reclamos' },
    async (acceso) => {
      const privilegiado = acceso.roles.some((r) => r === 'administrador' || r === 'consejo')
      const reclamos = await prisma.reclamo.findMany({
        where: {
          ...(datos.estado ? { estado: datos.estado } : {}),
          ...(privilegiado ? {} : { OR: [{ creadoPor: datos.usuarioId }, { alcance: 'general' }] }),
        },
        include: { unidad: { select: { designacion: true } }, rubro: { select: { nombre: true } } },
        orderBy: [{ estado: 'asc' }, { fechaApertura: 'desc' }],
      })
      const nombres = await nombresDe(
        reclamos.flatMap((r) => [r.creadoPor, r.responsableId].filter(Boolean) as string[]),
      )
      return reclamos.map((r) => ({
        id: r.id,
        titulo: r.titulo,
        estado: r.estado,
        urgencia: r.urgencia,
        alcance: r.alcance,
        unidad: r.unidad?.designacion ?? null,
        rubro: r.rubro?.nombre ?? null,
        autor: nombres.get(r.creadoPor) ?? '—',
        responsable: r.responsableId ? (nombres.get(r.responsableId) ?? '—') : null,
        fechaApertura: r.fechaApertura.toISOString(),
        propio: r.creadoPor === datos.usuarioId,
      }))
    },
  )
}

export async function verReclamo(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; reclamoId: string },
): Promise<ReclamoDetalle> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver el reclamo' },
    async (acceso) => {
      const privilegiado = acceso.roles.some((r) => r === 'administrador' || r === 'consejo')
      const r = await prisma.reclamo.findFirst({
        where: { id: datos.reclamoId },
        include: {
          unidad: { select: { designacion: true } },
          rubro: { select: { nombre: true } },
          proveedor: { select: { id: true, razonSocial: true } },
          historial: { orderBy: { ocurridoEn: 'asc' } },
          sugerencia: true,
        },
      })
      if (!r) throw new NoEncontrado()
      if (!privilegiado && r.creadoPor !== datos.usuarioId && r.alcance !== 'general') {
        throw new NoEncontrado()
      }

      const nombres = await nombresDe([
        r.creadoPor,
        r.responsableId ?? '',
        ...r.historial.map((h) => h.usuarioId),
      ])

      const [rubroSugerido, proveedorSugerido] = await Promise.all([
        r.sugerencia?.rubroSugeridoId
          ? prismaBase.rubroGasto.findUnique({
              where: { id: r.sugerencia.rubroSugeridoId },
              select: { id: true, nombre: true },
            })
          : null,
        r.sugerencia?.proveedorSugeridoId
          ? prisma.proveedor.findFirst({
              where: { id: r.sugerencia.proveedorSugeridoId },
              select: { id: true, razonSocial: true },
            })
          : null,
      ])

      return {
        id: r.id,
        titulo: r.titulo,
        descripcion: r.descripcion,
        estado: r.estado,
        urgencia: r.urgencia,
        alcance: r.alcance,
        unidad: r.unidad?.designacion ?? null,
        rubro: r.rubro?.nombre ?? null,
        rubroId: r.rubroId,
        proveedor: r.proveedor ? { id: r.proveedor.id, nombre: r.proveedor.razonSocial } : null,
        proveedorId: r.proveedorId,
        gastoId: r.gastoId,
        autor: nombres.get(r.creadoPor) ?? '—',
        responsable: r.responsableId ? (nombres.get(r.responsableId) ?? '—') : null,
        responsableId: r.responsableId,
        fechaApertura: r.fechaApertura.toISOString(),
        fechaResolucion: r.fechaResolucion?.toISOString() ?? null,
        propio: r.creadoPor === datos.usuarioId,
        historial: r.historial.map((h) => ({
          estadoAnterior: h.estadoAnterior,
          estadoNuevo: h.estadoNuevo,
          comentario: h.comentario,
          usuario: nombres.get(h.usuarioId) ?? '—',
          ocurridoEn: h.ocurridoEn.toISOString(),
        })),
        sugerencia: r.sugerencia
          ? {
              rubro: rubroSugerido,
              urgencia: r.sugerencia.urgenciaSugerida,
              proveedor: proveedorSugerido
                ? { id: proveedorSugerido.id, nombre: proveedorSugerido.razonSocial }
                : null,
              horasEstimadas: r.sugerencia.horasEstimadas,
              confianza: r.sugerencia.confianza?.toFixed(3) ?? null,
              aceptada: r.sugerencia.aceptada,
            }
          : null,
        puedeAdministrar: acceso.roles.includes('administrador'),
      }
    },
  )
}
