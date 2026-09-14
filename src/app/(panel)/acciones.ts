'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { signOut, usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import {
  NOMBRE_GALLETA_CONSORCIO,
  OPCIONES_GALLETA_CONSORCIO,
  destinoEnOtroConsorcio,
} from './consorcio-activo'

/** Cierra la sesion y vuelve a la pantalla de ingreso. */
export async function salir() {
  await signOut({ redirectTo: '/ingresar' })
}

/**
 * Salta a otro consorcio conservando la seccion: si se venia de
 * `/consorcios/A/gastos?periodo=x` va a `/consorcios/B/gastos?periodo=x`; si se
 * venia de fuera de un consorcio, al resumen de B. Valida el id contra
 * `misConsorcios` (si no es alcanzable, no va a ningun lado) y lo recuerda en
 * la galleta para la proxima entrada. Solo presentacion (FR-002).
 */
export async function elegirConsorcio(datos: FormData): Promise<never> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const elegido = String(datos.get('consorcio') ?? '')
  const alcanzables = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)
  if (!alcanzables.some((consorcio) => consorcio.id === elegido)) redirect('/consorcios')

  const galletas = await cookies()
  galletas.set(NOMBRE_GALLETA_CONSORCIO, elegido, OPCIONES_GALLETA_CONSORCIO)

  redirect(destinoEnOtroConsorcio(await origenDeLaAccion(), elegido))
}

/**
 * La ruta y busqueda de la pagina que origino el cambio, tomadas del
 * remitente. Nunca el origen: no hay redireccion abierta.
 */
async function origenDeLaAccion(): Promise<string> {
  const remitente = (await headers()).get('referer')
  if (!remitente) return ''
  try {
    const url = new URL(remitente)
    return url.pathname + url.search
  } catch {
    return ''
  }
}
