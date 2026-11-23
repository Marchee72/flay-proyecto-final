'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { conError, conHecho } from '@/app/aviso-en-url'
import { valoresDe, type ConValores } from '@/app/valores-de-formulario'
import { eliminarConsorcio, restaurarConsorcio } from '@/aplicacion/consorcios/archivar-consorcio'
import { altaConsorcio } from '@/aplicacion/consorcios/alta-consorcio'
import { tipoDeUnidadDesdeFormulario } from '@/aplicacion/consorcios/tipos-de-unidad'
import { cargarPadron, editarPadron } from '@/aplicacion/consorcios/unidades'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import {
  erroresDelArchivoDePadron,
  importarPadron,
  planillaDeFilas,
  revisarArchivoDePadron,
} from '@/aplicacion/importacion/importar-padron'
import { irAIngresar } from '@/app/ir-a-ingresar'

import type { EstadoImportacion } from './importador'

/** Un archivo «use server» solo exporta funciones asincronicas. */
export type Resultado = { mensaje: string } & ConValores

async function quienOpera(): Promise<string> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()
  return usuarioId
}

export async function accionAltaConsorcio(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await quienOpera()
  let creado = ''

  try {
    const { consorcioId } = await altaConsorcio(HABILITACIONES, RELOJ, {
      usuarioId,
      administradoraId: String(datos.get('administradora') ?? ''),
      nombre: String(datos.get('nombre') ?? '').trim(),
      direccion: String(datos.get('direccion') ?? '').trim(),
      localidad: String(datos.get('localidad') ?? '').trim(),
      cuit: String(datos.get('cuit') ?? '').trim(),
    })
    creado = consorcioId
  } catch (error) {
    if (error instanceof ErrorDeAplicacion)
      return { mensaje: error.mensajeParaUsuario, valores: valoresDe(datos) }
    throw error
  }

  redirect(`/consorcios/${creado}/unidades`)
}

/**
 * «Revisar» el archivo del asistente de alta: lee y valida, no escribe nada. La
 * revisión del paso 3 sale de acá; al confirmar, el alta lo vuelve a validar.
 */
export async function accionRevisarArchivoDeAlta(datos: FormData): Promise<EstadoImportacion> {
  await quienOpera()
  const archivo = datos.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0)
    return { mensaje: 'Elegí un archivo .xlsx o .csv.' }
  const revision = await revisarArchivoDePadron(
    new Uint8Array(await archivo.arrayBuffer()),
    archivo.name,
  )
  return { mensaje: '', resultado: revision }
}

/**
 * Alta de consorcio con padron en el mismo envio (asistente «Nuevo consorcio»
 * en modal). Llama al mismo caso de uso `altaConsorcio` con las unidades: la
 * transaccion es la misma que cuando el alta trae unidades (FR-011c) y los
 * rechazos —CUIT repetido, suma que no cierra— llegan con el mismo mensaje
 * RNF-10. Solo presentacion: arma las listas paralelas del formulario.
 */
