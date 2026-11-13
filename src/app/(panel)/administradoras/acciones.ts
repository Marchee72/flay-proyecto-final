'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { conHecho } from '@/app/aviso-en-url'
import { valoresDe, type ConValores } from '@/app/valores-de-formulario'
import { altaAdministradora } from '@/aplicacion/administradoras/alta-administradora'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { irAIngresar } from '@/app/ir-a-ingresar'

/** Un archivo «use server» solo exporta funciones asincronicas. */
export type Resultado = { mensaje: string } & ConValores

export async function accionAltaAdministradora(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()

  try {
    await altaAdministradora(HABILITACIONES, RELOJ, {
      usuarioId,
      razonSocial: String(datos.get('razonSocial') ?? '').trim(),
      cuit: String(datos.get('cuit') ?? '').trim(),
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion)
      return { mensaje: error.mensajeParaUsuario, valores: valoresDe(datos) }
    throw error
  }

  revalidatePath('/administradoras')
  redirect(conHecho('/administradoras', 'administradora-creada'))
}
