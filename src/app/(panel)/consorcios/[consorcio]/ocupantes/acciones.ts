'use server'

import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { asignarInquilino, terminarAlquiler } from '@/aplicacion/consorcios/inquilinos'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { conHecho } from '@/app/aviso-en-url'
import { irAIngresar } from '@/app/ir-a-ingresar'
import { urlBase } from '@/app/url-base'
import { valoresDe, type ConValores } from '@/app/valores-de-formulario'

export type Resultado = { mensaje: string } & ConValores

async function quienOpera(): Promise<string> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()
  return usuarioId
}

/** Solo dos rutas de retorno validas; cualquier otro valor cae en `mis-unidades`. */
function destinoDe(valor: FormDataEntryValue | null): 'unidades' | 'mis-unidades' {
  return valor === 'unidades' ? 'unidades' : 'mis-unidades'
}

export async function accionAsignarInquilino(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')
  const unidadId = String(datos.get('unidad') ?? '')
  const volver = destinoDe(datos.get('volver'))
  const desdeTexto = String(datos.get('desde') ?? '').trim()
  const hastaTexto = String(datos.get('hasta') ?? '').trim()

  try {
    await asignarInquilino(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      unidadId,
      nombre: String(datos.get('nombre') ?? '').trim(),
      apellido: String(datos.get('apellido') ?? '').trim(),
      correo: String(datos.get('correo') ?? ''),
      desde: desdeTexto ? new Date(`${desdeTexto}T00:00:00Z`) : RELOJ.hoy(),
      hasta: hastaTexto ? new Date(`${hastaTexto}T00:00:00Z`) : null,
      urlBase: await urlBase(),
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) {
      return { mensaje: error.mensajeParaUsuario, valores: valoresDe(datos) }
    }
    throw error
  }

  redirect(conHecho(`/consorcios/${consorcioId}/${volver}`, 'inquilino-asignado'))
}

export async function accionTerminarAlquiler(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')
  const ocupacionId = String(datos.get('ocupacion') ?? '')
  const volver = destinoDe(datos.get('volver'))
  const hastaTexto = String(datos.get('hasta') ?? '').trim()

  try {
    await terminarAlquiler(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      ocupacionId,
      hasta: hastaTexto ? new Date(`${hastaTexto}T00:00:00Z`) : RELOJ.hoy(),
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) {
      return { mensaje: error.mensajeParaUsuario, valores: valoresDe(datos) }
    }
    throw error
  }

  redirect(conHecho(`/consorcios/${consorcioId}/${volver}`, 'alquiler-terminado'))
}
