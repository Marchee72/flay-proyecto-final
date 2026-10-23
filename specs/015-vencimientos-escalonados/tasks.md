---
description: "Task list — Vencimientos escalonados con recargo en las expensas"
---

# Tasks: Vencimientos escalonados con recargo en las expensas

**Input**: Design documents from `specs/015-vencimientos-escalonados/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/contratos.md, quickstart.md

**Tests**: incluidos. El núcleo de cálculo es **dinero** → TDD obligatorio (Constitución, Principio II; `docs/entrega-3/08-metodologia-desarrollo.md`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1..US4 según `spec.md`

---

## Phase 1: Setup

- [X] T001 Ramar `015-vencimientos-escalonados` sobre el fix de saldo des-arrastre de la nota #4 (rama `fix/saldo-expensa-desarrastre`) — el cálculo de expensa de #3 se apoya en `saldosDeUnidad` corregido; rebasar o mergear esa base antes de implementar.

---

## Phase 2: Foundational (bloquea todas las historias)

**⚠️ CRITICAL**: ninguna historia empieza hasta terminar esta fase.

- [X] T002 Agregar los modelos `TramoVencimiento` (consorcioId, orden 1..3, diaDelMes 1..28, recargoPorcentaje Decimal(6,4); `@@unique([consorcioId, orden])`) y `VencimientoLiquidacion` (liquidacionId, orden, fecha Date, recargoPorcentaje Decimal(6,4); `@@unique([liquidacionId, orden])`, sin `consorcio_id`) con sus relaciones en `prisma/schema.prisma`, según `data-model.md`.
- [X] T003 Crear la migración versionada en `prisma/migrations/<nueva>_vencimientos_escalonados/migration.sql` (ambas tablas + disparador `fn_auditar` sobre `TramoVencimiento`, RN-15) y correr `npx prisma generate`.
- [X] T004 [P] Tests de dominio (TDD — escribir y verlos FALLAR primero) en `pruebas/dominio/liquidacion/vencimientos.spec.ts`: `recargoVigente` por tramo y en las fronteras (día de vencimiento inclusive), vencida en firme → recargo 0; `montoExigible` al centavo (base × (1+recargo), redondeo solo al final); `validarReglaVencimientos` rechaza último recargo ≥ mora, días no ascendentes, día > 28 y 1er tramo con recargo ≠ 0 (casos de `quickstart.md` V1).
- [X] T005 Implementar el módulo de dominio puro `src/dominio/liquidacion/vencimientos.ts` (`recargoVigente`, `montoExigible`, `validarReglaVencimientos` con firmas de `contracts/contratos.md`) hasta que T004 pase. Sin acceso a infraestructura (Principio III); `Decimal` para todo importe/porcentaje.

**Checkpoint**: esquema migrado y cálculo de recargo probado sin base.

---

## Phase 3: User Story 1 — Configurar la regla del consorcio (Priority: P1) 🎯 MVP

**Goal**: el administrador define hasta 3 vencimientos con su recargo; se rechaza la regla incoherente.

**Independent Test**: guardar una regla válida de 1/2/3 tramos; rechazar último recargo ≥ mora, días no ascendentes y día > 28, con mensaje claro.

- [X] T006 [P] [US1] Test de integración en `pruebas/integracion/vencimientos-escalonados.spec.ts`: persistir una regla válida (auditada); rechazar mora ≤ último recargo; un consorcista no puede ver/guardar la regla y un usuario sin habilitación no la ve (autorización + aislamiento).
- [X] T007 [US1] Caso de uso `verReglaVencimientos` / `guardarReglaVencimientos` en `src/aplicacion/consorcios/regla-vencimientos.ts` (autoriza administrador + consorcio, aísla, valida con `validarReglaVencimientos` contra `Consorcio.tasaMoraMensual`, reemplaza la regla completa, auditoría por disparador).
- [X] T008 [US1] Pantalla ABM de la regla en el panel de configuración del consorcio: nueva ruta `src/app/(panel)/consorcios/[consorcio]/vencimientos/` (page + formulario cliente + `acciones.ts` con server action) — hasta 3 filas día+recargo%, 1ª fija en 0 %, validación en servidor, mensajes de error comprensibles (RNF-10), responsive (RNF-01). Enlazar desde la navegación del consorcio.

**Checkpoint**: la regla se configura y valida de punta a punta.

---

## Phase 4: User Story 2 — Ver y pagar el monto según la fecha (Priority: P1)

**Goal**: el ocupante ve cuánto pagar hoy (con tramos a la vista) y paga el monto con recargo del tramo vigente.

**Independent Test**: sobre una liquidación emitida con 3 tramos, el exigible por fecha coincide con base × (1+recargo) en cada tramo; pagar ese monto salda la expensa; pagar el base deja saldo.

- [ ] T009 [US2] Congelar los tramos al emitir en `src/aplicacion/liquidacion/liquidar.ts`: `calcular`/`liquidarPeriodo` leen la regla del consorcio y crean los `VencimientoLiquidacion` dentro de la transacción; el tramo de mayor orden fija `Liquidacion.vencimiento`; sin regla configurada → un solo tramo al `diaVencimiento`, recargo 0 (compatibilidad).
- [ ] T010 [US2] Monto exigible y estado por fecha en `src/aplicacion/liquidacion/ver-expensa.ts`: `ExpensaVisible` suma `exigibleHoy`, `recargoVigente` y los tramos congelados (fecha + monto); `estadoPago` se recalcula con `recargoVigente` (zona AR). Usa `src/dominio/liquidacion/vencimientos.ts`.
- [ ] T011 [US2] Imputación contra el exigible con recargo en `src/aplicacion/pagos/registrar.ts`: `detallesImpagosDe(unidadId, hoy)` calcula el exigible del detalle dentro de su ventana como `saldo_base × (1 + recargoVigente(hoy))`; la imputación cubre base y luego recargo; un pago parcial deja saldo (no "pagada"); vencida en firme → exigible = base.
- [ ] T012 [P] [US2] Mostrar el monto a pagar hoy y los tramos en la vista de expensas (`src/app/(panel)/consorcios/[consorcio]/expensas/page.tsx`) y su detalle (`.../expensas/[detalle]/page.tsx`), responsive (RNF-01).
- [ ] T013 [P] [US2] Tests de integración (pago por tramo, `quickstart.md` V4) en `pruebas/integracion/vencimientos-escalonados.spec.ts`: pago del monto del tramo vigente → saldada; pago del base cuando rige recargo → saldo pendiente.

**Checkpoint**: el escalonamiento se ve y se cobra correctamente.

---

## Phase 5: User Story 3 — Vence en firme y arrastra con mora (Priority: P2)

**Goal**: pasada la última fecha, la expensa vence en firme, arrastra el base y la mora existente toma el relevo.

**Independent Test**: expensa impaga pasado el último vencimiento → al liquidar el período siguiente arrastra el base (no el recargado) y la mora se calcula sobre el base.

- [ ] T014 [US3] Estado "vencida en firme" tras el último vencimiento en `src/aplicacion/liquidacion/ver-expensa.ts` y `src/aplicacion/pagos/estado-de-cuenta.ts`: el exigible vuelve al base (el recargo no aplica), estado `vencida`; una expensa dentro de su mes no lleva mora.
- [ ] T015 [US3] Confirmar/ajustar en `src/aplicacion/liquidacion/liquidar.ts` (`deudaVigentePorUnidad`, `interesPorMora`) que la mora corre desde `Liquidacion.vencimiento` = último vencimiento y que el arrastre usa el base (`totalUnidad`, sin recargo); documentar que el recargo no se arrastra (lo reemplaza la mora, D4/D7).
- [ ] T016 [P] [US3] Test de integración (`quickstart.md` V5) en `pruebas/integracion/vencimientos-escalonados.spec.ts`: impaga pasado el último venc → arrastra base; mora sobre base; sin mora antes del último venc.

**Checkpoint**: el ciclo recargo → vence en firme → mora funciona sin duplicar cargos.

---

## Phase 6: User Story 4 — Historial congelado y reflejo en todos lados (Priority: P2)

**Goal**: las expensas emitidas conservan sus condiciones y los vencimientos se muestran en detalle, estado de cuenta y PDF.

**Independent Test**: cambiar la regla del consorcio no altera una expensa ya emitida; el PDF y el detalle muestran los tramos congelados.

- [ ] T017 [US4] Reflejar los tramos congelados en `src/aplicacion/pagos/estado-de-cuenta.ts` (saldo/último movimiento según el exigible por fecha) y en el detalle de la expensa.
- [ ] T018 [US4] Incluir la tabla de vencimientos congelados (fecha + monto por tramo) en el PDF de la expensa, en `src/aplicacion/liquidacion/documentos.ts` (`@react-pdf/renderer`).
- [ ] T019 [P] [US4] Test de integración (`quickstart.md` V3) en `pruebas/integracion/vencimientos-escalonados.spec.ts`: emitir con 3 tramos, cambiar la regla del consorcio, y verificar que la liquidación emitida conserva sus tramos.

**Checkpoint**: todas las historias funcionan de forma independiente.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T020 [P] Actualizar documentación: el punto correspondiente en `docs/` (vencimientos y recargo; aclarar que convive con la mora RN-08) y una nota en `CLAUDE.md` sobre la semántica "`Liquidacion.vencimiento` = último vencimiento" y el recargo derivado.
- [ ] T021 Verificar compatibilidad hacia atrás (`quickstart.md` V7): un consorcio sin regla liquida como hoy (un vencimiento, recargo 0); las liquidaciones viejas no cambian.
- [ ] T022 Correr `npm run verificar` completo (format, lint, typecheck, test:dominio, db:deploy, db:drift, test:integracion, build, test:e2e/a11y) en verde.

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002→T003; T004→T005)** bloquean todo.
- **US1 (T006–T008)**: tras Foundational. Usa `validarReglaVencimientos`.
- **US2 (T009–T013)**: tras Foundational; T009 (snapshot al emitir) antes de T010/T011; T010/T011 antes de T012.
- **US3 (T014–T016)**: tras US2 (necesita tramos emitidos y exigible por fecha).
- **US4 (T017–T019)**: tras US2 (snapshot + exigible).
- **Polish (T020–T022)**: al final.

### Dentro de cada historia

- Los tests de dinero (T004) se escriben y fallan antes de implementar (TDD).
- Esquema antes que casos de uso; casos de uso antes que UI/PDF.

### Oportunidades en paralelo

- T004 corre en paralelo a la redacción del schema (T002) mientras no dependa de `prisma generate`.
- Dentro de una historia, los tests marcados [P] y la UI [P] van en paralelo a la lógica cuando tocan archivos distintos.

---

## Implementation Strategy

### MVP

1. Setup (T001) + Foundational (T002–T005).
2. US1 (configurar la regla) → validar aislada.
3. US2 (ver y pagar por fecha) → validar aislada. **Este es el valor central: con US1+US2 el escalonamiento ya funciona de punta a punta.**

### Incremental

- US3 (vence en firme + arrastre) y US4 (congelado + PDF) agregan el ciclo completo y el reflejo histórico sin romper lo anterior.

---

## Notes

- `[P]` = archivos distintos, sin dependencias pendientes.
- Implementación requiere la base local levantada (`localhost:5434`) para migración e integración.
- Toda rama y commit referencia `RF-08`/`RN-08` (trazabilidad, Constitución § Flujo de desarrollo).
- Definición de terminado (8 condiciones): autorización por rol/consorcio, teléfono (RNF-01), errores comprensibles (RNF-10), auditoría si toca dinero (RN-15), documentación actualizada, revisión del otro integrante por PR.
