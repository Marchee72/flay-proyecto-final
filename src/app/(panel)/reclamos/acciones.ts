'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { ESTADOS_RECLAMO, type EstadoReclamo } from '@/aplicacion/reclamos/estados'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { asignar, vincularGasto } from '@/aplicacion/reclamos/asignar'
import { registrarReclamo, URGENCIAS } from '@/aplicacion/reclamos/registrar'
import { aplicarSugerencia, descartarSugerencia } from '@/aplicacion/reclamos/sugerencia'
import { transicionar } from '@/aplicacion/reclamos/transicionar'

export type Resultado = { mensaje: string }

const texto = (datos: FormData, campo: string) => String(datos.get(campo) ?? '').trim()

/** Alta desde el modal (`CU-07`). El exito va al detalle del reclamo nuevo. */
export async function accionRegistrarReclamo(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcioId = texto(datos, 'consorcio')
  const urgencia = URGENCIAS.find((u) => u.valor === texto(datos, 'urgencia'))?.valor
  let reclamoId: string

  try {
    ;({ reclamoId } = await registrarReclamo(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      unidadId: texto(datos, 'unidad') || null,
      titulo: texto(datos, 'titulo'),
      descripcion: texto(datos, 'descripcion'),
      urgencia,
    }))
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  revalidatePath('/reclamos')
  redirect(`/reclamos/${reclamoId}?consorcio=${consorcioId}&registrado=1`)
}

/** Cualquier transicion de estado (`CU-08`), con comentario opcional. */
export async function accionTransicionar(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcioId = texto(datos, 'consorcio')
  const reclamoId = texto(datos, 'reclamo')
  const hacia = texto(datos, 'hacia')
  if (!(ESTADOS_RECLAMO as readonly string[]).includes(hacia)) {
    return { mensaje: 'Elegí un estado de la lista.' }
  }

  try {
    await transicionar(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      reclamoId,
      hacia: hacia as EstadoReclamo,
      comentario: texto(datos, 'comentario') || null,
      responsableId: texto(datos, 'responsable') || null,
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  revalidatePath(`/reclamos/${reclamoId}`)
  redirect(`/reclamos/${reclamoId}?consorcio=${consorcioId}`)
}

/** Responsable, proveedor y rubro; asignar sobre un reclamo abierto lo pasa a asignado. */
export async function accionAsignar(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcioId = texto(datos, 'consorcio')
  const reclamoId = texto(datos, 'reclamo')

  try {
    await asignar(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      reclamoId,
      responsableId: texto(datos, 'responsable'),
      proveedorId: texto(datos, 'proveedor') || null,
      rubroId: texto(datos, 'rubro') || null,
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  revalidatePath(`/reclamos/${reclamoId}`)
  redirect(`/reclamos/${reclamoId}?consorcio=${consorcioId}`)
}

export async function accionVincularGasto(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcioId = texto(datos, 'consorcio')
  const reclamoId = texto(datos, 'reclamo')

  try {
    await vincularGasto(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      reclamoId,
      gastoId: texto(datos, 'gasto') || null,
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  revalidatePath(`/reclamos/${reclamoId}`)
  redirect(`/reclamos/${reclamoId}?consorcio=${consorcioId}`)
}

/** Aplicar o descartar la sugerencia del triage (`FR-027`). Nunca cambia el estado. */
export async function accionResolverSugerencia(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcioId = texto(datos, 'consorcio')
  const reclamoId = texto(datos, 'reclamo')
  const resolver = texto(datos, 'decision') === 'aplicar' ? aplicarSugerencia : descartarSugerencia

  try {
    await resolver(HABILITACIONES, RELOJ, { usuarioId, consorcioId, reclamoId })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  revalidatePath(`/reclamos/${reclamoId}`)
  redirect(`/reclamos/${reclamoId}?consorcio=${consorcioId}`)
}
