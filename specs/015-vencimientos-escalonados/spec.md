# Feature Specification: Vencimientos escalonados con recargo en las expensas

**Feature Branch**: `015-vencimientos-escalonados`

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description: vencimientos escalonados con recargo en las expensas, parametrizable por consorcio (hasta 3 fechas, cada una con su recargo), que conviven con la mora existente (RN-08).

## Resumen

Hoy cada liquidación tiene **un solo** vencimiento (el día del mes que fija el consorcio en `diaVencimiento`) y el atraso se cobra como **mora-interés** que se liquida en el período siguiente (RN-08). Esta funcionalidad agrega, **dentro del mes**, hasta tres vencimientos escalonados: pagar más tarde cuesta un recargo mayor. Si la expensa no se paga para el último vencimiento, vence en firme y su importe **base** se arrastra al período siguiente, donde la mora existente toma el relevo. Los dos mecanismos **conviven** sin pisarse: el recargo rige dentro del mes, la mora después.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El administrador configura la regla de vencimientos del consorcio (Priority: P1)

El administrador define, una vez por consorcio, hasta dos vencimientos con recargo y la fecha del vencimiento en firme. En la pantalla carga, para cada vencimiento con recargo, el día del mes y el recargo en porcentaje que rige al pagar **después** de esa fecha; antes del primer vencimiento se paga el importe base, y pasada la fecha del vencimiento en firme la expensa vence y corre la mora. Internamente esto se guarda como el modelo de boleta (tramos por fecha límite, el primero base 0 %), que es lo que ve la expensa. El sistema rechaza una configuración incoherente: si el recargo más alto iguala o supera la tasa de mora mensual, dejar vencer en firme saldría igual o más barato que pagar ese recargo, y eso es un agujero.

**Why this priority**: sin la regla configurada no hay escalonamiento posible; es la base de todo lo demás, y la validación protege la coherencia económica del sistema.

**Independent Test**: configurar una regla válida de 1, 2 y 3 tramos y verla persistida; intentar una regla con recargo del último tramo ≥ mora y recibir un rechazo con mensaje claro.

**Acceptance Scenarios**:

1. **Given** un consorcio con tasa de mora mensual 10 %, **When** el administrador configura tres vencimientos con recargos 0 %, 5 % y 8 %, **Then** la regla queda guardada.
2. **Given** el mismo consorcio, **When** intenta configurar un último recargo de 10 % (igual a la mora) o más, **Then** el sistema rechaza con un mensaje que explica que la mora debe ser mayor que el último recargo.
3. **Given** un consorcio nuevo sin regla configurada, **When** se liquida, **Then** se comporta como hoy: un único vencimiento al día `diaVencimiento`, recargo 0 %.
4. **Given** una regla, **When** el administrador define los días, **Then** deben ser ascendentes y ninguno mayor a 28; en caso contrario, se rechaza.

---

### User Story 2 - El ocupante ve y paga el monto correcto según la fecha (Priority: P1)

Quien debe la expensa ve cuánto tiene que pagar **hoy** y hasta qué fecha rige ese monto, con los próximos tramos a la vista. Al pagar, el pago se imputa contra el monto con el recargo del tramo vigente.

**Why this priority**: es el valor central de la funcionalidad para el usuario final; sin esto el escalonamiento no se percibe ni se cobra.

**Independent Test**: sobre una expensa emitida con una regla de tres tramos, consultar el monto exigible en una fecha de cada tramo y verificar que coincide con base × (1 + recargo del tramo); pagar ese monto y ver la expensa saldada.

**Acceptance Scenarios**:

1. **Given** una expensa de base $100.000 con tramos 0 %/5 %/8 % y vencimientos 10/20/28, **When** el ocupante la consulta el día 5, **Then** ve "$100.000, vence el 10"; el día 15 ve "$105.000, vence el 20"; el día 25 ve "$108.000, vence el 28".
2. **Given** esa expensa el día 15, **When** paga $105.000, **Then** la expensa queda saldada (saldo 0, estado pagada).
3. **Given** esa expensa el día 15, **When** paga solo $100.000, **Then** queda un saldo pendiente por el recargo no cubierto.
4. **Given** el día del vencimiento de un tramo, **When** se consulta ese mismo día, **Then** rige todavía el recargo de ese tramo (el día del vencimiento es inclusive); el recargo del tramo siguiente rige a partir del día posterior.

---

### User Story 3 - La expensa vence en firme y se arrastra con mora (Priority: P2)

Si la expensa no se paga para el último vencimiento, queda vencida en firme: su importe **base** (sin el recargo del mes) se acumula al período siguiente como deuda anterior, y desde ahí corre la mora-interés que ya existe (RN-08). El recargo del mes no se arrastra; lo reemplaza la mora, que por la validación de la Historia 1 es mayor.

**Why this priority**: cierra el ciclo de vida de una expensa impaga y garantiza que recargo y mora no se dupliquen ni dejen un hueco.

**Independent Test**: dejar una expensa impaga pasado el último vencimiento, liquidar el período siguiente y verificar que arrastra el base (no el base recargado) y que la mora se calcula sobre ese base.

