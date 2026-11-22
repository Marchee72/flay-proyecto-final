import type { TipoOcupacionVigencia as TipoDeOcupacion } from '@/dominio/ocupaciones/vigencia'
import { errorDeFinDeAlquiler } from '@/dominio/ocupaciones/vigencia'

import { leerDni, leerFecha } from './celdas'
import {
  COLUMNAS_PERSONA,
  resolverPersonas,
  type PersonaConocida,
  type PersonaDelArchivo,
  type PersonaResuelta,
} from './personas'
import {
  columnasDe,
  normalizarTexto,
  type Columna,
  type ErrorDeFila,
  type PlanillaLeida,
  type Validacion,
} from './planilla'

/**
 * Propietarios e inquilinos desde una planilla (RF-03): todo o nada. Lo que ya
 * está cargado (misma persona, unidad y vínculo en fechas que se tocan) no es
 * error ni se duplica: cuenta como «ya estaban», así subir el mismo archivo dos
 * veces no cambia nada. Dos inquilinos que se superponen sí son error (RN-09).
 */
export const COLUMNAS_OCUPANTES: readonly Columna[] = [
  { clave: 'unidad', titulo: 'Unidad', obligatoria: true },
  { clave: 'vinculo', titulo: 'Vínculo', obligatoria: true },
  ...COLUMNAS_PERSONA.map((c) =>
    c.clave === 'nombre' || c.clave === 'apellido' ? { ...c, obligatoria: true } : c,
  ),
  { clave: 'desde', titulo: 'Desde', obligatoria: false },
  { clave: 'hasta', titulo: 'Hasta', obligatoria: false },
]

/** Fechas `AAAA-MM-DD`; `hasta` inclusivo, nulo sin fin. */
export interface OcupacionExistente {
  unidadId: string
  personaId: string
  tipo: TipoDeOcupacion
  desde: string
  hasta: string | null
}
export interface OcupanteDelArchivo {
  fila: number
  unidadId: string
  vinculo: TipoDeOcupacion
  desde: string
  hasta: string | null
  persona: PersonaDelArchivo
}
export interface ResumenOcupantes {
  propietarios: number
  inquilinos: number
  yaEstaban: number
  sinIdentificar: number
}
export interface OcupantesValidos {
  aCrear: OcupanteDelArchivo[]
  /** Filas que no se escriben porque ya estaban cargadas. */
  yaEstaban: number[]
  nuevas: PersonaDelArchivo[]
  porFila: Map<number, PersonaResuelta>
  resumen: ResumenOcupantes
}

const VINCULOS: readonly TipoDeOcupacion[] = ['propietario', 'inquilino']
const sinFin = (hasta: string | null) => hasta ?? '9999-12-31'
const seTocan = (
  a: { desde: string; hasta: string | null },
  b: { desde: string; hasta: string | null },
) => a.desde <= sinFin(b.hasta) && b.desde <= sinFin(a.hasta)
const designacion = (s: string) => normalizarTexto(s).replace(/ /g, '')
const claveDe = (r: PersonaResuelta) => ('existente' in r ? `e${r.existente}` : `n${r.nueva}`)

