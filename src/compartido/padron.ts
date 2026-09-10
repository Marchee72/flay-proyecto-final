import { Decimal, importe, type Importe } from './dinero'

/**
 * Tres ayudas para cargar un padron sin hacer la aritmetica a mano.
 *
 * Ninguna afloja el invariante: la suma sigue teniendo que dar exactamente
 * `100.00000000` y quien la impone es el disparador de la base (FR-011c). Esto
 * es la pantalla ayudando a llegar ahi, que es distinto (RNF-10).
 *
 * Va en `compartido` porque lo usa un componente de cliente, y presentacion no
 * importa dominio (§ 12.1.2).
 */

export interface FilaDePadron {
  designacion: string
  coeficiente: string
}

const DECIMAL = /^\d+([.,]\d{1,8})?$/

/** De menos a mas: se usa el primero que reparta sin desacomodar a nadie. */
const DECIMALES_POSIBLES = [2, 3, 4, 6, 8]

/**
 * Lo que una unidad puede absorber sin que deje de ser redondeo: el 1 % de lo
 * suyo. Es la linea entre acomodar centavos y cobrarle de mas a un vecino, y la
 * usan tanto el generador como el ajuste.
 */
const TOLERANCIA = '0.01'

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

const designacionDe = (piso: number, unidad: number, porPiso: number) =>
  porPiso <= LETRAS.length ? `${piso}${LETRAS[unidad]}` : `${piso}-${unidad + 1}`

/**
 * Padron parejo: tantos pisos por tantas unidades iguales cada uno, que es como
 * esta hecho casi cualquier edificio en altura.
 *
 * **Usa los menos decimales que alcancen.** Tres unidades son
 * `33.34 / 33.33 / 33.33`, no `33.33333334 / 33.33333333 / 33.33333333`:
 * escribir ocho decimales donde bastan dos no agrega exactitud, agrega ruido.
 * Doce unidades tambien entran en dos decimales, con una en `8.37`.
 *
 * Se baja a mas precision solo cuando con menos el sobrante deja de ser un
 * redondeo. Noventa y seis unidades con dos decimales dejarian `0.16 %` sobre
 * una sola, que pasaria a pagar un 15 % mas que sus iguales; con seis, el
 * sobrante es `0.000064 %` y nadie lo nota. Ahi esta la diferencia entre
 * redondear y cobrarle de mas a un vecino.
 */
export function padronPorPisos(pisos: number, porPiso: number, objetivo: Importe): FilaDePadron[] {
  const total = pisos * porPiso
  if (!Number.isInteger(total) || total < 1) return []

  const decimales =
    DECIMALES_POSIBLES.find((cantidad) => sobranteTolerable(objetivo, total, cantidad)) ??
    DECIMALES_POSIBLES[DECIMALES_POSIBLES.length - 1]

  const parejo = corte(objetivo, total, decimales)
  const sobrante = objetivo.minus(parejo.times(total))

  return Array.from({ length: total }, (_, i) => ({
    designacion: designacionDe(Math.floor(i / porPiso) + 1, i % porPiso, porPiso),
    // El sobrante va entero a la primera, que asi queda siendo la de mayor
    // coeficiente: la misma unidad que elegiria `ajustePorRedondeo`.
    coeficiente: (i === 0 ? parejo.plus(sobrante) : parejo).toFixed(decimales),
  }))
}

/** Reparto parejo, truncado: lo que falta se reparte despues, nunca de mas. */
const corte = (objetivo: Importe, total: number, decimales: number) =>
  objetivo.div(total).toDecimalPlaces(decimales, Decimal.ROUND_DOWN)

/** Que la unidad que absorbe el sobrante no se despegue de las demas. */
function sobranteTolerable(objetivo: Importe, total: number, decimales: number): boolean {
  const parejo = corte(objetivo, total, decimales)
  const sobrante = objetivo.minus(parejo.times(total))
  return sobrante.lessThanOrEqualTo(parejo.times(TOLERANCIA))
}

