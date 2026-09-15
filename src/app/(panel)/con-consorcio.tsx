import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { Siren, TriangleAlert } from 'lucide-react'
import type { ReactElement } from 'react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

export type ConsorcioAlcanzable = { id: string; nombre: string; direccion: string }

/**
 * Los consorcios al alcance, una sola vez por pedido: el armazon de
 * `consorcios/[consorcio]` y la pagina los piden los dos, y React los deduplica.
 */
export const consorciosAlAlcance = cache(
  (usuarioId: string): Promise<ConsorcioAlcanzable[]> =>
    misConsorcios(HABILITACIONES, RELOJ, usuarioId),
)

/**
 * Lo que toda pantalla dentro de `/consorcios/[consorcio]` hace antes de
 * dibujar: sesion y consorcio de la ruta validado contra el alcance. Devuelve
 * `salida` cuando hay que dibujar otra cosa. Solo presentacion: cada caso de
 * uso vuelve a autorizar contra la base (FR-002); esto decide que se dibuja.
 */
export async function conConsorcio(
  consorcioId: string,
  titulo: string,
): Promise<{ salida: ReactElement } | { usuarioId: string; activo: ConsorcioAlcanzable }> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const activo = (await consorciosAlAlcance(usuarioId)).find((c) => c.id === consorcioId)
  if (!activo) {
    return {
      salida: (
        <>
          <h1>{titulo}</h1>
          <AvisoFueraDeAlcance />
        </>
      ),
    }
  }

  return { usuarioId, activo }
}

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

/**
 * El segmento `[id]` de la ruta, o 404. Con cualquier otra cosa el ORM no
 * devuelve «no encontrado»: tira un error de tipo antes de consultar, y la
 * pantalla se cae con una traza (RNF-10). Se filtra una vez, aca.
 */
export function idONoEncontrado(id: string): string {
  if (!UUID.test(id)) notFound()
  return id
}

/** RNF-10: la direccion pedia un consorcio que no esta al alcance; no se dibuja otro. */
export function AvisoFueraDeAlcance() {
  return (
    <p className="aviso aviso--atencion" role="status">
      <TriangleAlert className="icono" aria-hidden="true" />
      <span>Ese consorcio no está al alcance, por eso no se muestra ningún dato.</span>
    </p>
  )
}

/** El error de aplicacion, dicho con sus palabras (RNF-10); cualquier otro se propaga. */
export function AvisoDeError({ error }: { error: unknown }) {
  if (!(error instanceof ErrorDeAplicacion)) throw error
  return (
    <p className="aviso aviso--problema" role="alert">
      <Siren className="icono" aria-hidden="true" />
      <span>{error.mensajeParaUsuario}</span>
    </p>
  )
}
