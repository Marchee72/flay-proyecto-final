'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { guardarInstruccionesDePago } from '@/aplicacion/consorcios/instrucciones-de-pago'
import {
  guardarReglaVencimientos,
  tramosDesdeEscalonado,
  type EscalonVencimiento,
} from '@/aplicacion/consorcios/regla-vencimientos'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { conHecho } from '@/app/aviso-en-url'
import { irAIngresar } from '@/app/ir-a-ingresar'
import { valoresDe, type ConValores } from '@/app/valores-de-formulario'

export type Resultado = { mensaje: string; ok: boolean }

const texto = (datos: FormData, campo: string) => String(datos.get(campo) ?? '').trim()

/**
 * Guarda la regla de vencimientos (RF-08). El administrador carga hasta dos
 * vencimientos con recargo (el recargo rige al pagar DESPUES de esa fecha), la
 * fecha del vencimiento en firme, pasada la cual corre la mora, y la tasa de
 * mora mensual. `tramosDesdeEscalonado` lo traduce al modelo de boleta (primer
 * tramo base) antes de validar y guardar todo junto.
 */
export async function accionGuardarVencimientos(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()

  const consorcioId = texto(datos, 'consorcio')

  const escalones: EscalonVencimiento[] = []
  for (const fila of [1, 2]) {
    const dia = texto(datos, `dia${fila}`)
    if (dia === '') continue
    escalones.push({
      diaDelMes: Number(dia),
      recargoPorcentaje: texto(datos, `recargo${fila}`) || '0',
    })
  }

  const diaFirme = texto(datos, 'diaFirme')
  if (diaFirme === '') {
    return { mensaje: 'Cargá el día del vencimiento en firme.', ok: false }
  }

  const tasaMora = texto(datos, 'tasaMora')
  if (tasaMora === '') {
    return { mensaje: 'Cargá la tasa de mora mensual.', ok: false }
  }

  const tramos = tramosDesdeEscalonado(escalones, Number(diaFirme))

  try {
    await guardarReglaVencimientos(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      tramos,
      tasaMoraMensual: tasaMora,
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario, ok: false }
    throw error
  }

  revalidatePath('/consorcios/[consorcio]/vencimientos', 'page')
  return { mensaje: 'Vencimientos guardados.', ok: true }
}

export type ResultadoInstrucciones = { mensaje: string } & ConValores

/** Guarda como se paga por fuera de la pasarela (RF-09); vacio las borra. */
export async function accionGuardarInstrucciones(
  _previo: ResultadoInstrucciones,
  datos: FormData,
): Promise<ResultadoInstrucciones> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()

  const consorcioId = texto(datos, 'consorcio')

  try {
    await guardarInstruccionesDePago(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      texto: String(datos.get('instrucciones') ?? ''),
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion)
      return { mensaje: error.mensajeParaUsuario, valores: valoresDe(datos) }
    throw error
  }

  revalidatePath('/consorcios/[consorcio]/vencimientos', 'page')
  redirect(conHecho(`/consorcios/${consorcioId}/vencimientos`, 'instrucciones-guardadas'))
}