/**
 * Pegado desde una planilla. Acepta tabulacion, punto y coma o coma como
 * separador, y coma decimal, que es lo que sale de una planilla en español.
 *
 * De cada linea toma el **ultimo campo que es un numero** y el campo anterior
 * como designacion: asi entra tal cual el padron del reglamento, que suele
 * traer columnas de mas (`consorcio;unidad;coeficiente;ocupacion;...`). Una
 * linea sin numero —el encabezado— se ignora en vez de romper el pegado.
 */
export function filasDesdePegado(texto: string): FilaDePadron[] {
  const filas: FilaDePadron[] = []

  for (const linea of texto.split(/\r?\n/)) {
    if (linea.trim() === '') continue

    const campos = (/[\t;]/.test(linea) ? linea.split(/[\t;]/) : linea.split(',')).map((campo) =>
      campo.trim(),
    )

    let indice = -1
    campos.forEach((campo, i) => {
      if (DECIMAL.test(campo)) indice = i
    })
    if (indice < 0) continue

    const designacion = indice > 0 ? campos[indice - 1] : (campos[1] ?? '')
    filas.push({ designacion, coeficiente: campos[indice].replace(',', '.') })
  }

  return filas
}

export interface Ajuste {
  indice: number
  designacion: string
  anterior: string
  nuevo: string
  diferencia: string
}

/**
 * La precision del padron es la del coeficiente mas fino, entre dos y ocho. La
 * pantalla muestra la suma con esa misma precision: un padron de dos decimales
 * no tiene por que leerse con seis ceros de relleno.
 */
export function decimalesDelPadron(coeficientes: readonly string[]): number {
  const usados = coeficientes.map((valor) => (valor.split('.')[1] ?? '').length)
  return Math.min(8, Math.max(2, ...usados))
}

/**
 * La diferencia que deja el redondeo se asigna a la unidad de mayor
 * coeficiente, que es la misma regla con la que se reparte el redondeo de una
 * liquidacion (invariante 3).
 *
 * El limite es el ultimo digito **que el padron use**, por unidad: en uno de
 * dos decimales el redondeo deja centesimas, y en uno de ocho, cienmillonesimas.
 * Con un limite fijo, uno de los dos casos quedaria sin ayuda.
 *
 * Y ademas: la unidad que absorbe no puede moverse mas de un 1 % de lo suyo. Es
 * lo que separa redondear de cobrarle de mas a un vecino —96 unidades de dos
 * decimales dejarian `0.16 %` sobre una sola, un 15 % de su coeficiente—, y por
 * eso ahi no se ofrece nada: ese padron no esta redondeado, esta mal.
 */
export function ajustePorRedondeo(
  filas: readonly FilaDePadron[],
  objetivo: Importe,
): Ajuste | null {
  const cargadas = filas
    .map((fila, indice) => ({ ...fila, indice }))
    .filter((fila) => fila.designacion.trim() !== '')

  // Con una fila a medio tipear no se ofrece nada: el ajuste se calcularia
  // contra una suma que todavia no es la del padron.
  if (cargadas.length === 0 || !cargadas.every((fila) => DECIMAL.test(fila.coeficiente)))
    return null

  const suma = cargadas.reduce((total, fila) => total.plus(importe(fila.coeficiente)), importe('0'))
  const diferencia = objetivo.minus(suma)

  if (diferencia.isZero()) return null

  const decimales = decimalesDelPadron(cargadas.map((fila) => fila.coeficiente))
  const paso = importe(`1e-${decimales}`)
  if (diferencia.abs().greaterThan(paso.times(cargadas.length))) return null

  const mayor = cargadas.reduce((elegida, fila) =>
    importe(fila.coeficiente).greaterThan(importe(elegida.coeficiente)) ? fila : elegida,
  )

  const anterior = importe(mayor.coeficiente)
  const nuevo = anterior.plus(diferencia)
  if (nuevo.isNegative() || nuevo.isZero()) return null
  if (diferencia.abs().greaterThan(anterior.times(TOLERANCIA))) return null

  return {
    indice: mayor.indice,
    designacion: mayor.designacion,
    anterior: anterior.toFixed(decimales),
    nuevo: nuevo.toFixed(decimales),
    diferencia: diferencia.toFixed(decimales),
  }
}