export async function accionAltaConsorcioConPadron(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const usuarioId = await quienOpera()
  let creado = ''

  const designaciones = datos.getAll('designacion').map(String)
  const coeficientes = datos.getAll('coeficiente').map(String)
  const tipos = datos.getAll('tipo').map(String)
  const archivo = datos.get('archivo')

  // Los dueños que se cargaron o corrigieron en el asistente viajan en listas paralelas.
  const CAMPOS_DUENO = ['nombre', 'apellido', 'dni', 'correo', 'telefono'] as const
  const duenos = Object.fromEntries(
    CAMPOS_DUENO.map((campo) => [campo, datos.getAll(`dueno_${campo}`).map(String)]),
  ) as Record<(typeof CAMPOS_DUENO)[number], string[]>
  const duenoDe = (i: number) => {
    const d = Object.fromEntries(
      CAMPOS_DUENO.map((campo) => [campo, String(duenos[campo][i] ?? '').trim()]),
    ) as Record<(typeof CAMPOS_DUENO)[number], string>
    return CAMPOS_DUENO.some((campo) => d[campo] !== '') ? d : null
  }
  const hayDuenos = designaciones.some((designacion, i) => designacion.trim() !== '' && duenoDe(i))

  // Padrón con dueños (o desde planilla): se arma una planilla y se pasa por el mismo camino
  // que un archivo —se revisa antes de crear nada y se importa sobre el consorcio recién
  // creado— con el caso de uso de la pantalla de Unidades.
  const planilla: { bytes: Uint8Array; nombre: string } | null =
    archivo instanceof File && archivo.size > 0
      ? { bytes: new Uint8Array(await archivo.arrayBuffer()), nombre: archivo.name }
      : hayDuenos
        ? {
            nombre: 'padron.xlsx',
            bytes: await planillaDeFilas(
              designaciones.flatMap((designacion, i) => {
                if (designacion.trim() === '') return []
                const d = duenoDe(i)
                return [
                  {
                    designacion: designacion.trim(),
                    tipo: tipoDeUnidadDesdeFormulario(tipos[i]),
                    coeficiente: String(coeficientes[i] ?? '').trim(),
                    dueno: d && {
                      nombre: d.nombre,
                      apellido: d.apellido,
                      documento: d.dni || null,
                      correo: d.correo || null,
                      telefono: d.telefono || null,
                    },
                  },
                ]
              }),
            ),
          }
        : null

  if (planilla) {
    try {
      const { bytes } = planilla
      const errores = await erroresDelArchivoDePadron(bytes, planilla.nombre)
      if (errores.length > 0) {
        const detalle = errores
          .slice(0, 5)
          .map((e) => (e.fila !== null ? `Fila ${e.fila}: ${e.mensaje}` : e.mensaje))
          .join(' · ')
        const resto = errores.length > 5 ? ` · y ${errores.length - 5} más` : ''
        return {
          mensaje: `El padrón tiene ${errores.length === 1 ? 'un error' : `${errores.length} errores`}: no se creó nada. ${detalle}${resto}`,
        }
      }

      const { consorcioId } = await altaConsorcio(HABILITACIONES, RELOJ, {
        usuarioId,
        administradoraId: String(datos.get('administradora') ?? ''),
        nombre: String(datos.get('nombre') ?? '').trim(),
        direccion: String(datos.get('direccion') ?? '').trim(),
        localidad: String(datos.get('localidad') ?? '').trim(),
        cuit: String(datos.get('cuit') ?? '').trim(),
      })
      creado = consorcioId

      const resultado = await importarPadron(HABILITACIONES, RELOJ, {
        usuarioId,
        consorcioId,
        bytes,
        nombreArchivo: planilla.nombre,
        confirmar: true,
      })
      if (resultado.estado !== 'cargado')
        redirect(
          conError(
            `/consorcios/${consorcioId}/unidades`,
            'El consorcio se creó, pero el padrón no se pudo importar. Volvé a subir el archivo.',
          ),
        )
    } catch (error) {
      if (error instanceof ErrorDeAplicacion) {
        // Si el consorcio ya existe, falló la importación: se sigue desde Unidades.
        if (creado !== '')
          redirect(conError(`/consorcios/${creado}/unidades`, error.mensajeParaUsuario))
        return { mensaje: error.mensajeParaUsuario }
      }
      throw error
    }
    revalidatePath('/consorcios', 'layout')
    redirect(conHecho(`/consorcios/${creado}`, 'padron-importado'))
  }

  try {
    const unidades = designaciones
      .map((designacion, i) => ({
        designacion: designacion.trim(),
        coeficiente: String(coeficientes[i] ?? '').trim(),
        tipo: tipoDeUnidadDesdeFormulario(tipos[i]),
      }))
      .filter((unidad) => unidad.designacion !== '')

    if (unidades.length === 0) {
      return {
        mensaje:
          'El padrón quedó vacío. Cargá al menos una unidad con su coeficiente: sin padrón no se puede liquidar.',
      }
    }

    const { consorcioId } = await altaConsorcio(HABILITACIONES, RELOJ, {
      usuarioId,
      administradoraId: String(datos.get('administradora') ?? ''),
      nombre: String(datos.get('nombre') ?? '').trim(),
      direccion: String(datos.get('direccion') ?? '').trim(),
      localidad: String(datos.get('localidad') ?? '').trim(),
      cuit: String(datos.get('cuit') ?? '').trim(),
      unidades,
    })
    creado = consorcioId
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  redirect(`/consorcios/${creado}`)
}

/**
 * Carga del padron entero. Las unidades llegan como listas paralelas de
 * designacion, tipo y coeficiente, en el orden en que se cargaron.
 */
export async function accionCargarPadron(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')

  const designaciones = datos.getAll('designacion').map(String)
  const coeficientes = datos.getAll('coeficiente').map(String)
  const tipos = datos.getAll('tipo').map(String)

  try {
    const unidades = designaciones
      .map((designacion, i) => ({
        designacion: designacion.trim(),
        coeficiente: coeficientes[i],
        tipo: tipoDeUnidadDesdeFormulario(tipos[i]),
      }))
      .filter((unidad) => unidad.designacion !== '')

    if (unidades.length === 0) return { mensaje: 'Cargá al menos una unidad.' }

    await cargarPadron(HABILITACIONES, RELOJ, { usuarioId, consorcioId, unidades })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  redirect(`/consorcios/${consorcioId}`)
}

/**
 * Edicion del padron ya cargado (FR-011): las mismas listas paralelas que la
 * carga, mas `id` (vacio en las nuevas) y `baja`.
 */
export async function accionEditarPadron(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')

  const ids = datos.getAll('id').map(String)
  const bajas = datos.getAll('baja').map(String)
  const designaciones = datos.getAll('designacion').map(String)
  const coeficientes = datos.getAll('coeficiente').map(String)
  const tipos = datos.getAll('tipo').map(String)

  try {
    await editarPadron(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId,
      unidades: designaciones.map((designacion, i) => ({
        id: ids[i] || undefined,
        designacion,
        coeficiente: coeficientes[i],
        tipo: tipoDeUnidadDesdeFormulario(tipos[i]),
        baja: bajas[i] === '1',
      })),
    })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion) return { mensaje: error.mensajeParaUsuario }
    throw error
  }

  revalidatePath('/consorcios/[consorcio]', 'layout')
  redirect(conHecho(`/consorcios/${consorcioId}/unidades`, 'padron-guardado'))
}

