'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { altaEspacio, bajaEspacio, editarEspacio } from '@/aplicacion/reservas/espacios'
import { cancelarReserva, reservar } from '@/aplicacion/reservas/reservar'

export type Resultado = { mensaje: string }

const texto = (datos: FormData, campo: string) => String(datos.get(campo) ?? '').trim()
const entero = (datos: FormData, campo: string): number | undefined => {
  const valor = texto(datos, campo)
  return valor === '' ? undefined : Number(valor)
}

/** El navegador manda `datetime-local` sin zona: se toma como hora local del consorcio (Argentina, UTC-3). */
const momento = (valor: string): Date => new Date(`${valor}:00-03:00`)

export async function accionReservar(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcioId = texto(datos, 'consorcio')
  const desde = texto(datos, 'desde')
  const hasta = texto(datos, 'hasta')
  if (!desde || !hasta) return { mensaje: 'Elegí desde y hasta cuándo querés reservar.' }

  try {
    await reservar(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      espacioId: texto(datos, 'espacio'),
      unidadId: texto(datos, 'unidad'),
      desde: momento(desde),
      hasta: momento(hasta),
      cantidadPersonas: entero(datos, 'personas') ?? null,
      observaciones: texto(datos, 'observaciones') || null,
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  revalidatePath('/reservas')
  redirect(`/reservas?consorcio=${consorcioId}&confirmada=1`)
}

export async function accionCancelarReserva(datos: FormData): Promise<void> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcioId = texto(datos, 'consorcio')
  try {
    await cancelarReserva(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      reservaId: texto(datos, 'reserva'),
    })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    redirect(
      `/reservas?consorcio=${consorcioId}&error=${encodeURIComponent(error.mensajeParaUsuario)}`,
    )
  }
  revalidatePath('/reservas')
  redirect(`/reservas?consorcio=${consorcioId}&cancelada=1`)
}

export async function accionGuardarEspacio(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcioId = texto(datos, 'consorcio')
  const espacioId = texto(datos, 'espacio')
  const reglas = {
    nombre: texto(datos, 'nombre'),
    capacidadMaxima: entero(datos, 'capacidad') ?? null,
    anticipacionMinimaHoras: entero(datos, 'anticipacionMinima'),
    anticipacionMaximaDias: entero(datos, 'anticipacionMaxima'),
    duracionMaximaHoras: entero(datos, 'duracionMaxima'),
    reservasMaxMesUnidad: entero(datos, 'topeMensual'),
  }

  try {
    if (espacioId) {
      await editarEspacio(HABILITACIONES, RELOJ, { usuarioId, consorcioId, espacioId, ...reglas })
    } else {
      await altaEspacio(HABILITACIONES, RELOJ, { usuarioId, consorcioId, ...reglas })
    }
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  revalidatePath('/espacios')
  redirect(`/espacios?consorcio=${consorcioId}&guardado=1`)
}

export async function accionBajaEspacio(datos: FormData): Promise<void> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcioId = texto(datos, 'consorcio')
  try {
    await bajaEspacio(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      espacioId: texto(datos, 'espacio'),
    })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    redirect(
      `/espacios?consorcio=${consorcioId}&error=${encodeURIComponent(error.mensajeParaUsuario)}`,
    )
  }
  revalidatePath('/espacios')
  redirect(`/espacios?consorcio=${consorcioId}&baja=1`)
}
