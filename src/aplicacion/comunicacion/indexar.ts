import { createHash } from 'node:crypto'

import { z } from 'zod'

import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type { GeneradorVectores } from '@/dominio/contratos/asistencia'
import { fragmentar, type PaginaDeTexto } from '@/dominio/documentos/fragmentar'
import type { Manejador } from '@/aplicacion/pendientes/drenar'
import { prismaBase } from '@/infraestructura/prisma'
import { guardarFragmentos } from '@/infraestructura/repositorios/fragmentos'

/**
 * Indexacion diferida de un documento (`FR-030`, research R-05): baja el
 * objeto, calcula la huella, extrae el texto, fragmenta, vectoriza y guarda.
 * `pendiente → procesando → indexado | error`, con el motivo legible. Si el
 * generador de vectores no esta, el documento queda en `error` y se reintenta
 * desde la cola; el texto no se pierde porque no depende del proveedor.
 *
 * Corre en la cola, fuera de todo contexto de aislamiento: va por `prismaBase`.
 */
const CARGA = z.object({ documentoId: z.string().uuid() })

export function manejadorIndexacion(
  almacen: AlmacenObjetos,
  vectores: GeneradorVectores,
  extraerTexto: (bytes: Uint8Array, tipoContenido: string) => Promise<PaginaDeTexto[]>,
  bajar: (direccion: string) => Promise<Uint8Array> = bajarDe,
): Manejador {
  return async (carga) => {
    const { documentoId } = CARGA.parse(carga)
    const documento = await prismaBase.documentoConsorcio.findUnique({ where: { id: documentoId } })
    if (!documento) return

    await prismaBase.documentoConsorcio.update({
      where: { id: documentoId },
      data: { estadoIndexacion: 'procesando', errorIndexacion: null },
    })

    const fallar = async (motivo: string) => {
      await prismaBase.documentoConsorcio.update({
        where: { id: documentoId },
        data: { estadoIndexacion: 'error', errorIndexacion: motivo },
      })
      // Lanzar deja el trabajo en la cola con reintento; el motivo ya quedo escrito.
      throw new Error(motivo)
    }

    let bytes: Uint8Array
    try {
      const direccion = await almacen.resolverLecturaAutorizada(documento.claveAlmacenamiento, 300)
      bytes = await bajar(direccion)
    } catch {
      return fallar('No se pudo leer el archivo del almacenamiento.')
    }

    const hash = createHash('sha256').update(bytes).digest('hex')
    let paginas: PaginaDeTexto[]
    try {
      paginas = await extraerTexto(bytes, documento.tipoContenido)
    } catch (error) {
      return fallar(error instanceof Error ? error.message : 'No se pudo extraer el texto.')
    }

    const fragmentos = fragmentar(paginas)
    if (fragmentos.length === 0) return fallar('El documento no tiene texto que indexar.')

    const resultado = await vectores.vectorizar(
      fragmentos.map((f) => f.contenido),
      'documento',
    )
    if (!resultado.disponible) return fallar(resultado.motivo)

    await guardarFragmentos(documentoId, fragmentos, resultado.valor)
    await prismaBase.documentoConsorcio.update({
      where: { id: documentoId },
      data: { estadoIndexacion: 'indexado', hashSha256: hash, errorIndexacion: null },
    })
  }
}

async function bajarDe(direccion: string): Promise<Uint8Array> {
  const respuesta = await fetch(direccion)
  if (!respuesta.ok) throw new Error(`descarga ${respuesta.status}`)
  return new Uint8Array(await respuesta.arrayBuffer())
}
