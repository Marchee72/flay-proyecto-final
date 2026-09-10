'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { altaProveedor } from '@/aplicacion/proveedores/proveedores'

/** Un archivo «use server» solo exporta funciones asincronicas. */
export type Resultado = { mensaje: string }

export async function accionAltaProveedor(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  try {
    await altaProveedor(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: String(datos.get('consorcio') ?? ''),
      razonSocial: String(datos.get('razonSocial') ?? ''),
      cuit: String(datos.get('cuit') ?? ''),
      rubroHabitualId: String(datos.get('rubro') ?? '') || null,
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  revalidatePath('/proveedores')
  return { mensaje: '' }
}
