'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { reintentarDocumentos } from '@/aplicacion/liquidacion/documentos'

/** Revive los documentos agotados; el sondeo de la pantalla los vuelve a despachar. */
export async function accionReintentarDocumentos(datos: FormData): Promise<void> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')
  const consorcioId = String(datos.get('consorcio') ?? '')
  const liquidacionId = String(datos.get('liquidacion') ?? '')
  const vuelta = `/consorcios/${consorcioId}/liquidaciones/${liquidacionId}`
  try {
    await reintentarDocumentos(HABILITACIONES, RELOJ, { usuarioId, consorcioId, liquidacionId })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    redirect(`${vuelta}?error=${encodeURIComponent(error.mensajeParaUsuario)}`)
  }
  revalidatePath('/consorcios/[consorcio]/liquidaciones/[id]', 'page')
  redirect(vuelta)
}
