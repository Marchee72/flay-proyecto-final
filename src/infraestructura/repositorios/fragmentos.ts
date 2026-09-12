import { SinConsorcioActivo } from '@/compartido/errores'
import type { Fragmento } from '@/dominio/documentos/fragmentar'
import { consorcioActivo } from '@/infraestructura/cliente-aislado'
import { prismaBase } from '@/infraestructura/prisma'

/**
 * Los fragmentos y su vector (`RF-20`, `FR-029`, research R-06). Es la otra
 * consulta del sistema que no pasa por la extension de aislamiento —la
 * columna `vector` es `Unsupported` y el orden por distancia es SQL—, asi que
 * el filtro se escribe aca, **una vez**, y se exige: sin consorcio activo se
 * lanza. El `WHERE` por consorcio y visibilidad va **antes** del `ORDER BY`:
 * un fragmento ajeno nunca sale de la base (SC-016), no es que se descarta.
 */

const LIMITE = 6

export async function guardarFragmentos(
  documentoId: string,
  fragmentos: Fragmento[],
  vectores: number[][],
): Promise<void> {
  await prismaBase.$transaction(async (tx) => {
    await tx.fragmentoDocumento.deleteMany({ where: { documentoId } })
    const ids = fragmentos.map(() => crypto.randomUUID())
    await tx.fragmentoDocumento.createMany({
      data: fragmentos.map((f, i) => ({
        id: ids[i],
        documentoId,
        numeroFragmento: f.numero,
        pagina: f.pagina,
        contenido: f.contenido,
      })),
    })
    // La columna vector no la escribe Prisma: una sentencia por fila, en la
    // misma transaccion. Cientos de fragmentos, no miles: entra en el tiempo.
    for (let i = 0; i < ids.length; i++) {
      await tx.$executeRaw`
        UPDATE "FragmentoDocumento" SET vector = ${aVector(vectores[i])}::vector
        WHERE id = ${ids[i]}::uuid`
    }
  })
}

export interface FragmentoRecuperado {
  fragmentoId: string
  documentoId: string
  documento: string
  numero: number
  pagina: number | null
  contenido: string
  similitud: number
}

/**
 * La unica busqueda vectorial. `visiblesParaConsorcistas` lo decide el caso
 * de uso segun el rol: el administrador y el consejo ven todo, el consorcista
 * solo lo marcado visible.
 */
export async function buscarFragmentos(
  vectorDeLaPregunta: number[],
  opciones: { soloVisibles: boolean; pisoDeSimilitud: number },
): Promise<FragmentoRecuperado[]> {
  const activo = consorcioActivo()
  if (!activo) throw new SinConsorcioActivo()

  const filas = await prismaBase.$queryRaw<
    {
      fragmento_id: string
      documento_id: string
      documento: string
      numero: number
      pagina: number | null
      contenido: string
      similitud: number
    }[]
  >`
    SELECT f.id AS fragmento_id, d.id AS documento_id, d.titulo AS documento,
           f.numero_fragmento AS numero, f.pagina, f.contenido,
           1 - (f.vector <=> ${aVector(vectorDeLaPregunta)}::vector) AS similitud
    FROM "FragmentoDocumento" f
    JOIN "DocumentoConsorcio" d ON d.id = f.documento_id
    WHERE d.consorcio_id = ${activo}::uuid
      AND d.estado_indexacion = 'indexado'
      AND f.vector IS NOT NULL
      AND (${!opciones.soloVisibles} OR d.visible_consorcistas)
    ORDER BY f.vector <=> ${aVector(vectorDeLaPregunta)}::vector
    LIMIT ${LIMITE}`

  return filas
    .filter((f) => f.similitud >= opciones.pisoDeSimilitud)
    .map((f) => ({
      fragmentoId: f.fragmento_id,
      documentoId: f.documento_id,
      documento: f.documento,
      numero: f.numero,
      pagina: f.pagina,
      contenido: f.contenido,
      similitud: f.similitud,
    }))
}

/** pgvector recibe el vector como texto `[0.1,0.2,...]`. */
const aVector = (v: number[]): string => `[${v.join(',')}]`
