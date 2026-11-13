'use server'

import type { Clasificacion } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { conError, conHecho } from '@/app/aviso-en-url'
import { valoresDe, type ConValores } from '@/app/valores-de-formulario'
import { importeDesdeEntrada } from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { confirmarComprobante } from '@/aplicacion/gastos/comprobantes'
import {
  confirmarExtraccion,
  descartarExtraccion,
  iniciarCargaAsistida,
} from '@/aplicacion/gastos/extraccion'
import { editarGasto, eliminarGasto } from '@/aplicacion/gastos/editar-gasto'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { irAIngresar } from '@/app/ir-a-ingresar'
import { periodoPara } from '@/aplicacion/periodos/periodos'

/** Un archivo «use server» solo exporta funciones asincronicas. */
export type Resultado = { mensaje: string } & ConValores

async function quienOpera(): Promise<string> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()
  return usuarioId
}

/**
 * Alta de gasto. El formulario admite valores precargados, pero **crear** es
 * siempre este envio explicito: ninguna salida automatica crea un gasto
 * (regla RN-14, FR-020, Principio IV).
 */
/** Solo los dos valores del enum pasan; cualquier otro deja decidir al rubro. */
function clasificacionDe(valor: string): Clasificacion | undefined {
  return valor === 'ordinario' || valor === 'extraordinario' ? valor : undefined
}

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
    // La propone el rubro y quien carga la puede corregir (regla RN-04); si
    // llega cualquier otra cosa, decide el rubro como antes.
    clasificacion: clasificacionDe(String(datos.get('clasificacion') ?? '')),
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
    if (error instanceof ErrorDeAplicacion)
      return { mensaje: error.mensajeParaUsuario, valores: valoresDe(datos) }
    throw error
  }

  redirect(conHecho(`/consorcios/${consorcioId}/gastos/${creado}`, 'gasto-registrado'))
}

/** Edicion de un gasto del periodo abierto (RF-04): el periodo no viaja ni se mueve. */
export async function accionEditarGasto(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')
  const gastoId = String(datos.get('gasto') ?? '')
  const fecha = String(datos.get('fecha') ?? '')

  try {
    await editarGasto(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      gastoId,
      rubroId: String(datos.get('rubro') ?? ''),
      // El formulario siempre manda uno de los dos valores del enum.
      clasificacion: clasificacionDe(String(datos.get('clasificacion') ?? '')) ?? 'ordinario',
      proveedorId: String(datos.get('proveedor') ?? '') || null,
      importe: importeDesdeEntrada(String(datos.get('importe') ?? '')),
      fecha: fecha ? new Date(`${fecha}T00:00:00Z`) : RELOJ.hoy(),
      descripcion: String(datos.get('descripcion') ?? ''),
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion)
      return { mensaje: error.mensajeParaUsuario, valores: valoresDe(datos) }
    throw error
  }

  redirect(conHecho(`/consorcios/${consorcioId}/gastos/${gastoId}`, 'gasto-actualizado'))
}

/** Baja de un gasto sin vinculos; vuelve a la lista de su periodo. */
export async function accionEliminarGasto(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')
  let periodoId = ''

  try {
    ;({ periodoId } = await eliminarGasto(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      gastoId: String(datos.get('gasto') ?? ''),
    }))
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  redirect(conHecho(`/consorcios/${consorcioId}/gastos?periodo=${periodoId}`, 'gasto-eliminado'))
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
  const asistida = `/consorcios/${consorcioId}/gastos/asistida`
  try {
    await descartarExtraccion(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      extraccionId: String(datos.get('extraccion') ?? ''),
    })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    redirect(conError(asistida, error.mensajeParaUsuario))
  }
  revalidatePath('/consorcios/[consorcio]/gastos/asistida', 'page')
  redirect(conHecho(asistida, 'extraccion-descartada'))
}
