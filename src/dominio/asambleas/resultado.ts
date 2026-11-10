import { Decimal } from '@/compartido/dinero'

/**
 * Resultado de un punto del orden del día (FR-024, FR-025, research R-05).
 *
 * Doble cómputo: por unidades y por coeficientes, los dos a la vez (CCyC art.
 * 2060). Todo en `Decimal` y sin dividir: los umbrales se comparan
 * multiplicando, así no hay redondeo en ningún paso. Se calcula siempre sobre
 * el padrón **congelado** al abrir (research R-03), nunca sobre el vivo.
 */

export type Sentido = 'positivo' | 'negativo' | 'abstencion'
export type Mayoria = 'absoluta' | 'dos_tercios' | 'unanimidad'
export type Regla = 'presentes' | 'totalidad'

export interface UnidadPadron {
  unidadId: string
  coeficiente: Decimal
  presente: boolean
  sinVoto: boolean
}

export interface Voto {
  unidadId: string
  sentido?: Sentido
  opcionId?: string
}

export interface Cuenta {
  unidades: number
  coeficiente: Decimal
}

export interface Conteo {
  /** Por sentido (binario) o por id de opción (opción múltiple). */
  porOpcion: Record<string, Cuenta>
  /** Unidades presentes con voto. */
  basePresentes: Cuenta
  /** Todas las unidades con voto, presentes o no. */
  baseTotal: Cuenta
}

const vacia = (): Cuenta => ({ unidades: 0, coeficiente: new Decimal(0) })

const sumar = (cuenta: Cuenta, coeficiente: Decimal): Cuenta => ({
  unidades: cuenta.unidades + 1,
  coeficiente: cuenta.coeficiente.plus(coeficiente),
})

const conVoto = (u: UnidadPadron) => !u.sinVoto

/**
 * Cuenta los votos válidos: los de unidades presentes y con voto. La base
 * rechaza otros votos (disparador), pero el cómputo no confía en eso.
 */
export function conteo(padron: UnidadPadron[], votos: Voto[], claves: string[] = []): Conteo {
  const porUnidad = new Map(padron.map((u) => [u.unidadId, u]))
  const porOpcion: Record<string, Cuenta> = {}
  for (const clave of claves) porOpcion[clave] = vacia()

  for (const voto of votos) {
    const unidad = porUnidad.get(voto.unidadId)
    if (!unidad || !unidad.presente || unidad.sinVoto) continue
    const clave = voto.sentido ?? voto.opcionId
    if (!clave) continue
    porOpcion[clave] = sumar(porOpcion[clave] ?? vacia(), unidad.coeficiente)
  }

  let basePresentes = vacia()
  let baseTotal = vacia()
  for (const u of padron.filter(conVoto)) {
    baseTotal = sumar(baseTotal, u.coeficiente)
    if (u.presente) basePresentes = sumar(basePresentes, u.coeficiente)
  }
  return { porOpcion, basePresentes, baseTotal }
}

function alcanza(favor: Decimal, base: Decimal, mayoria: Mayoria): boolean {
  if (base.lessThanOrEqualTo(0)) return false
  switch (mayoria) {
    case 'absoluta':
      return favor.times(2).greaterThan(base)
    case 'dos_tercios':
      return favor.times(3).greaterThanOrEqualTo(base.times(2))
    case 'unanimidad':
      return favor.equals(base)
  }
}

/** El umbral en los **dos** cómputos. */
export const alcanzaUmbral = (favor: Cuenta, base: Cuenta, mayoria: Mayoria): boolean =>
  alcanza(new Decimal(favor.unidades), new Decimal(base.unidades), mayoria) &&
  alcanza(favor.coeficiente, base.coeficiente, mayoria)

const SENTIDOS: Sentido[] = ['positivo', 'negativo', 'abstencion']

/**
 * Con la regla «totalidad», lo que la mayoría de los presentes aprueba sin
 * alcanzar la del total queda **provisorio**: se notifica a los ausentes y
 * corre el plazo de oposición (FR-027).
 */
export function resultadoBinario(
  padron: UnidadPadron[],
  votos: Voto[],
  mayoria: Mayoria,
  regla: Regla,
): { resultado: 'aprobado' | 'rechazado'; provisorio: boolean; conteo: Conteo } {
  const c = conteo(padron, votos, SENTIDOS)
  const positivos = c.porOpcion.positivo
  const sobrePresentes = alcanzaUmbral(positivos, c.basePresentes, mayoria)

  if (regla === 'presentes') {
    return { resultado: sobrePresentes ? 'aprobado' : 'rechazado', provisorio: false, conteo: c }
  }
  if (alcanzaUmbral(positivos, c.baseTotal, mayoria)) {
    return { resultado: 'aprobado', provisorio: false, conteo: c }
  }
  return {
    resultado: sobrePresentes ? 'aprobado' : 'rechazado',
    provisorio: sobrePresentes,
    conteo: c,
  }
}

/** La única clave con el valor máximo, o `undefined` si nadie votó o hay empate. */
function unicoMaximo(claves: string[], valor: (clave: string) => Decimal): string | undefined {
  let mejor: string | undefined
  let empate = false
  for (const clave of claves) {
    const v = valor(clave)
    if (v.lessThanOrEqualTo(0)) continue
    if (mejor === undefined || v.greaterThan(valor(mejor))) {
      mejor = clave
      empate = false
    } else if (v.equals(valor(mejor))) {
      empate = true
    }
  }
  return empate ? undefined : mejor
}

/**
 * Pluralidad (decisión del usuario): gana la más votada si lo es en unidades
 * **y** en coeficientes. Si los cómputos discrepan o hay empate en el primer
 * lugar, no hay decisión. Siempre firme al cerrar.
 */
export function resultadoOpcionMultiple(
  padron: UnidadPadron[],
  votos: Voto[],
  opciones: string[],
): { resultado: 'aprobado' | 'sin_decision'; opcionGanadoraId?: string; conteo: Conteo } {
  const c = conteo(padron, votos, opciones)
  const porUnidades = unicoMaximo(opciones, (o) => new Decimal(c.porOpcion[o].unidades))
  const porCoeficientes = unicoMaximo(opciones, (o) => c.porOpcion[o].coeficiente)
  if (porUnidades && porUnidades === porCoeficientes) {
    return { resultado: 'aprobado', opcionGanadoraId: porUnidades, conteo: c }
  }
  return { resultado: 'sin_decision', opcionGanadoraId: undefined, conteo: c }
}
