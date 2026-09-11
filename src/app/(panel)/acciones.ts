'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { signOut, usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { NOMBRE_GALLETA_CONSORCIO } from './consorcio-activo'

/** Cierra la sesion y vuelve a la pantalla de ingreso. */
export async function salir() {
  await signOut({ redirectTo: '/ingresar' })
}

/**
 * Elige el consorcio activo (guía §3.4): valida el id contra `misConsorcios`
 * (alcance del usuario; si no es alcanzable, no lo guarda), lo guarda en la
 * galleta de presentación `flay_consorcio` (`httpOnly`, `SameSite=Lax`,
 * `path=/`, solo UI) y redirige a la misma página con `?consorcio=<id>`,
 * preservando el resto de los parámetros (las direcciones compartidas quedan
 * intactas). Solo presentación: no autoriza nada (FR-002).
 */
export async function elegirConsorcio(datos: FormData): Promise<never> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const elegido = String(datos.get('consorcio') ?? '')
  const alcanzables = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)
  const valido = alcanzado(alcanzables, elegido)

  if (valido) {
    const galletas = await cookies()
    galletas.set(NOMBRE_GALLETA_CONSORCIO, elegido, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }

  const origen = await origenDeLaAccion()
  redirect(destinoConConsorcio(origen, valido ? elegido : null))
}

function alcanzado(consorcios: { id: string }[], id: string): boolean {
  return id !== '' && consorcios.some((consorcio) => consorcio.id === id)
}

/**
 * La página que originó el cambio, tomada del remitente del pedido. Solo se
 * usa su ruta + búsqueda (nunca el origen): no hay redirección abierta.
 */
async function origenDeLaAccion(): Promise<{ ruta: string; busqueda: URLSearchParams }> {
  const remitente = (await headers()).get('referer')
  if (!remitente) return { ruta: '/consorcios', busqueda: new URLSearchParams() }

  try {
    const url = new URL(remitente)
    return { ruta: url.pathname || '/consorcios', busqueda: url.searchParams }
  } catch {
    return { ruta: '/consorcios', busqueda: new URLSearchParams() }
  }
}

function destinoConConsorcio(
  origen: { ruta: string; busqueda: URLSearchParams },
  elegido: string | null,
): string {
  const busqueda = new URLSearchParams(origen.busqueda)
  if (elegido) busqueda.set('consorcio', elegido)
  const texto = busqueda.toString()
  return texto ? `${origen.ruta}?${texto}` : origen.ruta
}
