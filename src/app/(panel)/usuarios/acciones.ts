'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { invitarPersona } from '@/aplicacion/identidad/invitar-persona'
import { reenviarInvitacion } from '@/aplicacion/identidad/reenviar-invitacion'
import { rolDesdeFormulario } from '@/aplicacion/identidad/roles'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

/** Un archivo «use server» solo exporta funciones: el estado inicial va en el formulario. */
export type Resultado = { mensaje: string }

/** La identidad de quien opera sale de la sesion, nunca del formulario. */
async function quienOpera(): Promise<string> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')
  return usuarioId
}

export async function accionInvitar(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const invitadorId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')

  // El nombre del consorcio se busca; no se acepta del formulario, porque viaja
  // en el cuerpo del correo que la invitacion manda.
  const consorcio = (await misConsorcios(HABILITACIONES, RELOJ, invitadorId)).find(
    (candidato) => candidato.id === consorcioId,
  )

  if (!consorcio) return { mensaje: new NoEncontrado().mensajeParaUsuario }

  const desde = String(datos.get('vigenciaDesde') ?? '')

  try {
    await invitarPersona(HABILITACIONES, RELOJ, {
      invitadorId,
      nombre: String(datos.get('nombre') ?? '').trim(),
      apellido: String(datos.get('apellido') ?? '').trim(),
      correo: String(datos.get('correo') ?? ''),
      rol: rolDesdeFormulario(datos.get('rol')),
      consorcioId: consorcio.id,
      consorcioNombre: consorcio.nombre,
      vigenciaDesde: desde ? new Date(`${desde}T00:00:00Z`) : RELOJ.hoy(),
      urlBase: await urlBase(),
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  redirect(`/usuarios?consorcio=${consorcio.id}&invitado=1`)
}

/**
 * Reenvio de la invitacion (FR-006b). Vuelve a la lista con el resultado a la
 * vista: el administrador tiene que poder ver si esta vez salio.
 */
export async function accionReenviar(datos: FormData): Promise<void> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')

  try {
    await reenviarInvitacion(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      trabajoId: String(datos.get('trabajo') ?? ''),
    })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    redirect(`/usuarios?consorcio=${consorcioId}&problema=1`)
  }

  redirect(`/usuarios?consorcio=${consorcioId}&reenviado=1`)
}

/** Base del enlace de invitacion, tomada del pedido que la origina. */
async function urlBase(): Promise<string> {
  const cabeceras = await headers()
  const protocolo = cabeceras.get('x-forwarded-proto') ?? 'http'
  return `${protocolo}://${cabeceras.get('host') ?? 'localhost:3000'}`
}
