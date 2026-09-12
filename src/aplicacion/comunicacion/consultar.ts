import { ErrorDeAplicacion } from '@/compartido/errores'
import type { GeneradorRespuesta, GeneradorVectores } from '@/dominio/contratos/asistencia'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'
import { buscarFragmentos } from '@/infraestructura/repositorios/fragmentos'

/**
 * Consulta sobre la documentacion (`RF-20`, `CU-10`, `FR-028`, `FR-029`,
 * research R-06). El orden importa y no se negocia:
 *
 * 1. vectorizar la pregunta; sin servicio → degradacion: los documentos para abrir;
 * 2. recuperar con el rol: el filtro por consorcio y visibilidad va en el
 *    `WHERE`, antes de ordenar (SC-016);
 * 3. responder solo con esos fragmentos;
 * 4. persistir la consulta con `sin_respaldo` cuando no hay fragmentos, no hay
 *    citas o el servicio no respondio (SC-014, SC-015). Sin fuente no hay
 *    respuesta (Principio IV).
 */

export interface Cita {
  fragmentoId: string
  documentoId: string
  documento: string
  pagina: number | null
  numero: number
}

export type ResultadoDeConsulta =
  | { modo: 'respuesta'; consultaId: string; respuesta: string; citas: Cita[] }
  | { modo: 'sin_respaldo'; consultaId: string }
  | { modo: 'degradado'; motivo: string; documentos: { id: string; titulo: string }[] }

export class PreguntaVacia extends ErrorDeAplicacion {
  constructor() {
    super('Escribí una pregunta.', 'RF-20')
  }
}

export async function consultarDocumentacion(
  asistencia: { vectores: GeneradorVectores; respuestas: GeneradorRespuesta },
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; pregunta: string },
): Promise<ResultadoDeConsulta> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      accion: 'consultar la documentación',
    },
    async (acceso) => {
      const pregunta = datos.pregunta.trim()
      if (pregunta.length < 3) throw new PreguntaVacia()
      const soloVisibles = !acceso.roles.some((r) => r === 'administrador' || r === 'consejo')

      const degradado = async (motivo: string): Promise<ResultadoDeConsulta> => ({
        modo: 'degradado',
        motivo,
        documentos: await prisma.documentoConsorcio.findMany({
          where: soloVisibles ? { visibleConsorcistas: true } : {},
          select: { id: true, titulo: true },
          orderBy: { titulo: 'asc' },
        }),
      })

      const vector = await asistencia.vectores.vectorizar([pregunta], 'consulta')
      if (!vector.disponible) return degradado(vector.motivo)

      const fragmentos = await buscarFragmentos(vector.valor[0], {
        soloVisibles,
        pisoDeSimilitud: asistencia.vectores.pisoDeSimilitud,
      })

      const persistir = (respuesta: string | null, citas: Cita[]) =>
        prisma.consultaDocumental.create({
          data: sinConsorcio({
            usuarioId: datos.usuarioId,
            pregunta,
            respuesta,
            fragmentosCitados: citas.map((c) => ({
              fragmento_id: c.fragmentoId,
              documento_id: c.documentoId,
              titulo: c.documento,
              pagina: c.pagina,
            })),
            sinRespaldo: respuesta === null,
          }),
          select: { id: true },
        })

      if (fragmentos.length === 0) {
        const { id } = await persistir(null, [])
        return { modo: 'sin_respaldo', consultaId: id }
      }

      const respuesta = await asistencia.respuestas.responder(
        pregunta,
        fragmentos.map((f) => ({
          numero: f.numero,
          documento: f.documento,
          pagina: f.pagina,
          contenido: f.contenido,
        })),
      )
      if (!respuesta.disponible) return degradado(respuesta.motivo)

      const citas: Cita[] = respuesta.valor.citas
        .map((numero) => fragmentos.find((f) => f.numero === numero))
        .filter((f): f is NonNullable<typeof f> => f !== undefined)
        .map((f) => ({
          fragmentoId: f.fragmentoId,
          documentoId: f.documentoId,
          documento: f.documento,
          pagina: f.pagina,
          numero: f.numero,
        }))

      if (respuesta.valor.sinRespaldo || citas.length === 0) {
        const { id } = await persistir(null, [])
        return { modo: 'sin_respaldo', consultaId: id }
      }

      const { id } = await persistir(respuesta.valor.respuesta, citas)
      return { modo: 'respuesta', consultaId: id, respuesta: respuesta.valor.respuesta, citas }
    },
  )
}

/** Valoracion del consorcista: la unica edicion posible de una consulta. */
export async function valorarConsulta(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; consultaId: string; util: boolean },
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'valorar la consulta' },
    async () => {
      await prisma.consultaDocumental.updateMany({
        where: { id: datos.consultaId, usuarioId: datos.usuarioId },
        data: { util: datos.util },
      })
    },
  )
}
