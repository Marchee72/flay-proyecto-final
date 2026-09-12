import type { AlcanceReclamo, Urgencia } from '@prisma/client'

import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'
import { ocupaUnidad, unidadesOcupadasPor } from '@/infraestructura/repositorios/ocupaciones'

/**
 * Alta de un reclamo (`RF-11`, `CU-07`, `FR-005`). Nace `abierto` y **sin
 * responsable**, que es el unico estado que lo admite (regla RN-11 § 7.2); el
 * asiento `null → abierto` es el que le da a I-4 la apertura. El triage se
 * encola: la sugerencia llega despues, o no llega, y el reclamo existe igual.
 */

export const URGENCIAS: readonly { valor: Urgencia; etiqueta: string }[] = [
  { valor: 'baja', etiqueta: 'Baja' },
  { valor: 'media', etiqueta: 'Media' },
  { valor: 'alta', etiqueta: 'Alta' },
  { valor: 'critica', etiqueta: 'Crítica' },
]

export class ReclamoIncompleto extends ErrorDeAplicacion {
  constructor(campo: 'titulo' | 'descripcion') {
    super(
      campo === 'titulo'
        ? 'Poné un título corto que diga qué pasa (hasta 140 caracteres).'
        : 'Contá el problema con algo más de detalle: dónde está y desde cuándo.',
      'RF-11',
    )
  }
}

export async function registrarReclamo(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    unidadId?: string | null
    titulo: string
    descripcion: string
    urgencia?: Urgencia
    alcance?: AlcanceReclamo
  },
): Promise<{ reclamoId: string }> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'registrar reclamos' },
    async (acceso) => {
      const titulo = datos.titulo.trim()
      const descripcion = datos.descripcion.trim()
      if (titulo.length === 0 || titulo.length > 140) throw new ReclamoIncompleto('titulo')
      if (descripcion.length < 10) throw new ReclamoIncompleto('descripcion')

      let unidadId: string | null = null
      if (datos.unidadId) {
        const unidad = await prisma.unidad.findFirst({ where: { id: datos.unidadId } })
        if (!unidad) throw new NoEncontrado()
        // Un consorcista solo reclama sobre una unidad que ocupa; el
        // administrador y el consejo, sobre cualquiera del consorcio.
        const privilegiado = acceso.roles.some((r) => r === 'administrador' || r === 'consejo')
        if (!privilegiado && !(await ocupaUnidad(datos.usuarioId, unidad.id, reloj.hoy()))) {
          throw new NoEncontrado()
        }
        unidadId = unidad.id
      }

      const reclamoId = await prisma.$transaction(async (tx) => {
        const reclamo = await tx.reclamo.create({
          data: sinConsorcio({
            unidadId,
            creadoPor: datos.usuarioId,
            titulo,
            descripcion,
            urgencia: datos.urgencia ?? 'media',
            alcance: datos.alcance ?? (unidadId ? 'individual' : 'general'),
          }),
          select: { id: true },
        })
        await tx.reclamoHistorial.create({
          data: {
            reclamoId: reclamo.id,
            estadoAnterior: null,
            estadoNuevo: 'abierto',
            usuarioId: datos.usuarioId,
          },
        })
        // El triage llega cuando llega (research R-10); sin manejador, queda pendiente.
        await tx.$executeRaw`
          INSERT INTO "TrabajoPendiente" (tipo, carga)
          VALUES ('triage_reclamo'::"TipoTrabajo", jsonb_build_object('reclamoId', ${reclamo.id}::text))
        `
        return reclamo.id
      })

      return { reclamoId }
    },
  )
}

/**
 * Las unidades sobre las que el usuario puede reclamar: todas para el
 * administrador y el consejo; las que ocupa, para el consorcista.
 */
export async function unidadesParaReclamar(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<{ id: string; designacion: string }[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'registrar reclamos' },
    async (acceso) => {
      const privilegiado = acceso.roles.some((r) => r === 'administrador' || r === 'consejo')
      if (privilegiado) {
        return prisma.unidad.findMany({
          select: { id: true, designacion: true },
          orderBy: { designacion: 'asc' },
        })
      }
      return unidadesOcupadasPor(datos.usuarioId, datos.consorcioId, reloj.hoy())
    },
  )
}
