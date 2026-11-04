'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'

import { ErrorDeAplicacion } from '@/compartido/errores'
import {
  ALMACEN,
  DERIVADOR,
  AVISO_EN_VIVO,
  GENERADOR_DOCUMENTOS,
  HABILITACIONES,
  RELOJ,
} from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import {
  designarFirmantes,
  enviarAFirmar,
  firmar,
  guardarNotas,
  pedirBorrador,
  redactarResumen,
  reemplazarFirmante,
} from '@/aplicacion/asambleas/acta'
import {
  abrir,
  abrirPunto,
  acreditar,
  acreditarme,
  cerrarPunto,
  constituir,
  designarAutoridades,
  finalizar,
  tomarDireccion,
} from '@/aplicacion/asambleas/conducir'
import { borrarBorrador, cancelar, convocar } from '@/aplicacion/asambleas/convocar'
import { conAviso } from '@/aplicacion/asambleas/en-vivo'
import { guardarObservacion } from '@/aplicacion/asambleas/observaciones'
import { oponerme, registrarOposicionEnPapel } from '@/aplicacion/asambleas/oposicion'
import { otorgarPoder, registrarPoderEnPapel, revocarPoder } from '@/aplicacion/asambleas/poderes'
import { cargarVoto, votar, type Eleccion } from '@/aplicacion/asambleas/votar'

/**
 * Acciones de una asamblea. Cada una vuelve a la pantalla con `?hecho=` o
 * `?error=` (nota 24): el aviso lo dibuja `PilaDeAvisos`. Los casos de uso
 * autorizan de nuevo contra la base; acá solo se lee el formulario.
 */

const texto = (datos: FormData, campo: string) => String(datos.get(campo) ?? '').trim()

/** `unidad|persona`: un solo `select` elige las dos, para que no puedan desencontrarse. */
const par = (datos: FormData, campo: string): [string, string] => {
  const [a = '', b = ''] = texto(datos, campo).split('|')
  return [a, b]
}

type Base = { usuarioId: string; consorcioId: string; asambleaId: string }

async function ejecutar(
  datos: FormData,
  trabajo: (base: Base) => Promise<unknown>,
  hecho: string | (() => string),
  destino: 'asamblea' | 'acta' | 'lista' = 'asamblea',
): Promise<never> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')
  const base = {
    usuarioId,
    consorcioId: texto(datos, 'consorcio'),
    asambleaId: texto(datos, 'asamblea'),
  }
  const raiz = `/consorcios/${base.consorcioId}/asambleas`
  const ruta =
    destino === 'lista' ? raiz : `${raiz}/${base.asambleaId}${destino === 'acta' ? '/acta' : ''}`
  try {
    await trabajo(base)
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    redirect(`${ruta}?error=${encodeURIComponent(error.mensajeParaUsuario)}`)
  }
  revalidatePath('/consorcios/[consorcio]/asambleas', 'layout')
  redirect(`${ruta}?hecho=${typeof hecho === 'function' ? hecho() : hecho}`)
}

const eleccion = (datos: FormData): Eleccion => {
  const opcionId = texto(datos, 'opcion')
  return opcionId
    ? { opcionId }
    : { sentido: texto(datos, 'sentido') as 'positivo' | 'negativo' | 'abstencion' }
}

// Convocatoria ---------------------------------------------------------------

export async function accionConvocar(datos: FormData) {
  let sinContacto = 0
  await ejecutar(
    datos,
    async (b) => {
      sinContacto = (await convocar(HABILITACIONES, RELOJ, b)).sinContacto.length
    },
    () => (sinContacto > 0 ? 'asamblea-convocada-sin-contacto' : 'asamblea-convocada'),
  )
}

export async function accionBorrar(datos: FormData) {
  await ejecutar(
    datos,
    (b) => borrarBorrador(HABILITACIONES, RELOJ, b),
    'asamblea-borrada',
    'lista',
  )
}

export async function accionCancelar(datos: FormData) {
  await ejecutar(
    datos,
    (b) => cancelar(HABILITACIONES, RELOJ, { ...b, motivo: texto(datos, 'motivo') }),
    'asamblea-cancelada',
  )
}

// Poderes --------------------------------------------------------------------

export async function accionOtorgarPoder(datos: FormData) {
  await ejecutar(
    datos,
    (b) =>
      otorgarPoder(HABILITACIONES, RELOJ, {
        ...b,
        unidadId: texto(datos, 'unidad'),
        apoderadoId: texto(datos, 'apoderado'),
      }),
    'poder-otorgado',
  )
}

