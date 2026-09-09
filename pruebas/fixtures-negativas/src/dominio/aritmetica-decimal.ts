// Fixture 3 (FR-022): aritmetica de punto flotante sobre dinero.
// Mensaje esperado: "Aritmetica de punto flotante sobre un Decimal".
import { importe, type Importe } from '@/compartido/dinero'

export function totalMal(a: Importe, b: Importe): Importe {
  return a + b
}

export const doble = (a: Importe) => a * 2
export const negado = (a: Importe) => -a

export const acumular = (a: Importe) => {
  let total = importe('0')
  total += a
  return total
}
