'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { anularLiquidacion } from '@/aplicacion/liquidacion/anular'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'
import { generarDocumentos } from '@/aplicacion/liquidacion/documentos'
import { MANEJADORES } from '@/aplicacion/pendientes/manejadores'

/** Un archivo «use server» solo exporta funciones asincronicas. */
export type Resultado = { mensaje: string }

/**
 * Cerrar, liquidar y anular (`003-liquidacion` US2).
 *
 * Las tres devuelven el mensaje del caso de uso tal cual: el aborto por
 * coeficientes tiene que llegar con la diferencia exacta a la pantalla, no
 * convertido en «hubo un error» (RNF-10, SC-004).
 */
export async function accionCerrarPeriodo(_previo: Resultado, datos: FormData): Promise<Resultado> {
  return conSesion(datos, 'periodo-cerrado', (usuarioId, consorcioId) =>
    cerrarPeriodo(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      periodoId: String(datos.get('periodo') ?? ''),
    }),
  )
}

export async function accionLiquidarPeriodo(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  return conSesion(datos, 'liquidado', (usuarioId, consorcioId) =>
    liquidarPeriodo(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      periodoId: String(datos.get('periodo') ?? ''),
      totalRevisado: String(datos.get('totalRevisado') ?? ''),
    }),
  )
}

export async function accionAnularLiquidacion(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  return conSesion(datos, 'anulado', (usuarioId, consorcioId) =>
    anularLiquidacion(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      liquidacionId: String(datos.get('liquidacion') ?? ''),
    }),
  )
}

export async function accionGenerarDocumentos(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  try {
    const progreso = await generarDocumentos(
      MANEJADORES.documento_expensa!,
      HABILITACIONES,
      RELOJ,
      {
        usuarioId,
        consorcioId: String(datos.get('consorcio') ?? ''),
        liquidacionId: String(datos.get('liquidacion') ?? ''),
      },
    )
    revalidatePath('/consorcios/[consorcio]/liquidaciones', 'page')
    return {
      mensaje:
        progreso.generados === progreso.total
          ? ''
          : `${progreso.generados} de ${progreso.total} documentos. Volver a pulsar para seguir.`,
    }
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }
}

/**
 * Con exito vuelve a la lista con `?hecho=`, que la pila de avisos saca como
 * toast: la fila que disparo la accion cambia de botones al re-dibujarse, asi
 * que un mensaje en la fila no sobreviviria.
 */
async function conSesion(
  datos: FormData,
  hecho: 'periodo-cerrado' | 'liquidado' | 'anulado',
  trabajo: (usuarioId: string, consorcioId: string) => Promise<unknown>,
): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')
  const consorcioId = String(datos.get('consorcio') ?? '')

  try {
    await trabajo(usuarioId, consorcioId)
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  revalidatePath('/consorcios/[consorcio]/periodos', 'page')
  revalidatePath('/consorcios/[consorcio]/periodos/[id]', 'page')
  redirect(`/consorcios/${consorcioId}/periodos?hecho=${hecho}`)
}
