'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { confirmarComprobante } from '@/aplicacion/gastos/comprobantes'
import {
  confirmarExtraccion,
  descartarExtraccion,
  iniciarCargaAsistida,
} from '@/aplicacion/gastos/extraccion'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

/** Un archivo «use server» solo exporta funciones asincronicas. */
export type Resultado = { mensaje: string }

async function quienOpera(): Promise<string> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')
  return usuarioId
}

/**
 * Alta de gasto. El formulario admite valores precargados, pero **crear** es
 * siempre este envio explicito: ninguna salida automatica crea un gasto
 * (regla RN-14, FR-020, Principio IV).
 */
export async function accionRegistrarGasto(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')
  const fecha = String(datos.get('fecha') ?? '')
  let creado = ''

  const extraccionId = String(datos.get('extraccion') ?? '')
  const gasto = {
    usuarioId,
    consorcioId,
    periodoId: String(datos.get('periodo') ?? ''),
    rubroId: String(datos.get('rubro') ?? ''),
    proveedorId: String(datos.get('proveedor') ?? '') || null,
    importe: String(datos.get('importe') ?? ''),
    fecha: fecha ? new Date(`${fecha}T00:00:00Z`) : RELOJ.hoy(),
    descripcion: String(datos.get('descripcion') ?? ''),
  }

  try {
    // Con extraccion, el mismo envio confirma la propuesta y ata el comprobante
    // (`004-servicios` FR-026): es el unico camino por el que una extraccion
    // produce un gasto, y sigue siendo la persona la que aprieta el boton.
    const { gastoId } = extraccionId
      ? await confirmarExtraccion(HABILITACIONES, RELOJ, { ...gasto, extraccionId })
      : await registrarGasto(HABILITACIONES, RELOJ, gasto)
    creado = gastoId
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  redirect(`/gastos/${creado}?consorcio=${consorcioId}&nuevo=1`)
}

/**
 * Confirmacion de la subida directa. La llama el navegador cuando el archivo
 * ya llego al almacenamiento; si no llega, el trabajo pendiente la reintenta
 * (FR-006b).
 */
export async function accionConfirmarComprobante(datos: {
  consorcioId: string
  gastoId: string
  clave: string
}): Promise<Resultado> {
  const usuarioId = await quienOpera()

  try {
    await confirmarComprobante(HABILITACIONES, RELOJ, { usuarioId, ...datos })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  return { mensaje: '' }
}

/**
 * Confirmacion de la subida directa del comprobante suelto (`RF-06`, CU-06):
 * crea la extraccion y encola el trabajo; la propuesta se revisa en su pantalla.
 */
export async function accionIniciarCargaAsistida(
  datos: FormData,
): Promise<{ mensaje: string; destino?: string }> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')
  try {
    const { extraccionId } = await iniciarCargaAsistida(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      clave: String(datos.get('clave') ?? ''),
      tipoContenido: String(datos.get('tipoContenido') ?? ''),
    })
    return { mensaje: '', destino: `/gastos/asistida/${extraccionId}?consorcio=${consorcioId}` }
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }
}

export async function accionDescartarExtraccion(datos: FormData): Promise<void> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')
  try {
    await descartarExtraccion(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      extraccionId: String(datos.get('extraccion') ?? ''),
    })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
  }
  revalidatePath('/gastos/asistida')
  redirect(`/gastos/asistida?consorcio=${consorcioId}&descartada=1`)
}