/**
 * «Revisar» y «Confirmar» del padrón desde planilla (RF-02). Sin estado: el
 * archivo viaja las dos veces y el caso de uso revalida al confirmar.
 */
export async function accionImportarPadron(
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
    resultado = await importarPadron(HABILITACIONES, RELOJ, {
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

  revalidatePath('/consorcios/[consorcio]', 'layout')
  redirect(conHecho(`/consorcios/${consorcioId}/unidades`, 'padron-importado'))
}

/**
 * Eliminar un consorcio (RN-22): sin movimiento se borra, con historia se
 * archiva. El caso de uso decide; la pantalla solo dice cual de las dos fue.
 */
export async function accionEliminarConsorcio(datos: FormData): Promise<void> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')
  let resultado: 'borrado' | 'archivado'
  try {
    resultado = await eliminarConsorcio(HABILITACIONES, RELOJ, { usuarioId, consorcioId })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion)
      redirect(conError('/consorcios', error.mensajeParaUsuario))
    throw error
  }
  revalidatePath('/consorcios', 'layout')
  redirect(
    conHecho(
      '/consorcios',
      resultado === 'borrado' ? 'consorcio-eliminado' : 'consorcio-archivado',
    ),
  )
}

export async function accionRestaurarConsorcio(datos: FormData): Promise<void> {
  const usuarioId = await quienOpera()
  const consorcioId = String(datos.get('consorcio') ?? '')
  try {
    await restaurarConsorcio(HABILITACIONES, RELOJ, { usuarioId, consorcioId })
  } catch (error) {
    if (error instanceof ErrorDeAplicacion)
      redirect(conError('/consorcios', error.mensajeParaUsuario))
    throw error
  }
  revalidatePath('/consorcios', 'layout')
  redirect(conHecho('/consorcios', 'consorcio-restaurado'))
}
