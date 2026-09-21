'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { importeDesdeEntrada } from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { confirmarComprobante } from '@/aplicacion/gastos/comprobantes'
import {
  confirmarExtraccion,
  descartarExtraccion,
  iniciarCargaAsistida,
} from '@/aplicacion/gastos/extraccion'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { periodoPara } from '@/aplicacion/periodos/periodos'

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
  // `YYYY-MM`, lo que entrega `<input type="month">`.
  const periodo = String(datos.get('periodo') ?? '')
  const [anio, mes] = periodo.split('-').map(Number)
  const gasto = {
    usuarioId,
    consorcioId,
    rubroId: String(datos.get('rubro') ?? ''),
    proveedorId: String(datos.get('proveedor') ?? '') || null,
    importe: importeDesdeEntrada(String(datos.get('importe') ?? '')),
    fecha: fecha ? new Date(`${fecha}T00:00:00Z`) : RELOJ.hoy(),
    descripcion: String(datos.get('descripcion') ?? ''),
  }

  try {
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      throw new ErrorDeAplicacion('Elegí el mes al que se imputa el gasto.', 'RF-04')
    }
    // El periodo nace con el primer gasto del mes: no se abre a mano.
    // ponytail: si el alta falla despues (importe invalido), queda un periodo
    // vacio en `abierto`; es el mes en el que se estaba trabajando y no dana.
    const { periodoId } = await periodoPara(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      anio,
      mes,
    })
    // Con extraccion, el mismo envio confirma la propuesta y ata el comprobante
    // (`004-servicios` FR-026): es el unico camino por el que una extraccion
    // produce un gasto, y sigue siendo la persona la que aprieta el boton.
    const { gastoId } = extraccionId
      ? await confirmarExtraccion(HABILITACIONES, RELOJ, { ...gasto, periodoId, extraccionId })
      : await registrarGasto(HABILITACIONES, RELOJ, { ...gasto, periodoId })
    creado = gastoId
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  redirect(`/consorcios/${consorcioId}/gastos/${creado}?nuevo=1`)
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
/**
 * Encola la extraccion y **se queda en la lista**: la fila nueva aparece «en
 * cola» y la persona sube el siguiente mientras esta corre. Sin `destino`,
 * `SubidaDirecta` refresca la pagina.
 */
export async function accionIniciarCargaAsistida(
  datos: FormData,
): Promise<{ mensaje: string; destino?: string }> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')
  try {
    await iniciarCargaAsistida(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      clave: String(datos.get('clave') ?? ''),
      tipoContenido: String(datos.get('tipoContenido') ?? ''),
    })
    revalidatePath('/consorcios/[consorcio]/gastos/asistida', 'page')
    return { mensaje: '' }
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
  revalidatePath('/consorcios/[consorcio]/gastos/asistida', 'page')
  redirect(`/consorcios/${consorcioId}/gastos/asistida?descartada=1`)
}
