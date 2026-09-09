import { Decimal } from 'decimal.js'

/**
 * El dinero no es un `number`. TypeScript no tiene decimal nativo (§14.1,
 * medida 1): ninguna firma publica del dominio acepta ni devuelve `number` para
 * un importe, y hacia la interfaz los importes se serializan como cadena.
 */
export type Importe = Decimal

export { Decimal }

export const importe = (valor: string): Importe => new Decimal(valor)

/** Un importe cruza a la interfaz como cadena, nunca como numero. */
export const aCadena = (valor: Importe, decimales = 2): string => valor.toFixed(decimales)
