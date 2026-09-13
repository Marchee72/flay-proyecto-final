import type { EstadoIndexacion, TipoDocumento } from '@prisma/client'

import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { claveEsDe } from '@/aplicacion/comunicacion/objetos'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'

/**
 * Documentacion del consorcio (`RF-19`, `CU-15`, `FR-016`): reglamento,
 * actas, contratos. El consorcista solo ve lo marcado visible (SC-016). La
 * indexacion es diferida (`FR-030`): el documento nace `pendiente` con su
 * trabajo, y la carga no espera. La baja esta diferida (§ 9.11).
 */

export const TIPOS_DOCUMENTO: readonly { valor: TipoDocumento; etiqueta: string }[] = [
  { valor: 'reglamento_copropiedad', etiqueta: 'Reglamento de copropiedad' },
  { valor: 'reglamento_interno', etiqueta: 'Reglamento interno' },
  { valor: 'acta', etiqueta: 'Acta' },
  { valor: 'contrato', etiqueta: 'Contrato' },
  { valor: 'poliza', etiqueta: 'Póliza' },
  { valor: 'otro', etiqueta: 'Otro' },
]

export const ETIQUETA_INDEXACION: Record<EstadoIndexacion, string> = {
  pendiente: 'Pendiente de indexar',
  procesando: 'Indexando',
  indexado: 'Listo para consultar',
  error: 'No se pudo indexar',
}

export interface DocumentoDelConsorcio {
  id: string
  tipo: TipoDocumento
  tipoEtiqueta: string
  titulo: string
  fechaDocumento: string | null
  visibleConsorcistas: boolean
  estadoIndexacion: EstadoIndexacion
  errorIndexacion: string | null
  fragmentos: number
}

export class DocumentoIncompleto extends ErrorDeAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 'RF-19')
  }
}

/** Al confirmar la subida: la fila y su trabajo de indexacion, juntos. */
export async function cargarDocumento(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    clave: string
    tipoContenido: string
    tipo: TipoDocumento
    titulo: string
    fechaDocumento?: Date | null
    visibleConsorcistas: boolean
  },
): Promise<{ documentoId: string }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'cargar documentos',
    },
    async () => {
      const titulo = datos.titulo.trim()
      if (!titulo || titulo.length > 200) {
        throw new DocumentoIncompleto('Poné un título de hasta 200 caracteres.')
      }
      if (!claveEsDe(datos.clave, 'documentos', datos.consorcioId)) throw new NoEncontrado()
      if (!TIPOS_DOCUMENTO.some((t) => t.valor === datos.tipo)) {
        throw new DocumentoIncompleto('Elegí un tipo de documento de la lista.')
      }

      return prisma.$transaction(async (tx) => {
        const documento = await tx.documentoConsorcio.create({
          data: sinConsorcio({
            tipo: datos.tipo,
            titulo,
            claveAlmacenamiento: datos.clave,
            tipoContenido: datos.tipoContenido,
            fechaDocumento: datos.fechaDocumento ?? null,
            visibleConsorcistas: datos.visibleConsorcistas,
            cargadoPor: datos.usuarioId,
          }),
          select: { id: true },
        })
        await tx.$executeRaw`
          INSERT INTO "TrabajoPendiente" (tipo, carga)
          VALUES ('indexar_documento'::"TipoTrabajo", jsonb_build_object('documentoId', ${documento.id}::text))
        `
        return { documentoId: documento.id }
      })
    },
  )
}

const visiblesPara = (roles: string[]) =>
  roles.some((r) => r === 'administrador' || r === 'consejo') ? {} : { visibleConsorcistas: true }

export async function listarDocumentos(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<DocumentoDelConsorcio[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver documentos' },
    async (acceso) => {
      const documentos = await prisma.documentoConsorcio.findMany({
        where: visiblesPara(acceso.roles),
        orderBy: [{ tipo: 'asc' }, { fechaDocumento: 'desc' }, { creadoEn: 'desc' }],
        include: { _count: { select: { fragmentos: true } } },
      })
      return documentos.map((d) => ({
        id: d.id,
        tipo: d.tipo,
        tipoEtiqueta: TIPOS_DOCUMENTO.find((t) => t.valor === d.tipo)?.etiqueta ?? d.tipo,
        titulo: d.titulo,
        fechaDocumento: d.fechaDocumento?.toISOString().slice(0, 10) ?? null,
        visibleConsorcistas: d.visibleConsorcistas,
        estadoIndexacion: d.estadoIndexacion,
        errorIndexacion: d.errorIndexacion,
        fragmentos: d._count.fragmentos,
      }))
    },
  )
}

/** Lectura por enlace firmado, como los comprobantes. Otro consorcio o no visible: «no encontrado». */
export async function verDocumento(
  almacen: AlmacenObjetos,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; documentoId: string },
): Promise<{ titulo: string; tipoContenido: string; direccion: string }> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver documentos' },
    async (acceso) => {
      const documento = await prisma.documentoConsorcio.findFirst({
        where: { id: datos.documentoId, ...visiblesPara(acceso.roles) },
      })
      if (!documento) throw new NoEncontrado()
      const direccion = await almacen.resolverLecturaAutorizada(documento.claveAlmacenamiento, 600)
      return { titulo: documento.titulo, tipoContenido: documento.tipoContenido, direccion }
    },
  )
}
