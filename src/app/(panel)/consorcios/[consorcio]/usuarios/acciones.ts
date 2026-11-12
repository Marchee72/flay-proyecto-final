'use server'

import { redirect } from 'next/navigation'

import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import { conError, conHecho } from '@/app/aviso-en-url'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { invitarPersona } from '@/aplicacion/identidad/invitar-persona'
import { reenviarInvitacion } from '@/aplicacion/identidad/reenviar-invitacion'
import { enviarEnlaceDeClave } from '@/aplicacion/identidad/restablecer'
import { quitarAcceso } from '@/aplicacion/identidad/quitar-acceso'
import { rolDesdeFormulario } from '@/aplicacion/identidad/roles'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { irAIngresar } from '@/app/ir-a-ingresar'
import { urlBase } from '@/app/url-base'

/** Un archivo «use server» solo exporta funciones: el estado inicial va en el formulario. */
export type Resultado = { mensaje: string }

/** La identidad de quien opera sale de la sesion, nunca del formulario. */
async function quienOpera(): Promise<string> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()
  return usuarioId
}

export async function accionInvitar(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const invitadorId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')

  // El nombre del consorcio se busca; no se acepta del formulario, porque viaja
  // en el cuerpo del correo que la invitacion manda.
  const consorcio = (await misConsorcios(HABILITACIONES, RELOJ, invitadorId)).find(
    (candidato) => candidato.id === consorcioId,
  )

  if (!consorcio) return { mensaje: new NoEncontrado().mensajeParaUsuario }

  const desde = String(datos.get('vigenciaDesde') ?? '')
  const rol = rolDesdeFormulario(datos.get('rol'))
  const unidadId = String(datos.get('unidad') ?? '')
  const tipo = datos.get('tipoOcupacion') === 'inquilino' ? 'inquilino' : 'propietario'
  let resultado: { yaTeniaCuenta: boolean }

  try {
    resultado = await invitarPersona(HABILITACIONES, RELOJ, {
      invitadorId,
      nombre: String(datos.get('nombre') ?? '').trim(),
      apellido: String(datos.get('apellido') ?? '').trim(),
      correo: String(datos.get('correo') ?? ''),
      rol,
      consorcioId: consorcio.id,
      consorcioNombre: consorcio.nombre,
      vigenciaDesde: desde ? new Date(`${desde}T00:00:00Z`) : RELOJ.hoy(),
      urlBase: await urlBase(),
      // La unidad solo cuenta para un consorcista.
      unidad: rol === 'consorcista' && unidadId ? { unidadId, tipo } : null,
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  redirect(
    conHecho(
      `/consorcios/${consorcio.id}/usuarios`,
      resultado.yaTeniaCuenta ? 'acceso-sumado' : 'invitado',
    ),
  )
}

/** «Asignar unidad» sobre una persona que ya figura en la nómina (RF-03, C2). */
export async function accionAsignarUnidad(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')
  const desde = String(datos.get('desde') ?? '')
  const unidadId = String(datos.get('unidad') ?? '')

  if (!unidadId) return { mensaje: 'Elegí la unidad que le corresponde.' }

  try {
    await registrarOcupacion(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      unidadId,
      personaId: String(datos.get('persona') ?? ''),
      tipo: datos.get('tipoOcupacion') === 'inquilino' ? 'inquilino' : 'propietario',
      desde: desde ? new Date(`${desde}T00:00:00Z`) : RELOJ.hoy(),
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  redirect(conHecho(`/consorcios/${consorcioId}/usuarios`, 'unidad-asignada'))
}

/** «Quitar» un rol: el acceso se cierra hoy mismo (RF-03, A3). */
export async function accionQuitarAcceso(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')

  try {
    await quitarAcceso(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      habilitacionId: String(datos.get('habilitacion') ?? ''),
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  redirect(conHecho(`/consorcios/${consorcioId}/usuarios`, 'acceso-quitado'))
}

/** «Enviar enlace para cambiar la clave»: levanta el bloqueo y manda el correo (RF-03, C5). */
export async function accionEnviarEnlaceDeClave(datos: FormData): Promise<void> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')

  try {
    await enviarEnlaceDeClave(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      destinatarioId: String(datos.get('destinatario') ?? ''),
      urlBase: await urlBase(),
    })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    redirect(conError(`/consorcios/${consorcioId}/usuarios`, error.mensajeParaUsuario))
  }

  redirect(conHecho(`/consorcios/${consorcioId}/usuarios`, 'enlace-enviado'))
}

/**
 * Reenvio de la invitacion (FR-006b). Vuelve a la lista con el resultado a la
 * vista: el administrador tiene que poder ver si esta vez salio.
 */
export async function accionReenviar(datos: FormData): Promise<void> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')

  try {
    await reenviarInvitacion(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      trabajoId: String(datos.get('trabajo') ?? ''),
    })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    redirect(conError(`/consorcios/${consorcioId}/usuarios`, 'No pudimos reenviar esa invitación.'))
  }

  redirect(conHecho(`/consorcios/${consorcioId}/usuarios`, 'invitacion-reenviada'))
}
