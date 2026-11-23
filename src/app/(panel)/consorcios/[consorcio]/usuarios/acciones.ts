'use server'

import { redirect } from 'next/navigation'

import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import { conError, conHecho } from '@/app/aviso-en-url'
import { valoresDe, type ConValores } from '@/app/valores-de-formulario'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { invitarPersona } from '@/aplicacion/identidad/invitar-persona'
import { invitarRegistrado, invitarRegistrados } from '@/aplicacion/identidad/registrados'
import { reenviarInvitacion } from '@/aplicacion/identidad/reenviar-invitacion'
import { enviarEnlaceDeClave } from '@/aplicacion/identidad/restablecer'
import { quitarAcceso } from '@/aplicacion/identidad/quitar-acceso'
import { rolDesdeFormulario } from '@/aplicacion/identidad/roles'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { importarOcupantes } from '@/aplicacion/importacion/importar-ocupantes'
import { irAIngresar } from '@/app/ir-a-ingresar'
import { urlBase } from '@/app/url-base'

import type { EstadoImportacion } from '../../importador'

/** Un archivo «use server» solo exporta funciones: el estado inicial va en el formulario. */
export type Resultado = { mensaje: string } & ConValores

/** La identidad de quien opera sale de la sesion, nunca del formulario. */
async function quienOpera(): Promise<string> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()
  return usuarioId
}

export async function accionInvitar(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const invitadorId = await quienOpera()
  const consorcio = await consorcioDe(invitadorId, String(datos.get('consorcio') ?? ''))
  if (!consorcio)
    return { mensaje: new NoEncontrado().mensajeParaUsuario, valores: valoresDe(datos) }

  const desde = String(datos.get('vigenciaDesde') ?? '')
  const rol = rolDesdeFormulario(datos.get('rol'))
  const unidadId = String(datos.get('unidad') ?? '')
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
      // La unidad en Usuarios carga propietarios; los inquilinos se asignan desde la unidad.
      unidad: rol === 'consorcista' && unidadId ? { unidadId, tipo: 'propietario' } : null,
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion)
      return { mensaje: error.mensajeParaUsuario, valores: valoresDe(datos) }
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

  if (!unidadId)
    return { mensaje: 'Elegí la unidad que le corresponde.', valores: valoresDe(datos) }

  try {
    await registrarOcupacion(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      unidadId,
      personaId: String(datos.get('persona') ?? ''),
      tipo: 'propietario',
      desde: desde ? new Date(`${desde}T00:00:00Z`) : RELOJ.hoy(),
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion)
      return { mensaje: error.mensajeParaUsuario, valores: valoresDe(datos) }
    throw error
  }

  redirect(conHecho(`/consorcios/${consorcioId}/usuarios`, 'unidad-asignada'))
}

/** «Revisar» y «Confirmar» de propietarios e inquilinos desde planilla (RF-03). No invita. */
export async function accionImportarOcupantes(
  _previo: EstadoImportacion,
  datos: FormData,
): Promise<EstadoImportacion> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')
  const archivo = datos.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0)
    return { mensaje: 'Elegí un archivo .xlsx o .csv.' }

  let resultado
  try {
    resultado = await importarOcupantes(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      bytes: new Uint8Array(await archivo.arrayBuffer()),
      nombreArchivo: archivo.name,
      confirmar: datos.get('confirmar') === '1',
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }
  if (resultado.estado !== 'cargado') return { mensaje: '', resultado }

  redirect(conHecho(`/consorcios/${consorcioId}/usuarios`, 'ocupantes-importados'))
}

/** El nombre del consorcio viaja en el correo: se busca, no se acepta del formulario. */
async function consorcioDe(usuarioId: string, consorcioId: string) {
  return (await misConsorcios(HABILITACIONES, RELOJ, usuarioId)).find((c) => c.id === consorcioId)
}

/** «Invitar» a un registrado sin acceso; pide el correo si la persona no lo tiene (RF-03). */
export async function accionInvitarRegistrado(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await quienOpera()
  const consorcio = await consorcioDe(usuarioId, String(datos.get('consorcio') ?? ''))
  if (!consorcio)
    return { mensaje: new NoEncontrado().mensajeParaUsuario, valores: valoresDe(datos) }

  const correo = datos.get('correo')
  let resultado: { yaTeniaCuenta: boolean }
  try {
    resultado = await invitarRegistrado(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: consorcio.id,
      consorcioNombre: consorcio.nombre,
      urlBase: await urlBase(),
      personaId: String(datos.get('persona') ?? ''),
      correo: correo === null ? undefined : String(correo),
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion)
      return { mensaje: error.mensajeParaUsuario, valores: valoresDe(datos) }
    throw error
  }

  redirect(
    conHecho(
      `/consorcios/${consorcio.id}/usuarios`,
      resultado.yaTeniaCuenta ? 'acceso-sumado' : 'registrado-invitado',
    ),
  )
}

/** «Invitar a todos los que tienen correo»: reanudable, corta a los 20 s (RF-03). */
export async function accionInvitarRegistrados(datos: FormData): Promise<void> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')
  const ruta = `/consorcios/${consorcioId}/usuarios`
  const consorcio = await consorcioDe(usuarioId, consorcioId)
  if (!consorcio) redirect(conError(ruta, new NoEncontrado().mensajeParaUsuario))

  let resultado: { invitados: number; quedan: number }
  try {
    resultado = await invitarRegistrados(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      consorcioNombre: consorcio.nombre,
      urlBase: await urlBase(),
    })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    redirect(conError(ruta, error.mensajeParaUsuario))
  }

  const { invitados, quedan } = resultado
  redirect(
    quedan === 0
      ? conHecho(ruta, 'registrados-invitados')
      : conError(ruta, `Invitamos a ${invitados}; quedan ${quedan}: volvé a apretar para seguir.`),
  )
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
