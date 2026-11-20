import type { EstadoIndexacion, TipoDocumento } from '@prisma/client'

import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { claveEsDe } from '@/aplicacion/comunicacion/objetos'
import type { Transaccion } from '@/aplicacion/comunicacion/notificar'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Documentacion del consorcio (`RF-19`, `CU-15`, `FR-016`): reglamento,
 * actas, contratos. El consorcista solo ve lo marcado visible (SC-016). La
 * indexacion es diferida (`FR-030`): el documento nace `pendiente` con su
 * trabajo, y la carga no espera. La baja archiva (RN-22).
 */

export const TIPOS_DOCUMENTO: readonly { valor: TipoDocumento; etiqueta: string }[] = [
  { valor: 'reglamento_copropiedad', etiqueta: 'Reglamento de copropiedad' },
  { valor: 'reglamento_interno', etiqueta: 'Reglamento interno' },
  { valor: 'acta', etiqueta: 'Acta' },
  { valor: 'contrato', etiqueta: 'Contrato' },
  { valor: 'poliza', etiqueta: 'Póliza' },
  { valor: 'otro', etiqueta: 'Otro' },
]

/**
 * La documentacion que fija configuracion (`RF-19`): al indexarse se lee en
 * busca de sugerencias. Poliza y «otro» no se analizan.
 */
export const TIPOS_ANALIZABLES: readonly TipoDocumento[] = [
  'reglamento_copropiedad',
  'reglamento_interno',
  'acta',
  'contrato',
]

/** Solo lo ve el administrador: al consorcista la indexacion no le dice nada. */
export const ETIQUETA_INDEXACION: Record<EstadoIndexacion, string> = {
  pendiente: 'En proceso',
  procesando: 'En proceso',
  indexado: 'Procesado',
  error: 'No se pudo procesar',
}

export interface DocumentoDelConsorcio {
  id: string
  tipo: TipoDocumento
  tipoEtiqueta: string
  titulo: string
  fechaDocumento: string | null
  visibleConsorcistas: boolean
  /** `null` para quien no administra. */
  estadoIndexacion: EstadoIndexacion | null
  errorIndexacion: string | null
  fragmentos: number
  /** Sugerencias de configuracion sin revisar (RN-14); `null` para quien no administra. */
  sugerenciasPendientes: number | null
}

export class DocumentoIncompleto extends ErrorDeAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 'RF-19')
  }
}

export class DocumentoDeActa extends ErrorDeAplicacion {
  constructor() {
    super('Este documento es el acta firmada de una asamblea y no se puede eliminar.', 'RF-19')
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
        await encolarIndexacion(tx, documento.id)
        return { documentoId: documento.id }
      })
    },
  )
}

const encolarIndexacion = (tx: Transaccion, documentoId: string) => tx.$executeRaw`
  INSERT INTO "TrabajoPendiente" (tipo, carga)
  VALUES ('indexar_documento'::"TipoTrabajo", jsonb_build_object('documentoId', ${documentoId}::text))
`

/** Sin `proximo_intento`: lo pone el reloj de la base (decision 9). */
export const encolarSugerencias = (
  cliente: Pick<typeof prismaBase, '$executeRaw'>,
  documentoId: string,
) => cliente.$executeRaw`
  INSERT INTO "TrabajoPendiente" (tipo, carga)
  VALUES ('sugerir_configuracion'::"TipoTrabajo", jsonb_build_object('documentoId', ${documentoId}::text))
`

/** Solo despues de leer el documento por el cliente aislado: la cola no tiene `consorcio_id`. */
const ultimoTrabajo = (tipo: 'indexar_documento' | 'sugerir_configuracion', documentoId: string) =>
  prismaBase.trabajoPendiente.findFirst({
    where: { tipo, carga: { path: ['documentoId'], equals: documentoId } },
    orderBy: { creadoEn: 'desc' },
    select: { estado: true, ultimoError: true },
  })

const sugerenciasEnCola = async (documentoId: string) =>
  (await ultimoTrabajo('sugerir_configuracion', documentoId))?.estado === 'pendiente'

