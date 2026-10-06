'use server'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { ALMACEN, ASISTENCIA, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { confirmarPropuesta, descartarPropuesta } from '@/aplicacion/asistente/confirmar'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

/**
 * Confirmar y descartar una propuesta del asistente (RF-27). Enviar un mensaje
 * va por `/api/asistente` (flujo); estas no necesitan transmitir. Se llaman con
 * argumentos simples (no `FormData`) y **no redirigen**: así el chat se queda
 * abierto y el resultado se muestra en el panel. La autorización y el aislamiento
 * los hacen los casos de uso; aquí solo se resuelve la sesión.
 */

export type ResultadoConfirmar = { ok: true; texto: string } | { ok: false; mensaje: string }

export async function accionConfirmar(
  consorcioId: string,
  propuestaId: string,
): Promise<ResultadoConfirmar> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return { ok: false, mensaje: 'Tu sesión expiró. Volvé a entrar.' }
  try {
    const r = await confirmarPropuesta(ASISTENCIA, HABILITACIONES, RELOJ, ALMACEN, {
      usuarioId,
      consorcioId,
      propuestaId,
    })
    if (!r.ejecutada) return { ok: true, texto: 'Esa acción ya se había resuelto.' }
    // Una escritura sobre varios consorcios cuenta como le fue a cada uno.
    const detalle = (r.resultado as { texto?: unknown } | undefined)?.texto
    return {
      ok: true,
      texto: typeof detalle === 'string' ? detalle : 'Listo, la acción se realizó.',
    }
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { ok: false, mensaje: error.mensajeParaUsuario }
    throw error
  }
}

export async function accionDescartar(consorcioId: string, propuestaId: string): Promise<void> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return
  try {
    await descartarPropuesta(HABILITACIONES, RELOJ, { usuarioId, consorcioId, propuestaId })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
  }
}