**Acceptance Scenarios**:

1. **Given** una expensa de base $100.000 con último recargo 8 %, impaga pasado el último vencimiento, **When** se liquida el período siguiente, **Then** la deuda anterior arrastrada es $100.000 (el base), no $108.000.
2. **Given** esa deuda arrastrada, **When** corre la mora del período siguiente, **Then** se calcula sobre el base arrastrado con la tasa del consorcio, como hoy.
3. **Given** una expensa aún dentro de su mes (antes del último vencimiento), **When** se consulta, **Then** no se le aplica mora: la mora recién aparece una vez vencida en firme y arrastrada.

---

### User Story 4 - El historial conserva las condiciones y se refleja en todos lados (Priority: P2)

Al emitir una liquidación, sus vencimientos y recargos quedan **congelados**: cambiar después la regla del consorcio no altera las expensas ya emitidas. Los vencimientos y el monto por tramo se muestran en la expensa, su detalle, el estado de cuenta y el PDF descargable.

**Why this priority**: la trazabilidad y la reconstrucción de una liquidación pasada es un invariante del sistema (RN-02, Principio II); sin el congelamiento, una expensa vieja mostraría condiciones que no eran las suyas.

**Independent Test**: emitir una liquidación, cambiar la regla del consorcio, y verificar que la expensa emitida sigue mostrando sus vencimientos y recargos originales en pantalla y en el PDF.

**Acceptance Scenarios**:

1. **Given** una liquidación emitida con tramos 0 %/5 %/8 %, **When** el administrador cambia la regla del consorcio a 0 %/10 %, **Then** la expensa ya emitida conserva 0 %/5 %/8 % en pantalla y en el PDF.
2. **Given** una expensa con tres vencimientos, **When** el ocupante abre su detalle o descarga el PDF, **Then** ve las tres fechas con sus montos.

---

### Edge Cases

- **Regla de un solo vencimiento**: equivalente al comportamiento actual (un vencimiento, recargo 0 %).
- **Mora ≤ recargo del último tramo**: configuración rechazada (Historia 1).
- **Límite de día**: un día de vencimiento mayor a 28 se rechaza (como `diaVencimiento` hoy, por febrero).
- **Días no ascendentes o repetidos**: se rechazan.
- **Frontera de tramo**: el día del vencimiento de un tramo todavía cobra el recargo de ese tramo (inclusive); el siguiente rige al día posterior.
- **Zona horaria**: el tramo vigente se evalúa en hora de Argentina (la del consorcio), no en UTC.
- **Pago parcial dentro de un tramo**: deja saldo pendiente; el estado no es "pagada" hasta cubrir el monto del tramo vigente.
- **Unidad dada de baja (coeficiente cero)**: sin expensa propia nueva, no aplica recargo.
- **Redondeo**: el recargo se calcula en decimal; el redondeo a dos decimales ocurre solo al final del importe unitario; una diferencia mayor a un centavo por unidad aborta (Principio II, RN-07).
- **Expensa que ya arrastra deuda anterior**: el recargo del mes se aplica sobre el total de la unidad del mes (`totalUnidad`, que incluye deuda anterior y mora liquidada), no solo sobre la parte propia.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir configurar, por consorcio, una regla de vencimientos con entre 1 y 3 tramos; cada tramo tiene un día del mes y un recargo en porcentaje. El primer tramo tiene recargo 0 %.
- **FR-002**: El sistema DEBE rechazar una regla cuyos días no sean estrictamente ascendentes o cuyo mayor día supere 28, con un mensaje comprensible (RNF-10).
- **FR-003**: El sistema DEBE rechazar una regla en la que el recargo del último tramo sea mayor o igual que la tasa de mora mensual del consorcio, explicando por qué (coherencia económica: la mora debe superar al último recargo).
- **FR-004**: Al emitir una liquidación, el sistema DEBE congelar (copiar) los vencimientos y recargos vigentes de la regla del consorcio en la liquidación, de modo que cambios posteriores de la regla no afecten expensas ya emitidas (RN-02).
- **FR-005**: El sistema DEBE calcular el monto exigible de una expensa en una fecha dada como `totalUnidad × (1 + recargo del tramo vigente a esa fecha)`, con el día de cada vencimiento inclusive para su tramo.
- **FR-006**: El sistema DEBE exponer, para quien debe la expensa, el monto a pagar hoy, la fecha hasta la que rige y los tramos siguientes con sus montos.
- **FR-007**: El sistema DEBE imputar un pago contra el monto exigible del tramo vigente a la fecha del pago; una expensa queda saldada solo cuando se cubre ese monto.
- **FR-008**: El sistema DEBE marcar una expensa como vencida en firme una vez pasado el último vencimiento sin pago total.
- **FR-009**: Al liquidar el período siguiente, el sistema DEBE arrastrar como deuda anterior el importe **base** de las expensas vencidas en firme (no el base recargado); el recargo del mes no se traslada.
- **FR-010**: La mora-interés existente (RN-08) DEBE seguir calculándose sobre la deuda arrastrada, sin cambios, y NO DEBE aplicarse a una expensa que todavía está dentro de su mes (antes del vencimiento en firme).
- **FR-011**: El monto exigible, el saldo y el estado de pago de una expensa DEBEN evaluarse según la fecha actual en hora de Argentina (la del consorcio).
- **FR-012**: La expensa, su detalle, el estado de cuenta y el PDF DEBEN reflejar los vencimientos congelados con su monto por tramo.
- **FR-013**: Todo recargo DEBE calcularse en aritmética decimal de precisión fija, con redondeo solo al final del importe unitario y la diferencia asignada a la unidad de mayor coeficiente; una diferencia mayor a un centavo por unidad aborta (Principio II, RN-07).
- **FR-014**: La configuración de la regla DEBE estar autorizada por rol (administrador) y consorcio, y aislada por consorcio (Principio I).
- **FR-015**: Crear o modificar la regla de vencimientos, al ser dato que condiciona importes económicos, DEBE quedar registrado en la bitácora de auditoría (RN-15).
- **FR-016**: Con una regla de un solo tramo (o sin regla configurada), el sistema DEBE comportarse como hoy: un único vencimiento al día `diaVencimiento`, sin recargo.

