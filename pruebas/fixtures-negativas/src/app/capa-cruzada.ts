// Fixture 1 (FR-022): presentacion importando dominio. `npm run lint` debe rechazarla.
// Mensaje esperado: "Presentacion solo importa src/aplicacion y src/compartido".
import { calcularExpensa } from '@/dominio/liquidacion'

export const usar = () => calcularExpensa()
