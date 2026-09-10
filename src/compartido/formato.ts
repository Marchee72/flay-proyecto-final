import { Prisma } from '@prisma/client'

/**
 * El dinero cruza a la interfaz como cadena, nunca como numero (medida 3 de
 * §14.1, SC-010). Ninguna funcion de este archivo acepta el tipo numerico
 * nativo: si lo aceptara, la precision se perderia antes de llegar aca.
 */

export type Decimal = Prisma.Decimal

export const DECIMALES_IMPORTE = 2
export const DECIMALES_COEFICIENTE = 8

/** Serializacion hacia la interfaz: cadena cruda, sin separadores. */
export function importeSerializado(valor: Decimal | string): string {
  return new Prisma.Decimal(valor).toFixed(DECIMALES_IMPORTE)
}

/** `12.50000000`: ocho decimales, siempre (FR-010). */
export function coeficienteSerializado(valor: Decimal | string): string {
  return new Prisma.Decimal(valor).toFixed(DECIMALES_COEFICIENTE)
}

const DECIMALES_MINIMOS_COEFICIENTE = 2

/**
 * `8.33` en vez de `8.33000000`, para leer.
 *
 * Un padron de dos decimales no gana nada mostrandose con seis ceros de
 * relleno, y el que de verdad tiene ocho se sigue viendo entero: se sacan los
 * ceros de la derecha, no los digitos. Nunca menos de dos, para que la columna
 * quede pareja. La serializacion no cambia: sigue siendo la de ocho decimales.
 */
export function coeficienteParaMostrar(valor: Decimal | string): string {
  const [entero, decimales] = coeficienteSerializado(valor).split('.')
  const significativos = decimales.replace(/0+$/, '')
  return `${entero}.${significativos.padEnd(DECIMALES_MINIMOS_COEFICIENTE, '0')}`
}

/** Entrada de la interfaz hacia el dominio: cadena a Decimal, sin pasar por number. */
export function decimalDesdeCadena(valor: string): Decimal {
  return new Prisma.Decimal(valor)
}

/**
 * `$ 1.234.567,89` en formato `es-AR`.
 *
 * La agrupacion se hace sobre la **cadena** y no con `Intl`: el formateador
 * tipado solo acepta numeros, y convertir un importe a numero para mostrarlo
 * pierde precision justo en los importes largos que SC-010 verifica.
 */
export function importeParaMostrar(valor: Decimal | string): string {
  const [entero, decimales] = importeSerializado(valor).split('.')
  const negativo = entero.startsWith('-')
  const digitos = negativo ? entero.slice(1) : entero
  return `${negativo ? '-' : ''}$ ${agruparMiles(digitos)},${decimales}`
}

function agruparMiles(digitos: string): string {
  let salida = ''
  for (let i = 0; i < digitos.length; i++) {
    const restantes = digitos.length - i
    salida += digitos[i]
    if (restantes > 1 && (restantes - 1) % 3 === 0) salida += '.'
  }
  return salida
}
