'use server'

import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { altaConsorcio } from '@/aplicacion/consorcios/alta-consorcio'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

/** Un archivo «use server» solo exporta funciones asincronicas. */
export type Resultado = { mensaje: string }

async function quienOpera(): Promise<string> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')
  return usuarioId
}

export async function accionAltaConsorcio(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await quienOpera()
  let creado = ''

  try {
    const { consorcioId } = await altaConsorcio(HABILITACIONES, RELOJ, {
      usuarioId,
      administradoraId: String(datos.get('administradora') ?? ''),
      nombre: String(datos.get('nombre') ?? '').trim(),
      direccion: String(datos.get('direccion') ?? '').trim(),
      localidad: String(datos.get('localidad') ?? '').trim(),
      cuit: String(datos.get('cuit') ?? '').trim(),
    })
    creado = consorcioId
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  redirect(`/consorcios/${creado}/unidades`)
}

/**
 * Carga del padron entero. Las unidades llegan como pares paralelos de
 * designacion y coeficiente, en el orden en que se cargaron.
 */
export async function accionCargarPadron(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')

  const designaciones = datos.getAll('designacion').map(String)
  const coeficientes = datos.getAll('coeficiente').map(String)

  const unidades = designaciones
    .map((designacion, i) => ({ designacion: designacion.trim(), coeficiente: coeficientes[i] }))
    .filter((unidad) => unidad.designacion !== '')

  if (unidades.length === 0) return { mensaje: 'Cargá al menos una unidad.' }

  try {
    await cargarPadron(HABILITACIONES, RELOJ, { usuarioId, consorcioId, unidades })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  redirect(`/consorcios/${consorcioId}`)
}
