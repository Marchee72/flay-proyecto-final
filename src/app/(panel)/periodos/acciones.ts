'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { abrirPeriodo } from '@/aplicacion/periodos/periodos'

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