export function validarOcupantes(
  planilla: PlanillaLeida,
  contexto: {
    hoy: string
    archivado: boolean
    unidades: readonly { id: string; designacion: string }[]
    ocupaciones: readonly OcupacionExistente[]
    personasConocidas: readonly PersonaConocida[]
  },
): Validacion<OcupantesValidos> {
  const deArchivo = (mensaje: string) => ({
    ok: false as const,
    errores: [{ fila: null, mensaje }],
  })
  if (contexto.archivado)
    return deArchivo('Este consorcio está archivado: no se pueden cargar sus ocupantes.')
  if (contexto.unidades.length === 0) return deArchivo('Primero cargá el padrón.')
  const cols = columnasDe(planilla, COLUMNAS_OCUPANTES)
  if (!cols.ok) return cols
  const { valor, filas } = cols.valor

  const unidadPor = new Map(contexto.unidades.map((u) => [designacion(u.designacion), u.id]))
  const errores: ErrorDeFila[] = []
  const leidos: OcupanteDelArchivo[] = []
  const conError = new Set<number>()
  const error = (e: ErrorDeFila & { fila: number }) => {
    errores.push(e)
    conError.add(e.fila)
  }

  for (const f of filas) {
    const fila = f.numero
    const unidadTexto = valor(f, 'unidad')
    const unidadId = unidadPor.get(designacion(unidadTexto))
    if (unidadTexto === '') error({ fila, columna: 'Unidad', mensaje: 'falta la unidad.' })
    else if (!unidadId)
      error({
        fila,
        columna: 'Unidad',
        mensaje: `no hay ninguna unidad «${unidadTexto}» en este consorcio.`,
      })

    const vinculoTexto = valor(f, 'vinculo')
    const vinculo = normalizarTexto(vinculoTexto) as TipoDeOcupacion
    if (!VINCULOS.includes(vinculo))
      error({
        fila,
        columna: 'Vínculo',
        mensaje:
          vinculoTexto === ''
            ? 'falta el vínculo. Usá propietario o inquilino.'
            : `el vínculo «${vinculoTexto}» no existe. Usá propietario o inquilino.`,
      })

    let desde = contexto.hoy
    if (valor(f, 'desde') !== '') {
      const d = leerFecha(valor(f, 'desde'))
      if ('error' in d) error({ fila, columna: 'Desde', mensaje: d.error })
      else desde = d.valor
    }
    let hasta: string | null = null
    if (valor(f, 'hasta') !== '') {
      const h = leerFecha(valor(f, 'hasta'))
      if ('error' in h) error({ fila, columna: 'Hasta', mensaje: h.error })
      else {
        hasta = h.valor
        const m = errorDeFinDeAlquiler(desde, hasta)
        if (m) error({ fila, columna: 'Hasta', mensaje: m })
      }
    }

    let dni: string | null = null
    if (valor(f, 'dni') !== '') {
      const d = leerDni(valor(f, 'dni'))
      if ('error' in d) error({ fila, columna: 'DNI', mensaje: d.error })
      else dni = d.valor
    }
    leidos.push({
      fila,
      unidadId: unidadId ?? '',
      vinculo,
      desde,
      hasta,
      persona: {
        nombre: valor(f, 'nombre'),
        apellido: valor(f, 'apellido'),
        dni,
        correo: valor(f, 'correo') || null,
        telefono: valor(f, 'telefono') || null,
      },
    })
  }

  const personas = resolverPersonas(leidos, contexto.personasConocidas)
  if (!personas.ok) errores.push(...personas.errores)

  // Superposiciones: contra la base y contra las filas anteriores ya aceptadas.
  const aCrear: OcupanteDelArchivo[] = []
  const yaEstaban: number[] = []
  if (personas.ok) {
    const ocupadas: (OcupacionExistente & { clave: string; fila?: number })[] =
      contexto.ocupaciones.map((o) => ({ ...o, clave: `e${o.personaId}` }))
    for (const o of leidos) {
      if (conError.has(o.fila)) continue
      const clave = claveDe(personas.valor.porFila.get(o.fila)!)
      const mismas = ocupadas.filter(
        (x) => x.unidadId === o.unidadId && x.tipo === o.vinculo && seTocan(x, o),
      )
      const igual = mismas.find((x) => x.clave === clave)
      const inquilino = o.vinculo === 'inquilino' ? mismas[0] : undefined
      if (igual?.fila !== undefined)
        errores.push({ fila: o.fila, mensaje: `esta fila repite la fila ${igual.fila}.` })
      else if (igual) yaEstaban.push(o.fila)
      else if (inquilino)
        errores.push({
          fila: o.fila,
          columna: 'Desde',
          mensaje: `la unidad ya tiene un inquilino en esas fechas${inquilino.fila === undefined ? '' : ` (fila ${inquilino.fila})`}.`,
        })
      else {
        aCrear.push(o)
        ocupadas.push({ ...o, tipo: o.vinculo, personaId: '', clave, fila: o.fila })
      }
    }
  }

  errores.sort((a, b) => (a.fila ?? Infinity) - (b.fila ?? Infinity))
  if (errores.length || !personas.ok) return { ok: false, errores }

  return {
    ok: true,
    valor: {
      aCrear,
      yaEstaban,
      nuevas: personas.valor.nuevas,
      porFila: personas.valor.porFila,
      resumen: {
        propietarios: aCrear.filter((o) => o.vinculo === 'propietario').length,
        inquilinos: aCrear.filter((o) => o.vinculo === 'inquilino').length,
        yaEstaban: yaEstaban.length,
        sinIdentificar: personas.valor.sinIdentificar,
      },
    },
  }
}
