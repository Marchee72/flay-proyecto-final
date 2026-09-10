'use server'

import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { confirmarComprobante } from '@/aplicacion/gastos/comprobantes'
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

  try {
    const { gastoId } = await registrarGasto(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      periodoId: String(datos.get('periodo') ?? ''),
      rubroId: String(datos.get('rubro') ?? ''),
      proveedorId: String(datos.get('proveedor') ?? '') || null,
      importe: String(datos.get('importe') ?? ''),
      fecha: fecha ? new Date(`${fecha}T00:00:00Z`) : RELOJ.hoy(),
      descripcion: String(datos.get('descripcion') ?? ''),
    })
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