export async function accionPoderEnPapel(datos: FormData) {
  const [unidadId, otorganteId] = par(datos, 'otorgante')
  await ejecutar(
    datos,
    (b) =>
      registrarPoderEnPapel(HABILITACIONES, RELOJ, {
        ...b,
        unidadId,
        otorganteId,
        apoderadoId: texto(datos, 'apoderado'),
      }),
    'poder-otorgado',
  )
}

export async function accionRevocarPoder(datos: FormData) {
  await ejecutar(
    datos,
    (b) => revocarPoder(HABILITACIONES, RELOJ, { ...b, poderId: texto(datos, 'poder') }),
    'poder-revocado',
  )
}

// Reunión --------------------------------------------------------------------

export type ResultadoSala = { ok: true; mensaje: string } | { ok: false; error: string }

const MENSAJE_SALA: Record<string, string> = {
  acreditado: 'Asistencia registrada.',
  'autoridades-designadas': 'Presidente y secretario designados.',
  'asamblea-constituida': 'Asamblea constituida: ya se pueden tratar los puntos.',
  'punto-abierto': 'Punto en votación.',
  'punto-cerrado': 'Punto cerrado con su resultado.',
  'voto-registrado': 'Voto registrado.',
  'observacion-guardada': 'Observación guardada.',
  'direccion-tomada': 'Ahora dirigís la asamblea.',
}

async function ejecutarEnSala(
  datos: FormData,
  trabajo: (base: Base) => Promise<unknown>,
  hecho: keyof typeof MENSAJE_SALA,
): Promise<ResultadoSala> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')
  const base = {
    usuarioId,
    consorcioId: texto(datos, 'consorcio'),
    asambleaId: texto(datos, 'asamblea'),
  }
  try {
    await conAviso(AVISO_EN_VIVO, after, base.asambleaId, () => trabajo(base))
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    return { ok: false, error: error.mensajeParaUsuario }
  }
  revalidatePath(`/consorcios/${base.consorcioId}/asambleas/${base.asambleaId}`)
  return { ok: true, mensaje: MENSAJE_SALA[hecho] ?? 'Listo.' }
}

export async function accionAbrir(datos: FormData) {
  await ejecutar(datos, (b) => abrir(HABILITACIONES, RELOJ, b), 'asamblea-abierta')
}

export async function accionAcreditarme(datos: FormData): Promise<ResultadoSala> {
  return ejecutarEnSala(datos, (b) => acreditarme(HABILITACIONES, RELOJ, b), 'acreditado')
}

export async function accionAcreditar(datos: FormData): Promise<ResultadoSala> {
  return ejecutarEnSala(
    datos,
    (b) =>
      acreditar(HABILITACIONES, RELOJ, {
        ...b,
        unidadId: texto(datos, 'unidad'),
        nombre: texto(datos, 'nombre'),
        representacion:
          texto(datos, 'representacion') === 'apoderado' ? 'apoderado' : 'propietario',
      }),
    'acreditado',
  )
}

export async function accionAutoridades(datos: FormData): Promise<ResultadoSala> {
  return ejecutarEnSala(
    datos,
    (b) =>
      designarAutoridades(HABILITACIONES, RELOJ, {
        ...b,
        presidenteId: texto(datos, 'presidente'),
        secretarioId: texto(datos, 'secretario'),
      }),
    'autoridades-designadas',
  )
}

export async function accionConstituir(datos: FormData): Promise<ResultadoSala> {
  return ejecutarEnSala(datos, (b) => constituir(HABILITACIONES, RELOJ, b), 'asamblea-constituida')
}

export async function accionAbrirPunto(datos: FormData): Promise<ResultadoSala> {
  return ejecutarEnSala(
    datos,
    (b) => abrirPunto(HABILITACIONES, RELOJ, { ...b, puntoId: texto(datos, 'punto') }),
    'punto-abierto',
  )
}

export async function accionCerrarPunto(datos: FormData): Promise<ResultadoSala> {
  return ejecutarEnSala(
    datos,
    (b) => cerrarPunto(HABILITACIONES, RELOJ, { ...b, puntoId: texto(datos, 'punto') }),
    'punto-cerrado',
  )
}

export async function accionVotar(datos: FormData): Promise<ResultadoSala> {
  return ejecutarEnSala(
    datos,
    (b) =>
      votar(HABILITACIONES, RELOJ, {
        ...b,
        puntoId: texto(datos, 'punto'),
        unidadId: texto(datos, 'unidad'),
        eleccion: eleccion(datos),
      }),
    'voto-registrado',
  )
}

