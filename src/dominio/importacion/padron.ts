import { Decimal } from '@/compartido/dinero'
import { DECIMALES, sumarCoeficientes } from '@/dominio/coeficientes/suma'
import { TIPOS_UNIDAD, type TipoUnidad } from '@/dominio/unidades/tipo'

import { leerCoeficiente, leerDni } from './celdas'
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

/** Padrón completo desde una planilla (RF-02): todo o nada, y todos los errores juntos. */
export const COLUMNAS_PADRON: readonly Columna[] = [
  { clave: 'designacion', titulo: 'Designación', obligatoria: true },
  { clave: 'tipo', titulo: 'Tipo', obligatoria: false },
  { clave: 'coeficiente', titulo: 'Coeficiente', obligatoria: true },
  ...COLUMNAS_PERSONA,
]

export interface UnidadDelArchivo {
  fila: number
  designacion: string
  tipo: TipoUnidad
  coeficiente: string
  persona: PersonaDelArchivo | null
}
export interface ResumenPadron {
  unidades: number
  suma: string
  duenos: number
  sinIdentificar: number
}
export interface PadronValido {
  unidades: UnidadDelArchivo[]
  nuevas: PersonaDelArchivo[]
  duenoPorFila: Map<number, PersonaResuelta>
  resumen: ResumenPadron
}

export function validarPadron(
  planilla: PlanillaLeida,
  contexto: {
    unidadesExistentes: number
    archivado: boolean
    personasConocidas: readonly PersonaConocida[]
  },
): Validacion<PadronValido> {
  if (contexto.archivado)
    return {
      ok: false,
      errores: [
        { fila: null, mensaje: 'Este consorcio está archivado: no se puede cargar su padrón.' },
      ],
    }
  if (contexto.unidadesExistentes > 0)
    return {
      ok: false,
      errores: [
        {
          fila: null,
          mensaje:
            'Este consorcio ya tiene unidades cargadas. Para cambiar alguna, usá «Editar padrón».',
        },
      ],
    }
  const cols = columnasDe(planilla, COLUMNAS_PADRON)
  if (!cols.ok) return cols
  const { valor, filas } = cols.valor

  const errores: ErrorDeFila[] = []
  const unidades: UnidadDelArchivo[] = []
  const vistas = new Set<string>()
  let errorDeCoeficiente = false

  for (const f of filas) {
    const fila = f.numero
    const designacion = valor(f, 'designacion')
    if (designacion === '')
      errores.push({ fila, columna: 'Designación', mensaje: 'falta la designación.' })
    else {
      const k = normalizarTexto(designacion).replace(/ /g, '')
      if (vistas.has(k))
        errores.push({
          fila,
          columna: 'Designación',
          mensaje: `la designación «${designacion}» está repetida.`,
        })
      vistas.add(k)
    }

    const tipoTexto = valor(f, 'tipo')
    const tipo = tipoTexto === '' ? 'departamento' : normalizarTexto(tipoTexto)
    if (!(TIPOS_UNIDAD as readonly string[]).includes(tipo))
      errores.push({
        fila,
        columna: 'Tipo',
        mensaje: `el tipo «${tipoTexto}» no existe. Usá ${TIPOS_UNIDAD.join(', ').replace(/, (\w+)$/, ' o $1')}.`,
      })

    const coef = leerCoeficiente(valor(f, 'coeficiente'))
    if ('error' in coef) {
      errorDeCoeficiente = true
      errores.push({ fila, columna: 'Coeficiente', mensaje: coef.error })
    }

    const dniTexto = valor(f, 'dni')
    let dni: string | null = null
    if (dniTexto !== '') {
      const d = leerDni(dniTexto)
      if ('error' in d) errores.push({ fila, columna: 'DNI', mensaje: d.error })
      else dni = d.valor
    }
    const nombre = valor(f, 'nombre')
    const apellido = valor(f, 'apellido')
    const correo = valor(f, 'correo') || null
    const telefono = valor(f, 'telefono') || null
    const hayPersona = [nombre, apellido, dniTexto, correo, telefono].some((x) => x)
    unidades.push({
      fila,
      designacion,
      tipo: tipo as TipoUnidad,
      coeficiente: 'valor' in coef ? coef.valor : '',
      persona: hayPersona ? { nombre, apellido, dni, correo, telefono } : null,
    })
  }

  const conPersona = unidades.flatMap((u) =>
    u.persona ? [{ fila: u.fila, persona: u.persona }] : [],
  )
  const personas = resolverPersonas(conPersona, contexto.personasConocidas)
  if (!personas.ok) errores.push(...personas.errores)

  if (!errorDeCoeficiente) {
    const suma = sumarCoeficientes(
      unidades.map((u) => ({
        designacion: u.designacion,
        coeficiente: new Decimal(u.coeficiente),
      })),
    )
    if (!suma.cuadra) {
      const falta = suma.diferencia.isNegative()
      errores.push({
        fila: null,
        mensaje: `La suma da ${suma.total.toFixed(DECIMALES)} %: ${falta ? 'faltan' : 'sobran'} ${suma.diferencia.abs().toFixed(DECIMALES)} % para ${falta ? 'llegar a' : 'bajar a'} 100.`,
      })
    }
  }
  errores.sort((a, b) => (a.fila ?? Infinity) - (b.fila ?? Infinity))
  if (errores.length || !personas.ok) return { ok: false, errores }

  const total = sumarCoeficientes(
    unidades.map((u) => ({ designacion: u.designacion, coeficiente: new Decimal(u.coeficiente) })),
  ).total
  const duenos = new Set(
    [...personas.valor.porFila.values()].map((r) =>
      'existente' in r ? `e${r.existente}` : `n${r.nueva}`,
    ),
  ).size
  return {
    ok: true,
    valor: {
      unidades,
      nuevas: personas.valor.nuevas,
      duenoPorFila: personas.valor.porFila,
      resumen: {
        unidades: unidades.length,
        suma: total.toFixed(DECIMALES),
        duenos,
        sinIdentificar: personas.valor.sinIdentificar,
      },
    },
  }
}
