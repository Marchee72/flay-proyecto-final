import { ErrorDeAplicacion } from '@/compartido/errores'
import { Decimal, importe, type Importe } from '@/compartido/dinero'
import { exigirSumaExacta } from '@/dominio/coeficientes/suma'

/**
 * Prorrateo de expensas (`RF-07`, reglas RN-01, RN-05 y RN-07 § 7.2).
 *
 * Vive en el dominio y **no conoce la base, ni el entorno web, ni el mapeador**
 * (Principio III): recibe totales y un padron, y devuelve el detalle por unidad.
 * Es lo que permite ejercitarlo mil veces sin que cueste, que es la unica
 * defensa real contra el riesgo RT-01.
 *
 * Los importes entran como cadena y salen como cadena con decimales fijos.
 * Ninguna firma acepta ni devuelve el tipo numerico nativo (medida 1 de § 14.1).
 */

const DECIMALES_IMPORTE = 2
const DECIMALES_COEFICIENTE = 8

/** Lo que el redondeo puede dejar sin repartir, por unidad. Mas es un defecto. */
const TOLERANCIA_POR_UNIDAD = '0.01'

const CIEN = new Decimal(100)

export interface UnidadDelPadron {
  unidadId: string
  designacion: string
  coeficiente: string
}

export interface EntradaDeProrrateo {
  padron: readonly UnidadDelPadron[]
  totalOrdinario: string
  totalExtraordinario: string
  /** Sólo para probar el aborto; en produccion es el centavo por unidad. */
  toleranciaPorUnidad?: string
}

export interface DetalleProrrateado {
  unidadId: string
  designacion: string
  coeficienteAplicado: string
  importeOrdinario: string
  importeExtraordinario: string
  /** Campo propio: no esta sumado a los importes (regla RN-07 § 7.2). */
  ajusteRedondeo: string
  totalUnidad: string
}

export interface ResultadoDeProrrateo {
  detalles: DetalleProrrateado[]
  totalOrdinario: string
  totalExtraordinario: string
  totalGeneral: string
}

export class PadronVacio extends ErrorDeAplicacion {
  constructor() {
    super('El consorcio no tiene unidades cargadas: no hay entre quiénes repartir.', 'RN-01')
  }
}

export class DiferenciaDeRedondeoInaceptable extends ErrorDeAplicacion {
  constructor(diferencia: Importe, unidades: number, tolerancia: Importe) {
    super(
      `El reparto dejó una diferencia de ${diferencia.toFixed(DECIMALES_IMPORTE)} sobre ` +
        `${unidades} unidades, y el máximo aceptable es ${tolerancia.toFixed(DECIMALES_IMPORTE)}. ` +
        'Eso no es redondeo: la liquidación no se emite.',
      'RN-07',
      { diferencia: diferencia.toFixed(DECIMALES_IMPORTE), unidades },
    )
  }
}

/** Reparto de un total, redondeado **solo al final** de cada importe unitario. */
function repartir(total: Importe, padron: readonly UnidadDelPadron[]): Importe[] {
  return padron.map((unidad) =>
    total.times(importe(unidad.coeficiente)).div(CIEN).toDecimalPlaces(DECIMALES_IMPORTE),
  )
}

/**
 * La unidad que absorbe la diferencia: la de mayor coeficiente, y ante empate
 * la de identificador menor. El desempate no es un detalle: sin el, dos
 * ejecuciones del mismo padron pueden dar resultados distintos.
 */
function unidadQueAbsorbe(padron: readonly UnidadDelPadron[]): number {
  let elegida = 0

  padron.forEach((unidad, i) => {
    const actual = importe(unidad.coeficiente)
    const mejor = importe(padron[elegida].coeficiente)

    if (actual.greaterThan(mejor)) elegida = i
    else if (actual.equals(mejor) && unidad.unidadId < padron[elegida].unidadId) elegida = i
  })

  return elegida
}

export function prorratear(entrada: EntradaDeProrrateo): ResultadoDeProrrateo {
  if (entrada.padron.length === 0) throw new PadronVacio()

  // Antes de calcular nada (FR-006): si el padron no cierra, el mensaje dice
  // cuanto falta y sobre cuantas unidades, y no se toca un solo importe.
  exigirSumaExacta(
    entrada.padron.map((unidad) => ({
      designacion: unidad.designacion,
      coeficiente: importe(unidad.coeficiente),
    })),
  )

  const totalOrdinario = importe(entrada.totalOrdinario)
  const totalExtraordinario = importe(entrada.totalExtraordinario)

  const ordinarios = repartir(totalOrdinario, entrada.padron)
  const extraordinarios = repartir(totalExtraordinario, entrada.padron)

  const sobra = (total: Importe, partes: Importe[]) =>
    total.minus(partes.reduce((suma, parte) => suma.plus(parte), new Decimal(0)))

  const diferencia = sobra(totalOrdinario, ordinarios).plus(
    sobra(totalExtraordinario, extraordinarios),
  )

  const tolerancia = importe(entrada.toleranciaPorUnidad ?? TOLERANCIA_POR_UNIDAD).times(
    entrada.padron.length,
  )

  if (diferencia.abs().greaterThan(tolerancia)) {
    throw new DiferenciaDeRedondeoInaceptable(diferencia, entrada.padron.length, tolerancia)
  }

  const absorbe = unidadQueAbsorbe(entrada.padron)

  const detalles = entrada.padron.map((unidad, i) => {
    const ajuste = i === absorbe ? diferencia : new Decimal(0)
    const total = ordinarios[i].plus(extraordinarios[i]).plus(ajuste)

    return {
      unidadId: unidad.unidadId,
      designacion: unidad.designacion,
      coeficienteAplicado: importe(unidad.coeficiente).toFixed(DECIMALES_COEFICIENTE),
      importeOrdinario: ordinarios[i].toFixed(DECIMALES_IMPORTE),
      importeExtraordinario: extraordinarios[i].toFixed(DECIMALES_IMPORTE),
      ajusteRedondeo: ajuste.toFixed(DECIMALES_IMPORTE),
      totalUnidad: total.toFixed(DECIMALES_IMPORTE),
    }
  })

  return {
    detalles,
    totalOrdinario: totalOrdinario.toFixed(DECIMALES_IMPORTE),
    totalExtraordinario: totalExtraordinario.toFixed(DECIMALES_IMPORTE),
    totalGeneral: totalOrdinario.plus(totalExtraordinario).toFixed(DECIMALES_IMPORTE),
  }
}