export async function accionCargarVoto(datos: FormData): Promise<ResultadoSala> {
  return ejecutarEnSala(
    datos,
    (b) =>
      cargarVoto(HABILITACIONES, RELOJ, {
        ...b,
        puntoId: texto(datos, 'punto'),
        unidadId: texto(datos, 'unidad'),
        eleccion: eleccion(datos),
      }),
    'voto-registrado',
  )
}

export async function accionTomarDireccion(datos: FormData): Promise<ResultadoSala> {
  return ejecutarEnSala(datos, (b) => tomarDireccion(HABILITACIONES, RELOJ, b), 'direccion-tomada')
}

export async function accionFinalizar(datos: FormData) {
  await ejecutar(
    datos,
    (b) => conAviso(AVISO_EN_VIVO, after, b.asambleaId, () => finalizar(HABILITACIONES, RELOJ, b)),
    'asamblea-finalizada',
    'acta',
  )
}

// Oposición ------------------------------------------------------------------

export async function accionOponerme(datos: FormData) {
  await ejecutar(
    datos,
    (b) =>
      oponerme(HABILITACIONES, RELOJ, {
        ...b,
        puntoId: texto(datos, 'punto'),
        unidadId: texto(datos, 'unidad'),
      }),
    'oposicion-registrada',
  )
}

export async function accionOposicionEnPapel(datos: FormData) {
  const [unidadId, personaId] = par(datos, 'ausente')
  await ejecutar(
    datos,
    (b) =>
      registrarOposicionEnPapel(HABILITACIONES, RELOJ, {
        ...b,
        puntoId: texto(datos, 'punto'),
        unidadId,
        personaId,
      }),
    'oposicion-registrada',
  )
}

// Acta -----------------------------------------------------------------------

/** Se guarda sola mientras se escribe: no refresca la sala de nadie, ni avisa si salió bien. */
export async function accionObservacion(datos: FormData): Promise<ResultadoSala> {
  return ejecutarEnSala(
    datos,
    (b) =>
      guardarObservacion(HABILITACIONES, RELOJ, {
        ...b,
        texto: String(datos.get('texto') ?? ''),
      }),
    'observacion-guardada',
  )
}

export async function accionNotas(datos: FormData): Promise<ResultadoSala> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')
  try {
    await guardarNotas(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: texto(datos, 'consorcio'),
      asambleaId: texto(datos, 'asamblea'),
      puntoId: texto(datos, 'punto'),
      notas: String(datos.get('notas') ?? ''),
    })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    return { ok: false, error: error.mensajeParaUsuario }
  }
  return { ok: true, mensaje: '' }
}

export async function accionResumen(datos: FormData) {
  await ejecutar(
    datos,
    async (b) => {
      for (const puntoId of datos.getAll('punto').map(String)) {
        await redactarResumen(HABILITACIONES, RELOJ, {
          ...b,
          puntoId,
          resumen: String(datos.get(`resumen-${puntoId}`) ?? ''),
        })
      }
    },
    'resumen-guardado',
    'acta',
  )
}

export async function accionPedirBorrador(datos: FormData) {
  await ejecutar(datos, (b) => pedirBorrador(HABILITACIONES, RELOJ, b), 'borrador-pedido', 'acta')
}

export async function accionFirmantes(datos: FormData) {
  await ejecutar(
    datos,
    (b) =>
      designarFirmantes(HABILITACIONES, RELOJ, {
        ...b,
        propietarios: datos.getAll('propietario').map(String),
      }),
    'firmantes-designados',
    'acta',
  )
}

const ACTA = { generador: GENERADOR_DOCUMENTOS, almacen: ALMACEN }

export async function accionEnviarAFirmar(datos: FormData) {
  await ejecutar(
    datos,
    (b) => enviarAFirmar(HABILITACIONES, RELOJ, ACTA, b),
    'acta-enviada',
    'acta',
  )
}

export async function accionFirmar(datos: FormData) {
  await ejecutar(
    datos,
    (b) =>
      firmar(
        HABILITACIONES,
        RELOJ,
        { ...ACTA, derivador: DERIVADOR },
        {
          ...b,
          contrasena: String(datos.get('contrasena') ?? ''),
        },
      ),
    'acta-firmada',
    'acta',
  )
}

export async function accionReemplazarFirmante(datos: FormData) {
  await ejecutar(
    datos,
    (b) =>
      reemplazarFirmante(HABILITACIONES, RELOJ, {
        ...b,
        firmanteId: texto(datos, 'firmante'),
        nuevoUsuarioId: texto(datos, 'nuevo'),
      }),
    'firmante-reemplazado',
    'acta',
  )
}
