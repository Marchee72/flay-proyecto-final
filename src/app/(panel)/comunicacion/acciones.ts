'use server'

import type { TipoDocumento } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { despacharNotificaciones, reintentarAgotados } from '@/aplicacion/comunicacion/despachar'
import { cargarDocumento, TIPOS_DOCUMENTO } from '@/aplicacion/comunicacion/documentos'
import { publicarNovedad } from '@/aplicacion/comunicacion/novedades'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { MANEJADORES } from '@/aplicacion/pendientes/manejadores'

export type Resultado = { mensaje: string }

const texto = (datos: FormData, campo: string) => String(datos.get(campo) ?? '').trim()

export async function accionPublicarNovedad(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')
  const consorcioId = texto(datos, 'consorcio')
  try {
    await publicarNovedad(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      titulo: texto(datos, 'titulo'),
      cuerpo: texto(datos, 'cuerpo'),
      fijada: datos.get('fijada') === 'on',
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }
  revalidatePath('/novedades')
  redirect(`/novedades?consorcio=${consorcioId}&publicada=1`)
}

/** Confirmacion de la subida directa de un documento: la clave ya esta en el almacen. */
export async function accionCargarDocumento(
  datos: FormData,
): Promise<{ mensaje: string; destino?: string }> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')
  const consorcioId = texto(datos, 'consorcio')
  const tipo = texto(datos, 'tipo')
  if (!TIPOS_DOCUMENTO.some((t) => t.valor === tipo)) {
    return { mensaje: 'Elegí un tipo de documento de la lista.' }
  }
  const fecha = texto(datos, 'fecha')
  try {
    await cargarDocumento(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      clave: texto(datos, 'clave'),
      tipoContenido: texto(datos, 'tipoContenido'),
      tipo: tipo as TipoDocumento,
      titulo: texto(datos, 'titulo'),
      fechaDocumento: fecha ? new Date(`${fecha}T00:00:00Z`) : null,
      visibleConsorcistas: datos.get('visible') === 'on',
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }
  revalidatePath('/documentos')
  return { mensaje: '', destino: `/documentos?consorcio=${consorcioId}&cargado=1` }
}

export async function accionDespachar(datos: FormData): Promise<void> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')
  const consorcioId = texto(datos, 'consorcio')
  try {
    if (datos.get('reintentar') === '1') {
      await reintentarAgotados(HABILITACIONES, RELOJ, { usuarioId, consorcioId })
    }
    await despacharNotificaciones(MANEJADORES, HABILITACIONES, RELOJ, { usuarioId, consorcioId })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    redirect(
      `/pendientes?consorcio=${consorcioId}&error=${encodeURIComponent(error.mensajeParaUsuario)}`,
    )
  }
  revalidatePath('/pendientes')
  redirect(`/pendientes?consorcio=${consorcioId}&despachado=1`)
}
