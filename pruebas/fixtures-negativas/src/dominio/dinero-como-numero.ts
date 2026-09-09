// Fixture 2 (FR-022): `number` como dinero. `npm run typecheck` debe rechazarla.
// Mensaje esperado: type 'number' is not assignable to parameter of type 'Importe'.
import { aCadena, type Importe } from '@/compartido/dinero'

export function totalDeExpensas(monto: Importe): string {
  return aCadena(monto)
}

export const mal = totalDeExpensas(1500.5)
