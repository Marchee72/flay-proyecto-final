'use server'

import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { altaConsorcio } from '@/aplicacion/consorcios/alta-consorcio'
import { tipoDeUnidadDesdeFormulario } from '@/aplicacion/consorcios/tipos-de-unidad'
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
 * Alta de consorcio con padron en el mismo envio (asistente «Nuevo consorcio»
 * en modal). Llama al mismo caso de uso `altaConsorcio` con las unidades: la
 * transaccion es la misma que cuando el alta trae unidades (FR-011c) y los
 * rechazos —CUIT repetido, suma que no cierra— llegan con el mismo mensaje
 * RNF-10. Solo presentacion: arma las listas paralelas del formulario.
 */
export async function accionAltaConsorcioConPadron(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await quienOpera()
  let creado = ''

  const designaciones = datos.getAll('designacion').map(String)
  const coeficientes = datos.getAll('coeficiente').map(String)
  const tipos = datos.getAll('tipo').map(String)

  try {
    const unidades = designaciones
      .map((designacion, i) => ({
        designacion: designacion.trim(),
        coeficiente: String(coeficientes[i] ?? '').trim(),
        tipo: tipoDeUnidadDesdeFormulario(tipos[i]),
      }))
      .filter((unidad) => unidad.designacion !== '')

    if (unidades.length === 0) {
      return {
        mensaje:
          'El padrón quedó vacío. Cargá al menos una unidad con su coeficiente: sin padrón no se puede liquidar.',
      }
    }

    const { consorcioId } = await altaConsorcio(HABILITACIONES, RELOJ, {
      usuarioId,
      administradoraId: String(datos.get('administradora') ?? ''),
      nombre: String(datos.get('nombre') ?? '').trim(),
      direccion: String(datos.get('direccion') ?? '').trim(),
      localidad: String(datos.get('localidad') ?? '').trim(),
      cuit: String(datos.get('cuit') ?? '').trim(),
      unidades,
    })
    creado = consorcioId
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  redirect(`/consorcios/${creado}`)
}

/**
 * Carga del padron entero. Las unidades llegan como listas paralelas de
 * designacion, tipo y coeficiente, en el orden en que se cargaron.
 */
export async function accionCargarPadron(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')

  const designaciones = datos.getAll('designacion').map(String)
  const coeficientes = datos.getAll('coeficiente').map(String)
  const tipos = datos.getAll('tipo').map(String)

  try {
    const unidades = designaciones
      .map((designacion, i) => ({
        designacion: designacion.trim(),
        coeficiente: coeficientes[i],
        tipo: tipoDeUnidadDesdeFormulario(tipos[i]),
      }))
      .filter((unidad) => unidad.designacion !== '')

    if (unidades.length === 0) return { mensaje: 'Cargá al menos una unidad.' }

    await cargarPadron(HABILITACIONES, RELOJ, { usuarioId, consorcioId, unidades })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  redirect(`/consorcios/${consorcioId}`)
}
