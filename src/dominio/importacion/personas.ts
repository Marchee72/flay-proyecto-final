import { errorDeCorreo } from '@/dominio/identidad/correo'

import { leerDni } from './celdas'
import {
  normalizarTexto,
  type Columna,
  type ErrorDeFila,
  type PlanillaLeida,
  type Validacion,
} from './planilla'

/**
 * Dueños y ocupantes que vienen en una planilla (RF-02, RF-03). Una persona se
 * identifica por correo y, si no, por DNI; sin ninguno es una persona nueva cada
 * vez. Ningún mensaje dice nada de la persona ya guardada.
 */
export const COLUMNAS_PERSONA: readonly Columna[] = [
  { clave: 'nombre', titulo: 'Nombre', obligatoria: false },
  { clave: 'apellido', titulo: 'Apellido', obligatoria: false },
  { clave: 'dni', titulo: 'DNI', obligatoria: false },
  { clave: 'correo', titulo: 'Correo', obligatoria: false },
  { clave: 'telefono', titulo: 'Teléfono', obligatoria: false },
]

export interface PersonaDelArchivo {
  nombre: string
  apellido: string
  /** Ya normalizado (solo dígitos). */
  dni: string | null
  correo: string | null
  telefono: string | null
}
export interface PersonaConocida {
  id: string
  nombre: string
  apellido: string
  dni: string | null
  correo: string | null
}
/** `existente`: id de Persona; `nueva`: índice en `nuevas`. */
export type PersonaResuelta = { existente: string } | { nueva: number }

const clave = (s: string) => s.trim().toLowerCase()

/** Los correos y DNI válidos de la planilla, para buscar de una vez a quién ya existe. */
export function identificadoresDePersonas(planilla: PlanillaLeida): {
  correos: string[]
  dnis: string[]
} {
  const posicion = (titulo: string) =>
    planilla.encabezados.findIndex((h) => normalizarTexto(h) === normalizarTexto(titulo))
  const iCorreo = posicion('Correo')
  const iDni = posicion('DNI')
  const correos = new Set<string>()
  const dnis = new Set<string>()
  for (const f of planilla.filas) {
    const c = iCorreo < 0 ? '' : (f.celdas[iCorreo] ?? '')
    if (c.trim() !== '' && errorDeCorreo(c) === null) correos.add(clave(c))
    const d = iDni < 0 ? '' : (f.celdas[iDni] ?? '')
    const dni = leerDni(d)
    if ('valor' in dni) dnis.add(dni.valor)
  }
  return { correos: [...correos], dnis: [...dnis] }
}

interface Visto {
  correo: string | null
  dni: string | null
  ref: PersonaResuelta
  nombre: string
}
const refKey = (r: PersonaResuelta) => ('existente' in r ? `e${r.existente}` : `n${r.nueva}`)

export function resolverPersonas(
  filas: readonly { fila: number; persona: PersonaDelArchivo }[],
  conocidas: readonly PersonaConocida[],
): Validacion<{
  nuevas: PersonaDelArchivo[]
  porFila: Map<number, PersonaResuelta>
  sinIdentificar: number
}> {
  const errores: ErrorDeFila[] = []
  const nuevas: PersonaDelArchivo[] = []
  const porFila = new Map<number, PersonaResuelta>()
  let sinIdentificar = 0

  const porCorreo = new Map<string, Visto>()
  const porDni = new Map<string, Visto>()
  const nombreDe = (n: string, a: string) => normalizarTexto(`${n} ${a}`)
  for (const c of conocidas) {
    const v: Visto = {
      ref: { existente: c.id },
      nombre: nombreDe(c.nombre, c.apellido),
      correo: c.correo ? clave(c.correo) : null,
      dni: c.dni,
    }
    if (c.correo) porCorreo.set(clave(c.correo), v)
    if (c.dni) porDni.set(c.dni, v)
  }

  for (const { fila, persona } of filas) {
    const antes = errores.length
    if (persona.nombre.trim() === '')
      errores.push({ fila, columna: 'Nombre', mensaje: 'falta el nombre del dueño.' })
    if (persona.apellido.trim() === '')
      errores.push({ fila, columna: 'Apellido', mensaje: 'falta el apellido del dueño.' })
    if (persona.correo !== null) {
      const m = errorDeCorreo(persona.correo)
      if (m) errores.push({ fila, columna: 'Correo', mensaje: m })
    }
    if (errores.length > antes) continue

    const correo = persona.correo === null ? null : clave(persona.correo)
    const dni = persona.dni
    const nombre = nombreDe(persona.nombre, persona.apellido)
    const vCorreo = correo === null ? undefined : porCorreo.get(correo)
    const vDni = dni === null ? undefined : porDni.get(dni)

    if (vCorreo && vDni && refKey(vCorreo.ref) !== refKey(vDni.ref)) {
      errores.push({
        fila,
        columna: 'Correo',
        mensaje: 'El correo y el DNI de esta fila pertenecen a personas distintas; revisalos.',
      })
      continue
    }
    const visto = vCorreo ?? vDni
    if (visto && visto.nombre !== nombre) {
      const que = vCorreo ? 'correo' : 'DNI'
      errores.push({
        fila,
        columna: vCorreo ? 'Correo' : 'DNI',
        mensaje: `El ${que} ya está registrado a nombre de otra persona; revisalo.`,
      })
      continue
    }

    if (
      visto &&
      ((correo !== null && visto.correo !== null && correo !== visto.correo) ||
        (dni !== null && visto.dni !== null && dni !== visto.dni))
    ) {
      errores.push({
        fila,
        columna: 'DNI',
        mensaje: 'El DNI y el correo de esta fila no corresponden a la misma persona; revisalos.',
      })
      continue
    }

    let ref: PersonaResuelta
    if (visto) ref = visto.ref
    else {
      ref = { nueva: nuevas.length }
      nuevas.push(persona)
      if (correo === null && dni === null) sinIdentificar++
    }
    porFila.set(fila, ref)
    const v: Visto = visto ?? { ref, nombre, correo, dni }
    v.correo ??= correo
    v.dni ??= dni
    if (correo !== null) porCorreo.set(correo, v)
    if (dni !== null) porDni.set(dni, v)
  }

  return errores.length
    ? { ok: false, errores }
    : { ok: true, valor: { nuevas, porFila, sinIdentificar } }
}
