'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { refrescarVistas } from '@/aplicacion/indicadores/indicadores'

/** El boton «actualizar ahora» del panel (`FR-018`). */
export async function accionRefrescar(datos: FormData): Promise<void> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcioId = String(datos.get('consorcio') ?? '')
  try {
    await refrescarVistas(HABILITACIONES, RELOJ, { usuarioId, consorcioId })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    redirect(
      `/indicadores?consorcio=${consorcioId}&error=${encodeURIComponent(error.mensajeParaUsuario)}`,
    )
  }
  revalidatePath('/indicadores')
  redirect(`/indicadores?consorcio=${consorcioId}&actualizado=1`)
}
