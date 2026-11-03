'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { crearAsamblea, editarBorrador } from '@/aplicacion/asambleas/convocar'
import { guardarConfiguracion } from '@/aplicacion/asambleas/configuracion'

export type Resultado = { mensaje: string; ok?: boolean }

const texto = (datos: FormData, campo: string) => String(datos.get(campo) ?? '').trim()

/** El navegador manda `datetime-local` sin zona: es la hora del consorcio (Argentina, UTC-3). */
const momento = (valor: string): Date => new Date(`${valor}:00-03:00`)

const PUNTOS = z.array(
  z.object({
    titulo: z.string(),
    descripcion: z.string().optional(),
    modalidad: z.enum(['binaria', 'opcion_multiple']),
    mayoria: z.enum(['absoluta', 'dos_tercios', 'unanimidad']).nullable().optional(),
    opciones: z.array(z.string()).optional(),
  }),
)

function leerAsamblea(datos: FormData) {
  let puntos: z.infer<typeof PUNTOS>
  try {
    puntos = PUNTOS.parse(JSON.parse(texto(datos, 'puntos') || '[]'))
  } catch {
    return null
  }
  const fecha = texto(datos, 'fechaHora')
  return {
    tipo:
      texto(datos, 'tipo') === 'extraordinaria'
        ? ('extraordinaria' as const)
        : ('ordinaria' as const),
    titulo: texto(datos, 'titulo'),
    fechaHora: fecha ? momento(fecha) : new Date(Number.NaN),
    lugar: texto(datos, 'lugar'),
    administracionInvitada: datos.get('administracionInvitada') === 'on',
    puntos,
  }
}

export async function accionGuardarAsamblea(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcioId = texto(datos, 'consorcio')
  const asambleaId = texto(datos, 'asamblea')
  const asamblea = leerAsamblea(datos)
  if (!asamblea) return { mensaje: 'Revisá el orden del día: algún punto quedó incompleto.' }

  let id = asambleaId
  try {
    if (asambleaId) {
      await editarBorrador(HABILITACIONES, RELOJ, {
        ...asamblea,
        usuarioId,
        consorcioId,
        asambleaId,
      })
    } else {
      id = (await crearAsamblea(HABILITACIONES, RELOJ, { ...asamblea, usuarioId, consorcioId }))
        .asambleaId
    }
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  revalidatePath('/consorcios/[consorcio]/asambleas', 'layout')
  redirect(`/consorcios/${consorcioId}/asambleas/${id}?hecho=asamblea-guardada`)
}

export async function accionGuardarConfiguracion(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')
  const consorcioId = texto(datos, 'consorcio')
  try {
    await guardarConfiguracion(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      reglaMayoria: texto(datos, 'reglaMayoria') === 'totalidad' ? 'totalidad' : 'presentes',
      anticipacionDias: Number(texto(datos, 'anticipacionDias')),
      topeApoderado: Number(texto(datos, 'topeApoderado')),
      umbralSinVoto: Number(texto(datos, 'umbralSinVoto')),
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }
  revalidatePath('/consorcios/[consorcio]/asambleas', 'layout')
  return { mensaje: 'Reglas guardadas. Rigen para las próximas convocatorias.', ok: true }
}
