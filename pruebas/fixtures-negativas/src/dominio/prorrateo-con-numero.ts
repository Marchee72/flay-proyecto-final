// Fixture 5 (`003-liquidacion` FR-007): un total de gastos como `number` al
// motor de prorrateo. `npm run typecheck` debe rechazarla.
//
// Es la puerta que mas importa del sistema: si el punto flotante entra al motor
// de liquidacion, ninguna otra medida alcanza. Mensaje esperado:
// type 'number' is not assignable to type 'string'.
import { prorratear } from '@/dominio/liquidacion/prorrateo'

export const mal = prorratear({
  padron: [{ unidadId: 'u-1', designacion: '1A', coeficiente: '100.00000000' }],
  totalOrdinario: 1500.5,
  totalExtraordinario: '0.00',
})
