'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { medioDesdeFormulario, registrarPago } from '@/aplicacion/pagos/registrar'

export type Resultado = { mensaje: string }

/**
 * Alta de un pago (`CU-04`). El importe viaja **como cadena** al caso de uso, y
 * el caso de uso decide si es valido: aca no se convierte a numero jamas.
 */
export async function accionRegistrarPago(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcioId = String(datos.get('consorcio') ?? '')

  try {
    await registrarPago(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      unidadId: String(datos.get('unidad') ?? ''),
      importe: String(datos.get('importe') ?? '').trim(),
      fechaPago: new Date(`${String(datos.get('fecha') ?? '')}T00:00:00Z`),
      medio: medioDesdeFormulario(datos.get('medio')),
      referencia: String(datos.get('referencia') ?? '').trim() || null,
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  revalidatePath('/pagos')
  redirect(`/pagos?consorcio=${consorcioId}&registrado=1`)
}
