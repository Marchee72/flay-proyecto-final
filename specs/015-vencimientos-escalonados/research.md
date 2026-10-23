# Fase 0 — Investigación: Vencimientos escalonados con recargo

Decisiones de diseño resueltas a partir del estado actual del código y el modelo confirmado con el usuario. No quedan `NEEDS CLARIFICATION`.

## D1 — El `vencimiento` único actual pasa a ser el "último vencimiento"

- **Decisión**: `Liquidacion.vencimiento` (hoy un único `Date`, copiado de `Consorcio.diaVencimiento`) pasa a representar el **último** vencimiento, el que hace que la expensa "venza en firme".
- **Rationale**: la mora existente (`interes.ts`, `interesPorMora`, `deudaVigentePorUnidad` en `liquidar.ts`) calcula el interés desde `liquidacion.vencimiento`. Si ese campo es el último tramo, la mora arranca exactamente cuando la expensa vence en firme, sin tocar la lógica de mora. Convivencia limpia: recargo antes del último vencimiento, mora después.
- **Alternativas**: agregar un campo nuevo "vencimientoFirme" y dejar `vencimiento` como el primero → duplicaría semántica y obligaría a reescribir la mora. Rechazada.

## D2 — La regla se modela como tabla hija del consorcio

- **Decisión**: nueva tabla `TramoVencimiento` con `consorcioId`, `orden` (1..3), `diaDelMes` (1..28), `recargoPorcentaje` (Decimal). Una fila por tramo; 1 a 3 por consorcio.
- **Rationale**: relacional y de cantidad variable (1 a 3), más limpio que seis columnas en `Consorcio`. Al llevar `consorcioId` queda **aislada** por la extensión (CLAUDE.md nota 4): se lee/escribe en contexto de consorcio, sin filtro a mano.
- **Alternativas**: columnas fijas en `Consorcio` (rígido para cantidad variable); JSON en `Consorcio` (pierde integridad y validación en base). Rechazadas.
- **Compatibilidad**: `Consorcio.diaVencimiento` se conserva como el día del **último** tramo por defecto, para que un consorcio sin regla configurada siga comportándose como hoy (un tramo, recargo 0).

## D3 — El snapshot por liquidación cuelga de `Liquidacion`

- **Decisión**: nueva tabla `VencimientoLiquidacion` con `liquidacionId`, `orden`, `fecha` (Date concreta del período), `recargoPorcentaje`. **No** lleva `consorcio_id`.
- **Rationale**: se congela al emitir para que una expensa vieja conserve sus condiciones aunque cambie la regla (RN-02, FR-004). Igual que `DetalleLiquidacion`, se alcanza entrando por `Liquidacion` (aislada) y nunca directo (CLAUDE.md nota 10) → no entra a `filtro-unico.spec.ts`. El último `VencimientoLiquidacion` coincide en fecha con `Liquidacion.vencimiento`.
- **Alternativas**: recomputar los tramos al vuelo desde la regla del consorcio (rompe el histórico si la regla cambia). Rechazada.

## D4 — El recargo es un importe DERIVADO, no se persiste en `totalUnidad`

- **Decisión**: el recargo se calcula al mostrar/cobrar, como `totalUnidad × recargoVigente(fecha)`. No se guarda en `totalUnidad` ni en el detalle.
- **Rationale**: el arrastre del período siguiente usa el **base** (`totalUnidad`/saldo propio des-arrastrado de la nota #4). Si el recargo no se persiste, "arrastra el base" es automático: no hay que restar nada al rodar. Además evita doble-contar el recargo con la mora.
- **Alternativas**: materializar el recargo como una fila/importe (obligaría a revertirlo al vencer en firme). Rechazada.

## D5 — Tramo vigente y monto exigible por fecha (dominio puro)

- **Decisión**: función de dominio `recargoVigente(vencimientos, hoy)` que, dados los tramos congelados y la fecha, devuelve el recargo aplicable: 0 hasta el día del 1er vencimiento (inclusive); el recargo del tramo k si `hoy` está entre el tramo k-1 (exclusive) y el tramo k (inclusive); y una marca de "vencida en firme" (sin recargo: arrastra base) pasado el último. `montoExigible = totalUnidad × (1 + recargo)`.
- **Frontera**: el día del vencimiento de un tramo es **inclusive** para ese tramo (se puede pagar ese mismo día al monto de ese tramo).
- **Zona horaria**: `hoy` se evalúa en hora de Argentina (la del consorcio), reutilizando el criterio de la nota #5; nunca UTC crudo.
- **Rationale**: dominio puro, probable sin base (Principio III), TDD obligatorio por ser dinero (Principio II).

## D6 — Imputación de pagos contra el exigible con recargo

- **Decisión**: el monto exigible de una expensa dentro de su ventana de escalonamiento es `saldo_base × (1 + recargoVigente(hoy))`. La imputación (`detallesImpagosDe`/`imputar`) cubre primero el base y luego el recargo del tramo vigente; un pago que no alcanza el monto del tramo deja saldo pendiente (no "pagada"). Una vez vencida en firme, el exigible vuelve a ser el base (el recargo lo reemplaza la mora del período siguiente).
- **Rationale**: respeta la semántica "pagar antes cuesta menos" y "pago parcial deja pendiente" (FR-007, US2). El recargo solo aplica a la liquidación dentro de su ventana; la deuda ya rodada vive como `deudaAnterior`/`interesMora` de la liquidación siguiente.
- **Riesgo/atención**: es el punto más delicado; se cubre con pruebas de dominio (cálculo) e integración (imputación real).

## D7 — Validación mora > recargo del último tramo

- **Decisión**: al guardar la regla, validar en el dominio que `tasaMoraMensual > recargoPorcentaje` del último tramo. Si no, rechazar con mensaje claro (RNF-10). También validar días ascendentes (1..28) y 1er tramo con recargo 0.
- **Rationale**: evita el agujero económico (dejar vencer saldría igual o más barato que pagar el último recargo). Condición explícita del usuario.

## D8 — Auditoría y migración

- **Decisión**: la migración crea las dos tablas y agrega el disparador `fn_auditar` a `TramoVencimiento` (dato que condiciona importes). Migración versionada, sin cambios manuales.
- **Rationale**: RN-15 / Principio V. `VencimientoLiquidacion` se escribe solo al emitir (dentro de la transacción de liquidación ya auditada); se evalúa si necesita su propio disparador o alcanza con la auditoría de la emisión.
