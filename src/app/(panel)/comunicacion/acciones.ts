'use server'

import type { AlcanceNovedad, TipoDocumento, Urgencia } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { conError, conHecho, type ClaveHecho } from '@/app/aviso-en-url'
import { consultarDocumentacion, valorarConsulta } from '@/aplicacion/comunicacion/consultar'
import { despacharNotificaciones, reintentarAgotados } from '@/aplicacion/comunicacion/despachar'
import {
  buscarConfiguracion,
  cargarDocumento,
  eliminarDocumento,
  reindexarDocumento,
  TIPOS_DOCUMENTO,
} from '@/aplicacion/comunicacion/documentos'
import { descartarNovedad, publicarNovedad } from '@/aplicacion/comunicacion/novedades'
import { aplicarSugerencia, descartarSugerencia } from '@/aplicacion/comunicacion/sugerencias'
import { ASISTENCIA, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { irAIngresar } from '@/app/ir-a-ingresar'
import { MANEJADORES } from '@/aplicacion/pendientes/manejadores'

export type Resultado = { mensaje: string }

const texto = (datos: FormData, campo: string) => String(datos.get(campo) ?? '').trim()

/** Un `<input type="date">` vacio o roto da una fecha invalida, que el caso de uso rechaza. */
const fecha = (valor: string) => new Date(`${valor}T00:00:00Z`)

export async function accionPublicarNovedad(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()
  const consorcioId = texto(datos, 'consorcio')
  const alcance = texto(datos, 'alcance')
  if (
    alcance !== 'general' &&
    alcance !== 'unidad' &&
    alcance !== 'division' &&
    alcance !== 'piso'
  ) {
    return { mensaje: 'Elegí a quién va la novedad.' }
  }
  const severidad = texto(datos, 'severidad')
  if (severidad !== 'baja' && severidad !== 'media' && severidad !== 'alta') {
    return { mensaje: 'Elegí la severidad de la novedad.' }
  }
  const desdeTexto = texto(datos, 'desde')
  const hastaTexto = texto(datos, 'hasta')
  const hoy = RELOJ.hoy()
  const fechaDesde = desdeTexto ? fecha(desdeTexto) : hoy
  if (fechaDesde < hoy) {
    return { mensaje: 'La fecha desde no puede ser anterior a hoy.' }
  }
  const fechaHasta = hastaTexto ? fecha(hastaTexto) : null
  if (fechaHasta && fechaHasta < fechaDesde) {
    return { mensaje: 'La fecha hasta no puede ser anterior a la fecha desde.' }
  }

  try {
    await publicarNovedad(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      titulo: texto(datos, 'titulo'),
      cuerpo: texto(datos, 'cuerpo'),
      fijada: datos.get('fijada') === 'on',
      severidad: severidad satisfies Urgencia,
      vigenteDesde: fechaDesde,
      vigenteHasta: fechaHasta,
      alcance: alcance satisfies AlcanceNovedad,
      unidadId: texto(datos, 'unidad') || null,
      division: texto(datos, 'division') || null,
      piso: texto(datos, 'piso') || null,
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  revalidatePath('/consorcios/[consorcio]/novedades', 'page')
  redirect(conHecho(`/consorcios/${consorcioId}/novedades`, 'novedad-publicada'))
}

/** Dejar de ver una novedad; vuelve a la pagina desde donde se descarto. */
export async function accionDescartarNovedad(datos: FormData): Promise<void> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()
  await descartarNovedad(HABILITACIONES, RELOJ, {
    usuarioId,
    consorcioId: texto(datos, 'consorcio'),
    novedadId: texto(datos, 'novedad'),
  })
  revalidatePath('/consorcios/[consorcio]', 'layout')
}

/** Confirmacion de la subida directa de un documento: la clave ya esta en el almacen. */
export async function accionCargarDocumento(
  datos: FormData,
): Promise<{ mensaje: string; destino?: string }> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()
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
  revalidatePath('/consorcios/[consorcio]/documentos', 'page')
  return {
    mensaje: '',
    destino: conHecho(`/consorcios/${consorcioId}/documentos`, 'documento-cargado'),
  }
}

export async function accionReindexar(datos: FormData): Promise<void> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()
  const consorcioId = texto(datos, 'consorcio')
  await reindexarDocumento(HABILITACIONES, RELOJ, {
    usuarioId,
    consorcioId,
    documentoId: texto(datos, 'documento'),
  })
  revalidatePath('/consorcios/[consorcio]/documentos', 'page')
  redirect(conHecho(`/consorcios/${consorcioId}/documentos`, 'documento-reindexado'))
}

