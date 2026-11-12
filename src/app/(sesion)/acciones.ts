'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { MINIMO_DE_CONTRASENA } from '@/compartido/contrasenas'
import { destinoSeguro } from '@/compartido/destinos'
import { ErrorDeAplicacion } from '@/compartido/errores'
import { conHecho } from '@/app/aviso-en-url'
import { DERIVADOR, RELOJ } from '@/aplicacion/dependencias'
import { fijarContrasena } from '@/aplicacion/identidad/invitar-persona'
import { pedirRestablecimiento } from '@/aplicacion/identidad/restablecer'
import { errorDeCorreo } from '@/aplicacion/identidad/correo-reglas'
import { ingresar } from '@/aplicacion/identidad/sesion'

/**
 * Lo que el formulario muestra debajo del campo; vacio es «todo bien». Un
 * archivo «use server» solo puede exportar funciones asincronicas, asi que el
 * estado inicial lo pone cada formulario.
 */
export type Resultado = { mensaje: string; enviado?: boolean }

export async function accionIngresar(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const mensaje = await ingresar({
    correo: String(datos.get('correo') ?? ''),
    contrasena: String(datos.get('contrasena') ?? ''),
    // Se vuelve a validar: el campo oculto lo puede escribir cualquiera.
    destino: destinoSeguro(datos.get('destino'), '/'),
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

  redirect(conHecho('/ingresar', 'contrasena-guardada'))
}

/**
 * Pedido propio del enlace para cambiar la clave. La respuesta es la misma
 * exista o no la cuenta: lo unico que se dice distinto es un correo mal escrito,
 * que no depende de ninguna cuenta.
 */
export async function accionPedirEnlace(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const correo = String(datos.get('correo') ?? '')
  const error = errorDeCorreo(correo)
  if (error) return { mensaje: error }

  const cabeceras = await headers()
  const protocolo = cabeceras.get('x-forwarded-proto') ?? 'http'

  try {
    await pedirRestablecimiento(RELOJ, {
      correo,
      urlBase: `${protocolo}://${cabeceras.get('host') ?? 'localhost:3000'}`,
    })
  } catch {
    // Ni un fallo interno debe distinguir una cuenta de otra.
  }

  return { mensaje: '', enviado: true }
}
