# Fase 1 — Quickstart (validación de la funcionalidad)

Escenarios que prueban, de punta a punta, que los vencimientos escalonados funcionan. Referencia a [data-model.md](./data-model.md) y [contracts/contratos.md](./contracts/contratos.md). No incluye código de implementación.

## Prerrequisitos

- Base local levantada (`localhost:5434`) y migración aplicada: `npm run db:deploy`.
- Puerta única del repo: `npm run verificar`.

## Validación 1 — Cálculo del recargo (dominio, sin base)

- `npm run test:dominio`
- Debe pasar `pruebas/dominio/liquidacion/vencimientos.spec.ts`:
  - Expensa base $100.000, tramos 0 %/5 %/8 % con días 10/20/28:
    - día 5 → exigible $100.000, recargo 0, tramo 1, próximo venc. día 10.
    - día 10 (frontera, inclusive) → todavía $100.000.
    - día 15 → $105.000, tramo 2.
    - día 28 (frontera, inclusive) → $108.000, tramo 3.
    - día 29 → vencida en firme, exigible = base $100.000, recargo 0.
  - `validarReglaVencimientos` rechaza: último recargo ≥ mora; días no ascendentes; día > 28; 1er tramo con recargo ≠ 0.

## Validación 2 — Configurar la regla (integración)

- El administrador guarda una regla de 3 tramos para un consorcio con mora 10 % → persiste (3 filas `TramoVencimiento`, auditadas).
- Intentar guardar último recargo 10 % (≥ mora) → rechazado con mensaje claro; nada persiste.
- Un consorcista no puede ver ni guardar la regla (autorización por rol/consorcio); un usuario sin habilitación no la ve (aislamiento).

## Validación 3 — Emisión congela los tramos (integración)

- Emitir una liquidación con la regla de 3 tramos → se crean 3 `VencimientoLiquidacion`; el de mayor orden coincide con `Liquidacion.vencimiento`.
- Cambiar la regla del consorcio → la expensa ya emitida conserva sus 3 tramos (congelado).

## Validación 4 — Pago por tramo (integración)

- Expensa base $100.000, regla 0/5/8:
  - Pago de $105.000 el día 15 → expensa saldada (saldo 0, estado pagada).
  - Pago de $100.000 el día 15 → queda saldo pendiente por el recargo; estado no "pagada".

## Validación 5 — Vencimiento en firme y arrastre (integración)

- Dejar la expensa impaga pasado el día 28; liquidar el período siguiente:
  - La deuda anterior arrastrada es el **base** $100.000 (no $108.000).
  - La mora del período siguiente se calcula sobre ese base con la tasa del consorcio (RN-08), como hoy.
  - Antes del día 28, la expensa no tiene mora (solo recargo dentro del mes).

## Validación 6 — Reflejo en pantalla y PDF (e2e)

- `npm run test:e2e` (y `test:a11y`): la expensa, su detalle y el PDF muestran los vencimientos con su monto por tramo y el monto a pagar hoy; se ve bien en teléfono 390×844 (RNF-01).

## Validación 7 — Compatibilidad hacia atrás

- Un consorcio sin regla configurada liquida con un único vencimiento al `diaVencimiento`, recargo 0, idéntico al comportamiento previo (las liquidaciones viejas no cambian).
