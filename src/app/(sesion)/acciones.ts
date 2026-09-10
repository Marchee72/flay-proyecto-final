'use server'

import { redirect } from 'next/navigation'

import { MINIMO_DE_CONTRASENA } from '@/compartido/contrasenas'
import { ErrorDeAplicacion } from '@/compartido/errores'
import { DERIVADOR, RELOJ } from '@/aplicacion/dependencias'
import { fijarContrasena } from '@/aplicacion/identidad/invitar-persona'
import { ingresar } from '@/aplicacion/identidad/sesion'

/**
 * Lo que el formulario muestra debajo del campo; vacio es «todo bien». Un
 * archivo «use server» solo puede exportar funciones asincronicas, asi que el
 * estado inicial lo pone cada formulario.
 */
export type Resultado = { mensaje: string }

export async function accionIngresar(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const mensaje = await ingresar({
    correo: String(datos.get('correo') ?? ''),
    contrasena: String(datos.get('contrasena') ?? ''),
    destino: '/usuarios',
  })

  return { mensaje }
}

export async function accionFijarContrasena(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const contrasena = String(datos.get('contrasena') ?? '')

  if (contrasena.length < MINIMO_DE_CONTRASENA) {
    return { mensaje: `La contraseña necesita al menos ${MINIMO_DE_CONTRASENA} caracteres.` }
  }

  if (contrasena !== String(datos.get('repeticion') ?? '')) {
    return { mensaje: 'Las dos contraseñas no coinciden.' }
  }

  try {
    await fijarContrasena(DERIVADOR, RELOJ, {
      credencial: String(datos.get('credencial') ?? ''),
      contrasena,
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  redirect('/ingresar?listo=1')
}
