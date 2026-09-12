import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Building2, Siren } from 'lucide-react'
import type { ReactElement } from 'react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import {
  NOMBRE_GALLETA_CONSORCIO,
  resolverConsorcioActivo,
  type ParametrosDeConsorcio,
} from './consorcio-activo'
import { AvisoConsorcioNoElegido } from './selector-consorcio'

/**
 * Lo que toda pantalla del panel hace antes de dibujar: sesion, consorcios al
 * alcance y consorcio activo. Devuelve `salida` cuando hay que dibujar otra
 * cosa (sin sesion redirige; sin consorcio, el aviso). Solo presentacion.
 */
export async function conConsorcio(
  parametros: ParametrosDeConsorcio,
  base: string,
  titulo: string,
): Promise<
  { salida: ReactElement } | { usuarioId: string; activo: { id: string; nombre: string } }
> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)
  if (consorcios.length === 0) {
    return {
      salida: (
        <>
          <h1>{titulo}</h1>
          <div className="vacio">
            <Building2 aria-hidden="true" />
            <p>Todavía no hay ningún consorcio al alcance.</p>
          </div>
        </>
      ),
    }
  }

  const galletas = await cookies()
  const { activo, pedidoDesconocido } = resolverConsorcioActivo(
    parametros,
    consorcios,
    galletas.get(NOMBRE_GALLETA_CONSORCIO)?.value,
  )
  if (!activo) {
    return {
      salida: (
        <>
          <h1>{titulo}</h1>
          <AvisoConsorcioNoElegido
            consorcios={consorcios}
            base={base}
            parametros={parametros}
            pedidoDesconocido={pedidoDesconocido}
          />
        </>
      ),
    }
  }

  return { usuarioId, activo }
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
