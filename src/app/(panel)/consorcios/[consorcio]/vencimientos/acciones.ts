'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import {
  guardarReglaVencimientos,
  type TramoRegla,
} from '@/aplicacion/consorcios/regla-vencimientos'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

export type Resultado = { mensaje: string; ok: boolean }

const texto = (datos: FormData, campo: string) => String(datos.get(campo) ?? '').trim()

/**
 * Guarda la regla de vencimientos (RF-08). Tres filas en el formulario: la 1ª es
 * el base (recargo 0) y es obligatoria; las otras cuentan como tramo solo si
 * tienen día. El dominio valida el resto (días ascendentes, mora > último recargo).
 */
export async function accionGuardarVencimientos(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcioId = texto(datos, 'consorcio')

  const tramos: TramoRegla[] = []
  const dia1 = texto(datos, 'dia1')
  if (dia1 !== '') {
    tramos.push({ orden: 1, diaDelMes: Number(dia1), recargoPorcentaje: '0' })
  }
  for (let fila = 2; fila <= 3; fila++) {
    const dia = texto(datos, `dia${fila}`)
    if (dia === '') continue
    tramos.push({
      orden: tramos.length + 1,
      diaDelMes: Number(dia),
      recargoPorcentaje: texto(datos, `recargo${fila}`) || '0',
    })
  }

  if (tramos.length === 0) {
    return { mensaje: 'Cargá al menos el primer vencimiento (día del mes).', ok: false }
  }

  try {
    await guardarReglaVencimientos(HABILITACIONES, RELOJ, { usuarioId, consorcioId, tramos })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario, ok: false }
    throw error
  }

  revalidatePath('/consorcios/[consorcio]/vencimientos', 'page')
  return { mensaje: 'Vencimientos guardados.', ok: true }
}