export async function accionEliminarDocumento(datos: FormData): Promise<void> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()
  const consorcioId = texto(datos, 'consorcio')
  const documentoId = texto(datos, 'documento')
  try {
    await eliminarDocumento(HABILITACIONES, RELOJ, { usuarioId, consorcioId, documentoId })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    redirect(
      conError(`/consorcios/${consorcioId}/documentos/${documentoId}`, error.mensajeParaUsuario),
    )
  }
  revalidatePath('/consorcios/[consorcio]/documentos', 'page')
  redirect(conHecho(`/consorcios/${consorcioId}/documentos`, 'documento-eliminado'))
}

/**
 * Las tres acciones de las sugerencias (`RF-19`, RN-14): aplicar y descartar
 * vuelven a la pantalla de sugerencias, y «Buscar configuración» a la pagina del
 * documento (que es la que sondea mientras analiza); todas con el aviso. El
 * rechazo del caso de uso sale como problema y la sugerencia sigue pendiente.
 */
async function sobreSugerencias(
  datos: FormData,
  hacer: (quien: { usuarioId: string; consorcioId: string }) => Promise<ClaveHecho>,
  destino: (consorcioId: string) => string = (c) => `/consorcios/${c}/documentos/sugerencias`,
): Promise<void> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()
  const consorcioId = texto(datos, 'consorcio')
  const ruta = destino(consorcioId)
  let hecho: ClaveHecho
  try {
    hecho = await hacer({ usuarioId, consorcioId })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    redirect(conError(ruta, error.mensajeParaUsuario))
  }
  // Aplicar toca espacios, vencimientos o asambleas: todo el consorcio.
  revalidatePath('/consorcios/[consorcio]', 'layout')
  redirect(conHecho(ruta, hecho))
}

export async function accionAplicarSugerencia(datos: FormData): Promise<void> {
  return sobreSugerencias(datos, async (quien) => {
    const { canceladas } = await aplicarSugerencia(HABILITACIONES, RELOJ, {
      ...quien,
      sugerenciaId: texto(datos, 'sugerencia'),
    })
    return canceladas > 0 ? 'sugerencia-aplicada-con-cancelaciones' : 'sugerencia-aplicada'
  })
}

export async function accionDescartarSugerencia(datos: FormData): Promise<void> {
  return sobreSugerencias(datos, async (quien) => {
    await descartarSugerencia(HABILITACIONES, RELOJ, {
      ...quien,
      sugerenciaId: texto(datos, 'sugerencia'),
    })
    return 'sugerencia-descartada'
  })
}

/** «Buscar configuración» en un documento cargado antes de que existiera el analisis. */
export async function accionBuscarConfiguracion(datos: FormData): Promise<void> {
  return sobreSugerencias(
    datos,
    async (quien) => {
      await buscarConfiguracion(HABILITACIONES, RELOJ, {
        ...quien,
        documentoId: texto(datos, 'documento'),
      })
      return 'analisis-encolado'
    },
    (consorcioId) => `/consorcios/${consorcioId}/documentos/${texto(datos, 'documento')}`,
  )
}

export async function accionDespachar(datos: FormData): Promise<void> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()
  const consorcioId = texto(datos, 'consorcio')
  try {
    if (datos.get('reintentar') === '1') {
      await reintentarAgotados(HABILITACIONES, RELOJ, { usuarioId, consorcioId })
    }
    await despacharNotificaciones(MANEJADORES, HABILITACIONES, RELOJ, { usuarioId, consorcioId })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    redirect(conError('/bandeja', error.mensajeParaUsuario))
  }
  revalidatePath('/bandeja')
  redirect(conHecho('/bandeja', 'despachado'))
}

export type ResultadoDeConsultaVisible =
  | { modo: 'inicial' }
  | { modo: 'error'; mensaje: string }
  | {
      modo: 'respuesta'
      consultaId: string
      respuesta: string
      citas: { documentoId: string; documento: string; pagina: number | null; numero: number }[]
    }
  | { modo: 'sin_respaldo'; consultaId: string }
  | { modo: 'degradado'; motivo: string; documentos: { id: string; titulo: string }[] }

/** La pregunta sobre la documentacion (`CU-10`). */
export async function accionConsultar(
  _previo: ResultadoDeConsultaVisible,
  datos: FormData,
): Promise<ResultadoDeConsultaVisible> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()
  try {
    const r = await consultarDocumentacion(ASISTENCIA, HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: texto(datos, 'consorcio'),
      pregunta: texto(datos, 'pregunta'),
    })
    return r
  } catch (error) {
    if (error instanceof ErrorDeAplicacion)
      return { modo: 'error', mensaje: error.mensajeParaUsuario }
    throw error
  }
}

export async function accionValorar(datos: FormData): Promise<void> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()
  await valorarConsulta(HABILITACIONES, RELOJ, {
    usuarioId,
    consorcioId: texto(datos, 'consorcio'),
    consultaId: texto(datos, 'consulta'),
    util: texto(datos, 'util') === 'si',
  })
}