/**
 * «Buscar configuración» sobre un documento ya indexado (`RF-19`): encola el
 * analisis sin reindexar, para los reglamentos cargados antes de que existiera.
 */
export async function buscarConfiguracion(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; documentoId: string },
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'buscar configuración en los documentos',
    },
    async () => {
      const documento = await prisma.documentoConsorcio.findFirst({
        where: { id: datos.documentoId, archivadoEn: null },
        select: { id: true, tipo: true, estadoIndexacion: true },
      })
      if (!documento) throw new NoEncontrado()
      if (
        documento.estadoIndexacion !== 'indexado' ||
        !TIPOS_ANALIZABLES.includes(documento.tipo)
      ) {
        throw new ErrorDeAplicacion('Este documento no se analiza para configuración.', 'RF-19')
      }
      // Otro clic con el analisis en cola no encola uno mas: leeria lo mismo.
      if (!(await sugerenciasEnCola(documento.id))) await encolarSugerencias(prisma, documento.id)
    },
  )
}

/**
 * Para la pantalla del documento (`RF-19`), solo el administrador: `null` si el
 * tipo no se analiza. `analizando` mientras se indexa o hay un
 * `sugerir_configuracion` en cola: la pagina sondea (decision 21) y no deja
 * encolar otro.
 */
export async function analisisDeConfiguracion(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; documentoId: string },
): Promise<{
  indexado: boolean
  analizando: boolean
  /** El proveedor fallo al menos una vez y la cola sigue reintentando. */
  reintentando: boolean
  /** La ultima busqueda agoto sus intentos sin respuesta del proveedor. */
  fallo: boolean
} | null> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'revisar las sugerencias de configuración',
    },
    async () => {
      const documento = await prisma.documentoConsorcio.findFirst({
        where: { id: datos.documentoId, archivadoEn: null },
        select: { id: true, tipo: true, estadoIndexacion: true },
      })
      if (!documento) throw new NoEncontrado()
      if (!TIPOS_ANALIZABLES.includes(documento.tipo)) return null
      const [indexacion, busqueda] = await Promise.all([
        ultimoTrabajo('indexar_documento', documento.id),
        ultimoTrabajo('sugerir_configuracion', documento.id),
      ])
      // En `error` con su trabajo todavia en cola, la indexacion sigue: la cola reintenta.
      const indexando =
        documento.estadoIndexacion === 'pendiente' ||
        documento.estadoIndexacion === 'procesando' ||
        (documento.estadoIndexacion === 'error' && indexacion?.estado === 'pendiente')
      const buscando = busqueda?.estado === 'pendiente'
      return {
        indexado: documento.estadoIndexacion === 'indexado',
        analizando: indexando || buscando,
        reintentando:
          (indexando && !!indexacion?.ultimoError) || (buscando && !!busqueda.ultimoError),
        fallo: !indexando && !buscando && busqueda?.estado === 'agotado',
      }
    },
  )
}

/**
 * Vuelve a encolar un documento que quedo en `error` (o trabado en
 * `procesando`): el administrador no tiene que borrarlo y subirlo de nuevo.
 */
