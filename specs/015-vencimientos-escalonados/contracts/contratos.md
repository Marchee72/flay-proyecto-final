# Fase 1 — Contratos: Vencimientos escalonados

Contratos internos de la aplicación (no hay API pública externa): funciones de dominio puras, casos de uso de aplicación y contrato de interfaz. Las firmas son orientativas para el plan; los tipos exactos se afinan al implementar.

## Dominio (puro, sin base) — `src/dominio/liquidacion/vencimientos.ts`

```ts
interface TramoCongelado {
  orden: number
  fecha: Date                 // fecha concreta del tramo
  recargoPorcentaje: string   // Decimal como cadena, p. ej. "5.0000"
}

interface RecargoVigente {
  recargoPorcentaje: string   // "0.0000" si está en el primer tramo o vencida en firme
  tramo: number | null        // orden del tramo vigente; null si venció en firme
  venceEnFirme: boolean       // true si hoy > último vencimiento
  proximoVencimiento: Date | null
}

// Recargo aplicable a una fecha, con día de vencimiento inclusive; `hoy` en zona AR.
function recargoVigente(tramos: readonly TramoCongelado[], hoy: Date): RecargoVigente

// Monto a pagar = base × (1 + recargo). Decimal; redondeo solo al final.
function montoExigible(totalUnidadBase: string, recargoPorcentaje: string): string

// Validación de la regla al guardarla (lanza error de dominio legible si falla).
interface TramoRegla { orden: number; diaDelMes: number; recargoPorcentaje: string }
function validarReglaVencimientos(tramos: readonly TramoRegla[], tasaMoraMensual: string): void
//  - 1..3 tramos, orden consecutivo desde 1
//  - tramo 1 con recargo 0
//  - diaDelMes ascendentes, todos 1..28
//  - recargo del último tramo < tasaMoraMensual
```

**Pruebas (TDD, `pruebas/dominio/liquidacion/vencimientos.spec.ts`)**: recargo por fecha en cada tramo y en las fronteras (día inclusive); vencida en firme → recargo 0; monto exigible al centavo; cada regla inválida de `validarReglaVencimientos` rechazada con su mensaje.

## Aplicación — configuración de la regla — `src/aplicacion/consorcios/regla-vencimientos.ts`

```ts
// Lee la regla vigente del consorcio (o la equivalente de un solo tramo por defecto).
verReglaVencimientos(repo, reloj, { usuarioId, consorcioId }):
  Promise<{ tramos: TramoRegla[] }>

// Reemplaza la regla completa (autoriza administrador + consorcio, aísla, audita).
guardarReglaVencimientos(repo, reloj, {
  usuarioId, consorcioId, tramos: TramoRegla[]
}): Promise<void>
//  valida con validarReglaVencimientos(tramos, consorcio.tasaMoraMensual) antes de escribir
```

## Aplicación — emisión — `src/aplicacion/liquidacion/liquidar.ts`

- `calcular(...)` y `liquidarPeriodo(...)` leen la regla del consorcio y, en la misma transacción de emisión, crean los `VencimientoLiquidacion` (congelado). El tramo de mayor orden fija `Liquidacion.vencimiento` (el último, que la mora ya usa). Sin regla configurada → un solo tramo al `diaVencimiento`, recargo 0.

## Aplicación — expensas y estado de cuenta (lectura por fecha)

- `ver-expensa.ts` (`ExpensaVisible`): agrega el monto exigible de hoy, el recargo vigente, los tramos congelados (fecha + monto por tramo) y recalcula `estadoPago` (`pendiente`/`vencida`/`pagada`) según `recargoVigente`.
- `estado-de-cuenta.ts`: el saldo mostrado y el "último movimiento" reflejan el exigible por fecha; el arrastre sigue sobre el base (des-arrastre de la nota #4).

## Aplicación — pagos — `src/aplicacion/pagos/registrar.ts`

- `detallesImpagosDe(unidadId, hoy)`: para el detalle dentro de su ventana de escalonamiento, el exigible es `saldo_base × (1 + recargoVigente(hoy))`; cubre base y luego recargo. Pago parcial deja saldo. Vencida en firme → exigible = base.

## Contrato de interfaz (Presentación)

- **ABM de la regla** (panel de configuración del consorcio): hasta 3 filas (día + recargo %), con el 1º fijo en 0 %; valida en servidor; mensajes de error comprensibles (RNF-10); funciona en teléfono (RNF-01).
- **Expensa / detalle / PDF**: muestran los vencimientos con su monto por tramo y el monto a pagar hoy; el PDF (`@react-pdf/renderer`) incluye la tabla de vencimientos congelados.
