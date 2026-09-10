import { importe, type Importe } from './dinero'

/**
 * Dos ayudas para cargar un padron sin hacer la aritmetica a mano.
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

/** Ocho decimales: el ultimo digito representable de un coeficiente. */
export const PASO = importe('0.00000001')

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
 * La diferencia que deja el redondeo se asigna a la unidad de mayor
 * coeficiente, que es la misma regla con la que se reparte el redondeo de una
 * liquidacion (invariante 3).
 *
 * Se ofrece **solo** si la diferencia cabe en el redondeo: hasta un ultimo
 * digito por unidad. Mas que eso no es redondeo, es un padron mal transcripto,
 * y taparlo moviendo un coeficiente seria falsear un dato del reglamento.
 * Devuelve `null` en ese caso, y tambien cuando ya cierra.
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
  if (diferencia.abs().greaterThan(PASO.times(cargadas.length))) return null

  const mayor = cargadas.reduce((elegida, fila) =>
    importe(fila.coeficiente).greaterThan(importe(elegida.coeficiente)) ? fila : elegida,
  )

  const nuevo = importe(mayor.coeficiente).plus(diferencia)
  if (nuevo.isNegative() || nuevo.isZero()) return null

  return {
    indice: mayor.indice,
    designacion: mayor.designacion,
    anterior: importe(mayor.coeficiente).toFixed(8),
    nuevo: nuevo.toFixed(8),
    diferencia: diferencia.toFixed(8),
  }
}