### Key Entities *(include if feature involves data)*

- **Regla de vencimientos (por consorcio)**: conjunto ordenado de 1 a 3 tramos; cada tramo tiene orden, día del mes y recargo porcentual. Pertenece a un consorcio. El primer tramo es el base (recargo 0 %). Es la configuración vigente que se aplica a las liquidaciones nuevas.
- **Vencimiento de la liquidación (congelado)**: copia, al emitir, de cada tramo de la regla sobre una liquidación concreta: orden, fecha concreta (resuelta del día del mes para el período) y recargo. Es lo que la expensa muestra y contra lo que se calcula el monto exigible, independiente de cambios posteriores de la regla.
- **Relación con entidades existentes**: `Consorcio` (dueño de la regla, ya tiene `diaVencimiento` y `tasaMoraMensual`), `Liquidacion` (hoy con un único `vencimiento`; pasa a tener su conjunto de vencimientos congelados), `DetalleLiquidacion` (su `totalUnidad` es la base del recargo), `Pago`/`PagoImputacion` (la imputación considera el monto con recargo vigente).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En cualquier momento, el ocupante ve sin ambigüedad el monto exacto a pagar hoy y hasta qué fecha rige, para una expensa con 1, 2 o 3 vencimientos.
- **SC-002**: El 100 % de los intentos de configurar una regla incoherente (último recargo ≥ mora, días no ascendentes, día > 28) se rechaza con un mensaje que explica el motivo.
- **SC-003**: Una expensa pagada por el monto del tramo vigente queda con saldo cero y estado pagada; un pago por el monto base cuando rige un tramo con recargo deja saldo pendiente.
- **SC-004**: Cambiar la regla de un consorcio no altera ninguna expensa ya emitida, en pantalla ni en el PDF.
- **SC-005**: Una expensa impaga pasado el último vencimiento figura como vencida en firme, y al liquidar el período siguiente arrastra exactamente su importe base; el recargo del mes no se arrastra y la mora se calcula sobre el base.
- **SC-006**: El monto exigible calculado coincide al centavo con `totalUnidad × (1 + recargo)` para cada tramo; cualquier diferencia mayor a un centavo por unidad aborta en vez de emitir mal.
- **SC-007**: La funcionalidad opera correctamente con reglas de 1, 2 y 3 tramos, y un consorcio sin regla se comporta como antes.

## Assumptions

- El recargo porcentual se aplica sobre el **total de la unidad del mes** (`totalUnidad`, lo que la expensa pide pagar, incluida deuda anterior y mora liquidada), no solo sobre la parte propia del período. (Confirmado con el usuario.)
- Los vencimientos son **días del mes** (1 a 28), ascendentes, reutilizando la semántica de `diaVencimiento`. (Confirmado con el usuario.)
- El día de cada vencimiento es **inclusive** para su tramo: hasta el fin de ese día rige su recargo; el tramo siguiente rige a partir del día posterior.
- El tramo vigente y los estados derivados se evalúan en **hora de Argentina** (la zona del consorcio).
- El recargo cobrado es ingreso del consorcio asociado a la unidad que paga tarde; no se prorratea como gasto entre unidades.
- La mora-interés existente (RN-08, `tasaMoraMensual`, `InteresLiquidado`) **no se reemplaza**: sigue operando sobre la deuda arrastrada tal como hoy.
- La regla por consorcio es **fija** (no se edita por liquidación puntual); se aplica automáticamente a cada emisión. Un ajuste de la regla rige para las liquidaciones futuras, no para las emitidas.
- El trabajo se construye sobre la base que incluye el arreglo de saldo des-arrastrado de la nota #4 (rama `fix/saldo-expensa-desarrastre`), con el que comparte el cálculo de saldo de las expensas.