export async function reindexarDocumento(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; documentoId: string },
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'reprocesar documentos',
    },
    async () => {
      const documento = await prisma.documentoConsorcio.findFirst({
        where: { id: datos.documentoId, archivadoEn: null },
        select: { id: true },
      })
      if (!documento) throw new NoEncontrado()
      await prisma.$transaction(async (tx) => {
        await tx.documentoConsorcio.update({
          where: { id: documento.id },
          data: { estadoIndexacion: 'pendiente', errorIndexacion: null },
        })
        await encolarIndexacion(tx, documento.id)
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
      const administra = acceso.roles.includes('administrador')
      const documentos = await prisma.documentoConsorcio.findMany({
        where: { ...visiblesPara(acceso.roles), archivadoEn: null },
        orderBy: [{ tipo: 'asc' }, { fechaDocumento: 'desc' }, { creadoEn: 'desc' }],
        include: {
          _count: {
            select: { fragmentos: true, sugerencias: { where: { estado: 'pendiente' } } },
          },
        },
      })
      return documentos.map((d) => ({
        id: d.id,
        tipo: d.tipo,
        tipoEtiqueta: TIPOS_DOCUMENTO.find((t) => t.valor === d.tipo)?.etiqueta ?? d.tipo,
        titulo: d.titulo,
        fechaDocumento: d.fechaDocumento?.toISOString().slice(0, 10) ?? null,
        visibleConsorcistas: d.visibleConsorcistas,
        estadoIndexacion: administra ? d.estadoIndexacion : null,
        errorIndexacion: administra ? d.errorIndexacion : null,
        fragmentos: d._count.fragmentos,
        sugerenciasPendientes: administra ? d._count.sugerencias : null,
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
): Promise<{ titulo: string; tipoContenido: string; vista: string; descarga: string }> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver documentos' },
    async (acceso) => {
      // El administrador ve también el archivado (RN-22); el resto, solo lo vigente.
      const documento = await prisma.documentoConsorcio.findFirst({
        where: {
          id: datos.documentoId,
          ...visiblesPara(acceso.roles),
          ...(acceso.roles.includes('administrador') ? {} : { archivadoEn: null }),
        },
      })
      if (!documento) throw new NoEncontrado()
      // Dos enlaces: uno en línea para el visor y otro como adjunto para «Descargar».
      const [vista, descarga] = await Promise.all([
        almacen.resolverLecturaAutorizada(documento.claveAlmacenamiento, 600, { enLinea: true }),
        almacen.resolverLecturaAutorizada(documento.claveAlmacenamiento, 600),
      ])
      return { titulo: documento.titulo, tipoContenido: documento.tipoContenido, vista, descarga }
    },
  )
}

/**
 * Baja del documento (`RF-19`, `RN-22`): solo el administrador, y no el acta
 * firmada de una asamblea. Archiva: el objeto y los fragmentos se conservan, y
 * el documento sale de la lista, de la consulta y de los trabajos de cola.
 */
export async function eliminarDocumento(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; documentoId: string },
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'eliminar documentos',
    },
    async () => {
      const documento = await prisma.documentoConsorcio.findFirst({
        where: { id: datos.documentoId, archivadoEn: null },
        select: { id: true },
      })
      if (!documento) throw new NoEncontrado()
      if (await prisma.actaAsamblea.findFirst({ where: { documentoId: documento.id } })) {
        throw new DocumentoDeActa()
      }
      await prisma.documentoConsorcio.update({
        where: { id: documento.id },
        data: { archivadoEn: reloj.ahora() },
      })
    },
  )
}

/** Devuelve un documento archivado a la lista; si ya estaba indexado sus fragmentos siguen ahí y no se reindexa; si no, se reencola. */
export async function restaurarDocumento(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; documentoId: string },
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'restaurar documentos',
    },
    async () => {
      await prisma.$transaction(async (tx) => {
        const documento = await tx.documentoConsorcio.findFirst({
          where: { id: datos.documentoId, archivadoEn: { not: null } },
          select: { id: true, estadoIndexacion: true },
        })
        if (!documento) throw new NoEncontrado()
        // Archivado a medio indexar, el trabajo salió sin hacer nada: se encola de nuevo.
        const falta = documento.estadoIndexacion !== 'indexado'
        await tx.documentoConsorcio.update({
          where: { id: documento.id },
          data: falta
            ? { archivadoEn: null, estadoIndexacion: 'pendiente', errorIndexacion: null }
            : { archivadoEn: null },
        })
        if (falta) await encolarIndexacion(tx, documento.id)
      })
    },
  )
}

export async function listarDocumentosArchivados(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<{ id: string; titulo: string; tipo: string; archivadoEn: string }[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'ver documentos archivados',
    },
    async () => {
      const archivados = await prisma.documentoConsorcio.findMany({
        where: { archivadoEn: { not: null } },
        orderBy: { archivadoEn: 'desc' },
        select: { id: true, titulo: true, tipo: true, archivadoEn: true },
      })
      return archivados.map((d) => ({ ...d, archivadoEn: d.archivadoEn!.toISOString() }))
    },
  )
}
