'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { abrirPeriodo } from '@/aplicacion/periodos/periodos'
import { anularLiquidacion } from '@/aplicacion/liquidacion/anular'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'

/** Un archivo «use server» solo exporta funciones asincronicas. */
export type Resultado = { mensaje: string }

export async function accionAbrirPeriodo(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  try {
    await abrirPeriodo(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: String(datos.get('consorcio') ?? ''),
      anio: Number(datos.get('anio') ?? 0),
      mes: Number(datos.get('mes') ?? 0),
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  revalidatePath('/periodos')
  return { mensaje: '' }
}

/**
 * Cerrar, liquidar y anular (`003-liquidacion` US2).
 *
 * Las tres devuelven el mensaje del caso de uso tal cual: el aborto por
 * coeficientes tiene que llegar con la diferencia exacta a la pantalla, no
 * convertido en «hubo un error» (RNF-10, SC-004).
 */
export async function accionCerrarPeriodo(_previo: Resultado, datos: FormData): Promise<Resultado> {
  return conSesion(datos, (usuarioId, consorcioId) =>
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
  return conSesion(datos, (usuarioId, consorcioId) =>
    liquidarPeriodo(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      periodoId: String(datos.get('periodo') ?? ''),
    }),
  )
}

export async function accionAnularLiquidacion(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  return conSesion(datos, (usuarioId, consorcioId) =>
    anularLiquidacion(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      liquidacionId: String(datos.get('liquidacion') ?? ''),
    }),
  )
}

async function conSesion(
  datos: FormData,
  trabajo: (usuarioId: string, consorcioId: string) => Promise<unknown>,
): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  try {
    await trabajo(usuarioId, String(datos.get('consorcio') ?? ''))
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  revalidatePath('/periodos')
  return { mensaje: '' }
}
