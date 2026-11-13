'use server'

import { redirect } from 'next/navigation'
import { after } from 'next/server'

import { MINIMO_DE_CONTRASENA } from '@/compartido/contrasenas'
import { destinoSeguro } from '@/compartido/destinos'
import { ErrorDeAplicacion } from '@/compartido/errores'
import { conHecho } from '@/app/aviso-en-url'
import { valoresDe, type ConValores } from '@/app/valores-de-formulario'
import { urlBase } from '@/app/url-base'
import { DERIVADOR, RELOJ } from '@/aplicacion/dependencias'
import { fijarContrasena } from '@/aplicacion/identidad/invitar-persona'
import { pedirRestablecimiento } from '@/aplicacion/identidad/restablecer'
import { errorDeCorreo } from '@/aplicacion/identidad/correo-reglas'
import { drenar } from '@/aplicacion/pendientes/drenar'
import { MANEJADORES } from '@/aplicacion/pendientes/manejadores'
import { ingresar } from '@/aplicacion/identidad/sesion'

/**
 * Lo que el formulario muestra debajo del campo; vacio es «todo bien». Un
 * archivo «use server» solo puede exportar funciones asincronicas, asi que el
 * estado inicial lo pone cada formulario.
 */
export type Resultado = { mensaje: string; enviado?: boolean } & ConValores

export async function accionIngresar(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const correo = String(datos.get('correo') ?? '')
  const contrasena = String(datos.get('contrasena') ?? '')
  const valores = valoresDe(datos, ['contrasena'])

  // Falta o formato se dicen antes de tocar la base: no dependen de ninguna cuenta.
  // «No coincide» (FR-001c) sigue siendo un solo mensaje exista o no el correo.
  const errorCorreo = errorDeCorreo(correo)
  if (errorCorreo) return { mensaje: errorCorreo, valores }
  if (contrasena === '') return { mensaje: 'Escribí tu contraseña.', valores }

  const mensaje = await ingresar({
    correo,
    contrasena,
    // Se vuelve a validar: el campo oculto lo puede escribir cualquiera.
    destino: destinoSeguro(datos.get('destino'), '/'),
  })

  return { mensaje, valores }
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

  const base = await urlBase()

  // Se responde antes de trabajar: si la cuenta existe el trabajo cuesta mas
  // viajes a la base, y esa diferencia de tiempo delataria cual correo tiene cuenta.
  // El despacho va en el mismo `after()`: quien pide no tiene sesion y ningun
  // panel abierto que drene la cola, y el enlace vence a las 2 horas.
  after(async () => {
    try {
      await pedirRestablecimiento(RELOJ, { correo, urlBase: base })
      await drenar(MANEJADORES)
    } catch (fallo) {
      // Ni un fallo interno debe distinguir una cuenta de otra: no se le muestra a nadie.
      console.error('No se pudo procesar el pedido de enlace para cambiar la clave.', fallo)
    }
  })

  return { mensaje: '', enviado: true }
}
