# Especificación de etapa: Liquidación (iteración 2)

**Feature Branch**: `003-liquidacion`

**Created**: 2026-09-08

**Status**: Draft

**Input**: Iteración 2 del cronograma (§ 8.3.1), 6 semanas, 194 h. Alcance comprometido: `RF-07`,
`RF-08` y `RF-09` — períodos y control de estado, liquidación de expensas, emisión del documento
por unidad, pagos, imputación e intereses. Casos de uso `CU-03`, `CU-04` y `CU-06`. Se agrega la
tabla `Notificacion` y su encolado, sin despachador (hallazgo 2 del análisis de insumos).

> **Convención de códigos.** `FR-nnn` numera los requisitos **locales de esta especificación**.
> Los códigos del proyecto conservan su prefijo: `RF-nn`, `RNF-nn`, `CU-nn`, `RT-nn`. Ante la
> colisión del prefijo `RN-` entre las quince reglas de negocio del punto 7 y los seis riesgos de
> negocio del punto 11, se escribe siempre **«regla RN-nn (§ 7.2)»** y **«riesgo RN-nn (§ 11.2)»**.

**Depende de**: `002-nucleo` terminada, con `Unidad`, `CoeficienteHistorico`, `Gasto` y `Periodo`
poblados, y con las **tres liquidaciones reales del cliente ya en poder del equipo** (riesgo RT-01
§ 11.2 exige tenerlas antes de escribir el código del motor).

**Esta es la etapa de mayor riesgo del proyecto.** El paquete 4.2 concentra el 8 % del esfuerzo
total y toda la lógica de negocio regulada; un error aquí invalida el sistema y no se detecta con
pruebas superficiales (§ 10). El **desarrollo guiado por pruebas es obligatorio** en liquidación,
prorrateo, intereses e imputación (§ 8.3.3), y el paquete 4.2 se hace **en pares** (§ 10).

---

## Clarifications

### Session 2026-09-10

- Q: ¿Algún rubro se reparte sólo entre un grupo de unidades, en vez de entre todo el padrón? (H-11) → A: No. Un solo coeficiente sobre el padrón completo; si el cliente reparte por grupo, es una etapa nueva y no un parche.
- Q: Con una unidad alquilada, ¿las ordinarias del ocupante y las extraordinarias del propietario son dos obligaciones o una expensa con dos subtotales? → A: Una sola expensa por unidad, con los dos subtotales separados a la vista.
- Q: ¿Cuándo se calculan los intereses por mora, al emitir o al pagar? → A: Al emitir, sobre lo impago a la fecha de emisión.
- Q: ¿Cómo se calcula el interés por mora? → A: Simple, por **mes vencido completo**: sin prorrateo de días y sin capitalizar.
- Q: ¿De dónde sale la fecha de vencimiento? → A: Día fijo por consorcio; la fecha se copia a la liquidación al emitirla.
- Q: El excedente de un pago queda en `Pago.saldo_a_favor`, ¿y después? → A: Se aplica solo a la liquidación siguiente de esa unidad, sin intervención del administrador.
- Q: Con «mes vencido completo», ¿los meses se cuentan por liquidación impaga o sobre el saldo total? → A: Por cada liquidación impaga, desde **su propio** vencimiento.
- Q: `FR-003` anula para corregir, pero el contrato de `002` dice que un período liquidado no vuelve atrás. ¿Qué se anula? → A: La **liquidación**, no el período. El período queda `liquidado`; el contrato de `002` no se toca.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — El dominio calcula una liquidación correcta sin base de datos (Priority: P1)

`RF-07` · `CU-03` · reglas RN-01, RN-02, RN-04, RN-05 y RN-07 (§ 7.2) · Principios II y III ·
riesgo RT-01 (§ 11.2)

El motor de prorrateo se escribe **primero como pruebas**: se le dan totales de gastos ordinarios y
extraordinarios y un padrón de coeficientes, y devuelve el detalle por unidad. Todo eso ocurre en
memoria, sin base de datos, sin servidor web y sin mapeador.

**Why this priority**: es el corazón económico del sistema y la razón de ser del Principio III. Si
el cálculo necesita base de datos para probarse, ejercitarlo exhaustivamente se vuelve caro y se
deja de hacer; entonces el riesgo RT-01 se materializa. La independencia del dominio es lo que
vuelve barata la única defensa que existe contra un error de dinero.

**Independent Test**: `npm run test:dominio` con `DATABASE_URL` sin definir ejercita el prorrateo
sobre padrones de 1, 12, 96 y 100 unidades y verifica la cuadratura con tolerancia cero.

**Acceptance Scenarios**:

1. **Given** un padrón de 96 unidades cuyos coeficientes suman `100.00000000` y un total de gastos
   ordinarios, **When** se ejecuta el prorrateo, **Then** la suma de los importes de los detalles
   iguala el total **con tolerancia cero** (regla RN-07 § 7.2).
2. **Given** que la suma de detalles difiere del total por redondeo en menos o igual a un centavo
   por unidad, **When** termina el cálculo, **Then** la diferencia se asigna a la unidad de mayor
   coeficiente y queda registrada **en un campo propio**, no mezclada con el importe.
3. **Given** una diferencia **mayor** a un centavo por unidad, **When** termina el cálculo,
   **Then** el motor **aborta**, registra un incidente y no emite nada. Eso no es redondeo: es un
   defecto de cálculo, y emitir sería peor que fallar.
4. **Given** un padrón cuyos coeficientes suman `99.99999999`, **When** se intenta liquidar,
   **Then** el motor aborta antes de calcular nada e informa las unidades y la diferencia exacta
   (regla RN-01 § 7.2).
5. **Given** gastos ordinarios y extraordinarios, **When** se prorratean, **Then** producen **dos
   subtotales separados** por unidad: los ordinarios a cargo del ocupante y los extraordinarios a
   cargo del propietario, conforme a la Ley 27.551 (regla RN-05 § 7.2).
6. **Given** el redondeo, **When** se calcula, **Then** ocurre **sólo al final de cada importe
   unitario**, nunca en pasos intermedios (Principio II).
7. **Given** una unidad, **When** se persiste su detalle, **Then** se copia en él el coeficiente
   aplicado, para que la liquidación se pueda reconstruir aunque el coeficiente cambie después
   (regla RN-02 § 7.2).
8. **Given** cualquier prueba del dominio, **When** corre, **Then** no toca base de datos, ni red,
   ni sistema de archivos.

---

### User Story 2 — El administrador liquida el período y el resultado coincide con la planilla del cliente (Priority: P1)

`RF-07` · `CU-03` · reglas RN-03, RN-06 y RN-15 (§ 7.2) · RNF-07 · paquete 4.6

El administrador cierra el período, ejecuta la liquidación y el sistema produce la liquidación con
su detalle por unidad, en una sola transacción. El resultado se compara **al centavo** contra las
tres liquidaciones reales que el cliente hizo en su planilla.

**Why this priority**: es la condición de aceptación del entregable 2 y de su cobro (§ 6.4.1), y es
la única evidencia real de que el motor es correcto. Un motor que pasa sus propias pruebas y no
coincide con la planilla del cliente no sirve.

**Independent Test**: cargar los gastos y el padrón de una de las tres liquidaciones reales,
ejecutar, y comparar importe por importe contra la planilla.

**Acceptance Scenarios**:

1. **Given** un período abierto con gastos cargados, **When** el administrador lo cierra, **Then**
   pasa a estado cerrado y ningún gasto puede agregarse ni modificarse (regla RN-03 § 7.2).
2. **Given** un período cerrado, **When** se ejecuta la liquidación, **Then** se persisten la
   liquidación y sus detalles, el período pasa a liquidado y se registra en la bitácora, **todo en
   una única transacción** (regla RN-15 § 7.2).
3. **Given** un período ya liquidado, **When** se intenta liquidarlo otra vez, **Then** el sistema
   lo rechaza. Corregir exige **anular** la liquidación y emitir una nueva, quedando ambas
   registradas y vinculadas (regla RN-06 § 7.2).
4. **Given** una falla en cualquier paso, **When** ocurre, **Then** la transacción se revierte
   entera: no existe liquidación a medias.
5. **Given** el consorcio de 100 unidades, **When** se ejecuta la liquidación, **Then** termina en
   **menos de 30 segundos** (RNF-07). La generación de documentos **no** cuenta dentro de ese
   presupuesto: es diferida (decisión 5 de § 12.1.3).
6. **Given** cada una de las **tres** liquidaciones reales del cliente, **When** se reproducen en
   el sistema, **Then** cada importe unitario coincide **al centavo** con la planilla, y toda
   discrepancia se explica antes de dar la etapa por terminada (paquete 4.6).
7. **Given** una liquidación emitida, **When** termina, **Then** deja encolada la notificación
   «Liquidación publicada» en estado pendiente, sin despacharla (hallazgo 2).

---

### User Story 3 — El consorcista descarga la expensa de su unidad (Priority: P2)

`RF-08` · `CU-03` paso 10 · `CU-06` · RNF-07 · regla RN-12 (§ 7.2)

Emitida la liquidación, el sistema genera en proceso diferido un documento descargable por unidad.
El consorcista entra desde el teléfono y descarga el suyo, y sólo el suyo.

**Why this priority**: es lo que el consorcista ve y lo que el objetivo OBJ-2.2 promete. Va después
de la historia 2 porque depende del detalle ya emitido, y es P2 porque la liquidación es correcta y
auditable aunque el documento tarde en generarse.

**Independent Test**: emitir la liquidación del consorcio de 96 unidades y verificar que aparecen
96 documentos, cada uno accesible únicamente por los ocupantes de su unidad.

**Acceptance Scenarios**:

1. **Given** una liquidación emitida sobre 96 unidades, **When** termina el proceso diferido,
   **Then** existen **96** documentos, uno por unidad, y ninguno falta.
2. **Given** un consorcista ocupante de la unidad 3-B, **When** descarga su expensa, **Then**
   obtiene la suya; **When** manipula la dirección para pedir la de otra unidad, **Then** obtiene
   «no encontrado» (regla RN-12 § 7.2).
3. **Given** un documento generado, **When** se lo abre, **Then** muestra el coeficiente aplicado,
   los subtotales ordinario y extraordinario por separado, los intereses y el total, con los
   importes formateados a partir de cadenas y nunca recalculados en la interfaz.
4. **Given** una falla en la generación de un documento, **When** ocurre, **Then** se reintenta y
   **no** invalida la liquidación ya emitida.
5. **Given** un teléfono de 390 px, **When** el consorcista descarga su expensa, **Then** el flujo
   completo funciona sin desplazamiento horizontal (RNF-01) y cumple WCAG 2.1 AA (RNF-11).

---

### User Story 4 — El administrador registra un pago y el sistema lo imputa por antigüedad (Priority: P2)

`RF-09` · `CU-04` · reglas RN-08 y RN-13 (§ 7.2)

El administrador registra un pago de una unidad. El sistema lo imputa a las liquidaciones impagas
de esa unidad en orden de antigüedad, calcula el saldo y los intereses por mora, y actualiza el
estado de cuenta.

**Why this priority**: cierra el ciclo económico y habilita la morosidad de la etapa 4 y la
precondición «sin deuda vencida» de las reservas (`CU-09`). Va después del documento porque la
imputación necesita detalles ya emitidos.

**Independent Test**: registrar un pago parcial que cubre una liquidación y media, y verificar que
la imputación reparte por antigüedad y que la suma de imputaciones iguala el pago.

**Acceptance Scenarios**:

1. **Given** una unidad con tres liquidaciones impagas, **When** se registra un pago que cubre una
   y media, **Then** se imputa a la más antigua primero y el remanente a la siguiente (regla RN-08
   § 7.2).
2. **Given** un pago imputado, **When** se suman sus imputaciones, **Then** la suma iguala el
   importe del pago **con tolerancia cero**.
3. **Given** una liquidación vencida hace N días, **When** se calcula el interés, **Then** se
   calcula sobre los días de atraso en aritmética decimal, con la tasa vigente al momento del
   cálculo, y se prueba **sin base de datos** en el dominio.
4. **Given** un pago que excede la deuda total, **When** se registra, **Then** el excedente queda a
   favor de la unidad y no se pierde ni se imputa a otra unidad.
5. **Given** un consorcista, **When** consulta la morosidad, **Then** ve **sólo el dato agregado**;
   la nómina nominada es visible únicamente para administrador y consejo de propietarios (regla
   RN-13 § 7.2).
6. **Given** cualquier operación de pago o imputación, **When** termina, **Then** deja asiento en
   la bitácora (regla RN-15 § 7.2).
7. **Given** una liquidación anulada, **When** tenía pagos imputados, **Then** esas imputaciones se
   revierten y los pagos quedan disponibles para la liquidación que la reemplaza.

---

### Edge Cases

- **Un período sin ningún gasto.** Se liquida con total cero: los detalles existen con importe
  cero. No es un error, es un mes sin gastos, y el consorcista debe ver que su expensa es cero y no
  que no existe.
- **Una unidad dada de alta a mitad del período.** Su coeficiente vigente a la fecha de emisión es
  el que rige (regla RN-02 § 7.2); si no tiene coeficiente vigente, el motor aborta antes de
  calcular.
- **Un gasto extraordinario sin ninguna unidad ocupada por su propietario.** El subtotal
  extraordinario se emite igual: el obligado es el propietario, exista o no ocupación registrada.
- **La unidad de mayor coeficiente empatada entre dos unidades.** El desempate es determinístico y
  documentado —el identificador menor—, para que dos ejecuciones den el mismo resultado.
- **Dos liquidaciones del mismo período disparadas en paralelo.** La segunda encuentra el período
  en estado liquidado y aborta; el estado del período es el candado (regla RN-06 § 7.2).
- **Emitir de nuevo después de anular.** El período sigue en `liquidado`: el candado que impide la
  emisión doble no puede ser el estado del período, porque una reemisión legítima lo encuentra
  igual. Lo que decide es que **no haya otra liquidación emitida** para ese período (FR-003b).
- **El servicio de correo caído al emitir.** La liquidación se emite igual. La notificación queda
  encolada en estado pendiente y se despacha cuando el servicio vuelva o cuando `004-servicios`
  construya el despachador (hallazgo 2, RNF-14).
- **El consorcio de 96 unidades excede el presupuesto de documentos.** Es el riesgo RT-05 (§ 11.2):
  la generación es diferida por diseño y se mide; si no cierra, se degrada a generación por lotes,
  no a generación sincrónica.
- **Una unidad alquilada.** La expensa es **una sola** y se emite a la unidad, con lo ordinario y
  lo extraordinario separados adentro. El sistema no parte la deuda en dos ni persigue a dos
  personas: quién paga qué parte es un acuerdo entre propietario e inquilino, y el documento se lo
  dice a los dos.
- **Un atraso de veintinueve días.** Interés **cero**: el interés corre por mes vencido completo.
  Es consecuencia deliberada de la fórmula elegida y hay que probarla, porque es la que sorprende:
  pagar el día 29 no cuesta nada y el día 31 cuesta un mes entero.
- **Una tasa de interés cambiada a mitad del período.** La tasa aplicada se copia al cálculo y
  queda registrada, igual que el coeficiente: una liquidación pasada debe poder reconstruirse.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Bloque A — Períodos y control de estado (paquete 4.1)

- **FR-001**: El período **DEBE** tener la máquina de estados completa: abierto → cerrado →
  liquidado, más anulado. `anulado` es para un período que se descarta **sin liquidar**; un período
  liquidado no vuelve atrás, y el contrato de `002` ya lo dice con `liquidado: []`. Esta etapa
  **NO DEBE** agregar transiciones desde `liquidado`. `002-nucleo` construyó sólo la apertura y el listado; esta etapa completa
  el resto. El contrato (valores del enum y transiciones válidas) vive en `src/dominio/contratos`
  desde `002` (M-04) y ambas etapas lo comparten: ninguna prueba fabrica un estado fuera de ese contrato.
- **FR-002**: Un período cerrado **DEBE** rechazar toda alta o modificación de gasto (regla RN-03
  § 7.2).
- **FR-002b**: El consorcio **DEBE** tener un **día de vencimiento** propio —el 10, por ejemplo— y
  la liquidación de un período vence ese día del mes siguiente. La fecha resultante **DEBE**
  copiarse a la liquidación al emitirla: una liquidación vieja conserva su vencimiento aunque
  después se cambie el día del consorcio, por el mismo motivo que se copia el coeficiente.
- **FR-003**: Un período **DEBE** poder liquidarse **una sola vez**. Corregir exige anular la
  liquidación y emitir una nueva, quedando ambas registradas y la nueva referenciando a la que
  anula (regla RN-06 § 7.2).
- **FR-003b**: Lo que se anula es la **`Liquidacion`**, que tiene su propio estado —emitida,
  anulada—, **no el período**, que queda `liquidado` para siempre. Anular no reabre nada: no
  devuelve el período a `cerrado` ni admite gastos nuevos. Es lo que hace compatible la regla RN-06
  (§ 7.2) con el contrato que `002` declaró compartido (M-04), y lo que sostiene la promesa de que
  lo que ya se le mandó a los consorcistas no se reescribe: se reemplaza a la vista.

#### Bloque B — Motor de liquidación (paquete 4.2, `RF-07`)

- **FR-004**: El motor de prorrateo **DEBE** residir en la capa de dominio y **NO DEBE** importar
  nada de infraestructura ni del entorno web (Principio III). La regla de análisis estático de
  `001-andamiaje` lo verifica en cada envío.
- **FR-005**: El motor **DEBE** desarrollarse con pruebas primero (§ 8.3.3), y esas pruebas
  **DEBEN** ejecutarse sin base de datos.
- **FR-006**: El motor **DEBE** verificar, antes de calcular nada, que los coeficientes suman
  exactamente `100.00000000` (regla RN-01 § 7.2) y que el período está cerrado. Si alguna falla,
  aborta e informa la causa exacta.
- **FR-006b**: El prorrateo **DEBE** ser sobre el **padrón completo**: ningún rubro se reparte
  entre un subconjunto de unidades. Toda unidad funcional tributa por su coeficiente, sea
  departamento, cochera, local o baulera, y la base del reparto es siempre `100.00000000`. Es la
  resolución del hueco H-11: si el cliente reparte algún rubro por grupo —el portón entre las
  cocheras, el ascensor desde el primer piso—, cambia la firma del motor y es alcance de otra
  etapa, no un agregado a esta.
- **FR-007**: Todo cálculo **DEBE** hacerse en aritmética decimal de precisión fija. El punto
  flotante está prohibido para dinero en cualquier capa (Principio II, medidas 1 a 4 de § 14.1).
- **FR-008**: El redondeo a dos decimales **DEBE** ocurrir sólo al final de cada importe unitario,
  nunca en pasos intermedios.
- **FR-009**: La diferencia de redondeo **DEBE** asignarse a la unidad de mayor coeficiente y
  registrarse en un **campo propio** del detalle, auditable y explicable ante un propietario que
  pregunte (regla RN-07 § 7.2).
- **FR-010**: Una diferencia **mayor a un centavo por unidad DEBE abortar** la liquidación y
  registrar un incidente.
- **FR-011**: El motor **DEBE** producir dos subtotales por unidad —ordinario y extraordinario—
  conforme a la Ley 27.551 (regla RN-05 § 7.2).
- **FR-011b**: Los dos subtotales son **informativos dentro de una sola obligación por unidad**: se
  emite un `DetalleLiquidacion` por unidad, con su total, y el cobro, la imputación y la mora son
  por unidad. El sistema **NO DEBE** emitir dos deudas separadas al ocupante y al propietario. Que
  lo ordinario sea a cargo del ocupante y lo extraordinario del propietario (Ley 27.551) queda a la
  vista en el documento; repartir el cobro entre dos personas no es alcance de esta etapa.
- **FR-012**: El coeficiente aplicado **DEBE** copiarse a cada `DetalleLiquidacion` (regla RN-02
  § 7.2).
- **FR-013**: Toda la liquidación —cálculo, persistencia, cambio de estado del período y asiento de
  auditoría— **DEBE** ocurrir en una **única transacción** (§ 12.6).
- **FR-014**: La liquidación de un consorcio de 100 unidades **DEBE** completarse en menos de 30
  segundos (RNF-07), sin contar la generación de documentos.
- **FR-015**: La emisión **DEBE** dejar encoladas las notificaciones en estado pendiente, sin
  despacharlas. Esta etapa crea la tabla `Notificacion` y el encolado; el despachador, los avisos
  de reclamos, reservas y novedades, y la interfaz son alcance de `004-servicios` (hallazgo 2).

#### Bloque C — Documento por unidad (paquete 4.3, `RF-08`)

- **FR-016**: El sistema **DEBE** generar un documento descargable por unidad, en **proceso
  diferido** disparado por la emisión (decisión 5 de § 12.1.3, RNF-07).
- **FR-017**: El documento **DEBE** mostrar coeficiente aplicado, subtotal ordinario, subtotal
  extraordinario, intereses, ajuste de redondeo si lo hubo, y total.
- **FR-018**: El documento **DEBE** ser accesible únicamente por los ocupantes de su unidad y por
  quienes tengan rol de administrador o consejo sobre ese consorcio (regla RN-12 § 7.2).
- **FR-019**: Una falla de generación **DEBE** reintentarse y **NO DEBE** invalidar la liquidación
  ya emitida (RNF-14).
- **FR-020**: La interfaz **DEBE** formatear los importes a partir de las cadenas que recibe y
  **NO DEBE** operar aritméticamente con ellos (medida 3 de § 14.1).

#### Bloque D — Pagos, imputación e intereses (paquetes 4.4 y 4.5, `RF-09`)

- **FR-021**: El sistema **DEBE** registrar pagos por unidad, con fecha, importe y medio.
- **FR-022**: La imputación **DEBE** resolverse en la tabla `PagoImputacion`, aplicando **orden de
  antigüedad**; un pago puede cubrir varios períodos y un período recibir varios pagos (regla RN-08
  § 7.2).
- **FR-023**: La suma de las imputaciones de un pago **DEBE** igualar el importe del pago con
  tolerancia cero.
- **FR-024**: El cálculo de intereses por mora **DEBE** residir en el dominio, desarrollarse con
  pruebas primero y probarse sin base de datos (§ 8.3.3). La fórmula es **interés simple por mes
  vencido completo**: `capital impago × tasa mensual × meses completos de atraso`, contados de
  fecha a fecha desde el vencimiento. **Sin prorrateo de días y sin capitalizar**: veintinueve días
  de atraso son cero meses y por lo tanto interés cero, y el segundo mes se calcula sobre el mismo
  capital que el primero.
  El cálculo es **por cada liquidación impaga, desde su propio vencimiento**, y el interés de la
  unidad es la suma de esos cálculos: una deuda de tres meses no devenga tres meses sobre el total,
  sino tres, dos y un mes sobre cada liquidación. Es lo que permite explicarle a un propietario de
  dónde sale cada peso, y lo que hace que pagar la más vieja primero (regla RN-08 § 7.2) tenga el
  efecto que esa regla busca.
- **FR-024b**: Los intereses **DEBEN** calcularse **al emitir**, sobre el saldo impago de la unidad
  a la fecha de emisión, y viajar como una línea propia del detalle. El consorcista tiene que poder
  leer cuánto debe en la expensa que recibe, sin que el saldo se mueva solo con el calendario.
- **FR-025**: La tasa aplicada **DEBE** quedar registrada en `DetalleLiquidacion.tasa_mora_aplicada`,
  junto con los **meses de atraso** y el capital sobre el que se calculó, para que el importe se
  pueda reconstruir con una calculadora (M-05, RNF-10).
- **FR-026**: Un pago que exceda la deuda **DEBE** dejar el excedente a favor de la unidad en
  `Pago.saldo_a_favor` (M-05). No se imputa a otra unidad ni se pierde.
- **FR-026b**: El saldo a favor **DEBE** aplicarse **solo** a la liquidación siguiente de esa
  unidad, en el momento de emitirla, y dejar rastro como imputación: el administrador no lo aplica a
  mano y el consorcista lo ve descontado en su expensa. Se aplica **después** de calcular los
  intereses, porque el interés corre sobre lo que estuvo impago y el saldo a favor es plata que ya
  entró.
- **FR-027**: La anulación de una liquidación **DEBE** revertir sus imputaciones y dejar los pagos
  disponibles.
- **FR-028**: El estado de cuenta por unidad **DEBE** mostrar liquidaciones, pagos, imputaciones,
  intereses y saldo.
- **FR-029**: La nómina nominada de deudores **DEBE** restringirse a administrador y consejo de
  propietarios; el consorcista ve sólo el dato agregado (regla RN-13 § 7.2).
- **FR-030**: Todas las tablas económicas nuevas —`Periodo` en sus nuevos estados, `Liquidacion`,
  `DetalleLiquidacion`, `Pago`, `PagoImputacion`— **DEBEN** quedar enganchadas al disparador de
  auditoría (regla RN-15 § 7.2, `RF-26`).

#### Bloque E — Validación en paralelo (paquete 4.6)

- **FR-031**: El equipo **DEBE** reproducir en el sistema las **tres liquidaciones reales** del
  cliente y comparar **importe por importe** contra su planilla.
- **FR-032**: Toda discrepancia **DEBE** explicarse antes de dar la etapa por terminada. Una
  discrepancia sin explicación es un defecto abierto, no una diferencia de criterio.
- **FR-033**: El resultado de la validación **DEBE** registrarse en
  `docs/entrega-final/15-pruebas.md`, en los casos `PL-01` a `PL-10`.

### Key Entities

| Entidad | Qué representa | Relaciones y restricciones clave |
|---|---|---|
| `Periodo` | Mes de operación de un consorcio | Máquina de estados completa en esta etapa; un período se liquida una sola vez (regla RN-06 § 7.2) |
| `Consorcio` | Viene de `002-nucleo` | Esta etapa le agrega el **día de vencimiento** (FR-002b) y la **tasa de mora vigente**, que fija el administrador |
| `Liquidacion` | Emisión de expensas de un período | **Estado propio** —emitida, anulada— y referencia a la liquidación que anula (FR-003b); total en decimal de precisión fija; **fecha de vencimiento copiada al emitir** (FR-002b) |
| `DetalleLiquidacion` | Importe liquidado a una unidad, en **una sola obligación** (FR-011b) | Copia del coeficiente aplicado (regla RN-02 § 7.2); subtotales ordinario y extraordinario separados (regla RN-05 § 7.2); **campo propio** para el ajuste de redondeo (regla RN-07 § 7.2); tasa, meses de atraso y capital del interés (FR-025) |
| `Pago` | Cobro recibido de una unidad | `unidad_id` obligatorio; importe en decimal |
| `PagoImputacion` | Aplicación de un pago a un detalle | Orden de antigüedad; la suma de imputaciones iguala el pago (regla RN-08 § 7.2) |
| `Notificacion` | Aviso pendiente de despacho | **Se crea en esta etapa, sin despachador.** Resuelve el hallazgo 2: ningún aviso de liquidación se pierde aunque el correo se conecte en `004-servicios` |

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sobre padrones de **1, 12, 96 y 100 unidades**, la suma de los importes de
  `DetalleLiquidacion` iguala el total de `Liquidacion` con **tolerancia cero** en el 100 % de las
  ejecuciones (regla RN-07 § 7.2).
- **SC-002**: Las pruebas del motor de prorrateo, intereses e imputación corren con `DATABASE_URL`
  **sin definir** y pasan. Cero pruebas del dominio requieren base de datos (Principio III).
- **SC-003**: Una diferencia inyectada **mayor a un centavo por unidad** aborta la liquidación en
  el **100 %** de los casos y deja un incidente registrado. Cero emisiones con diferencia por
  encima del umbral.
- **SC-004**: Un padrón que suma `99.99999999` es rechazado **antes** de calcular, con la
  diferencia exacta y las unidades involucradas en el mensaje (regla RN-01 § 7.2).
- **SC-005**: Las **3** liquidaciones reales del cliente se reproducen con coincidencia **al
  centavo en cada importe unitario**. Cero discrepancias sin explicación escrita (paquete 4.6,
  riesgo RT-01 § 11.2).
- **SC-006**: La liquidación del consorcio de **100 unidades** completa en **menos de 30 segundos**,
  medido sobre 5 ejecuciones consecutivas en el entorno de demostración con la semilla §13.4 (I-08, RNF-07), sin contar documentos.
- **SC-007**: La emisión sobre 96 unidades produce **96** documentos, ni uno menos, y el trabajo
  diferido completa en menos de 10 minutos con progreso, reintento y alerta observables; una falla
  inyectada en uno de ellos deja los otros 95 intactos y la liquidación válida (I-08).
- **SC-008**: Un intento de acceder al documento de otra unidad devuelve «no encontrado» en el
  **100 %** de los intentos, incluyendo manipulación directa del identificador en la dirección
  (regla RN-12 § 7.2).
- **SC-009**: Un pago que cubre una liquidación y media se imputa por antigüedad y la suma de sus
  imputaciones iguala el pago con **tolerancia cero** (regla RN-08 § 7.2).
- **SC-010**: Un fallo inyectado en cualquier paso de la liquidación deja la base **exactamente
  como estaba**: cero liquidaciones a medias, cero períodos en estado inconsistente.
- **SC-011**: Un período **no puede tener dos liquidaciones emitidas a la vez**: un segundo intento
  falla en el **100 %** de los casos, incluida la ejecución concurrente —dos ejecuciones
  simultáneas contra el mismo período en prueba de integración con barrera, exactamente una emite—
  (M-07, regla RN-06 § 7.2). Después de **anular**, una reemisión sí procede aunque el período siga
  en `liquidado`: el candado es la liquidación emitida, no el estado del período (FR-003b).
- **SC-012**: Cada operación sobre las **5** entidades económicas de la etapa deja exactamente un
  asiento de auditoría. Cero operaciones sin asiento.
- **SC-013**: Una emisión con el servicio de correo caído **igual emite**, y deja la notificación
  encolada en estado pendiente. Cero liquidaciones fallidas por causa del correo (RNF-14).
- **SC-014**: La cobertura de pruebas del paquete de dominio de liquidación, prorrateo, intereses e
  imputación es del **100 % de las ramas de decisión**. Es el único paquete del sistema con ese
  umbral, y se justifica en que un error aquí invalida el sistema.
- **SC-014b**: El interés es reconstruible con una calculadora: veintinueve días de atraso dan
  **cero**, sesenta dan dos meses sobre el mismo capital, y el detalle muestra tasa, meses y capital
  aplicados (FR-024, FR-025). Con tres liquidaciones impagas, el interés es la suma de tres cálculos
  independientes —tres, dos y un mes— y no dos meses sobre el total. Probado sin base de datos.
- **SC-014c**: Un pago que excede la deuda deja el excedente a favor, y la liquidación siguiente de
  esa unidad lo muestra descontado sin que nadie lo aplique a mano; la suma de imputaciones sigue
  igualando el pago con tolerancia cero (FR-026b).
- **SC-015**: Un consorcista que consulta morosidad ve el dato agregado y **cero** nombres de
  deudores; un administrador ve la nómina (regla RN-13 § 7.2).
- **SC-016**: La descarga de la expensa propia funciona a 390 px sin desplazamiento horizontal
  (RNF-01) y sin infracciones WCAG 2.1 de nivel A o AA (RNF-11).

### Cierre contra la definición de terminado (§ 8.3.4)

| # | Condición | Cómo la cierra esta etapa |
|---|---|---|
| 1 | Integrado y revisado | Una rama por `RF-nn`; el paquete 4.2 se construye **en pares** por ser el núcleo del negocio (§ 10) |
| 2 | Pruebas y verificación en verde | SC-001 a SC-003 y SC-014 corren dentro de la verificación automática |
| 3 | Autorización por rol y consorcio | SC-008 y SC-015: el documento por unidad y la nómina de deudores son los dos puntos donde una fuga sería más grave |
| 4 | Opera en teléfono | SC-016 |
| 5 | Mensajes de error comprensibles | SC-004: el aborto por coeficientes informa causa y magnitud, no un volcado técnico (RNF-10) |
| 6 | Desplegado en demostración | La validación en paralelo del paquete 4.6 se corre sobre el entorno desplegado, no en local |
| 7 | Auditoría de datos económicos | SC-012. Es la etapa donde todo dato es económico |
| 8 | Documentación actualizada | FR-033: los casos `PL-01` a `PL-10` de § 15 quedan con resultado |

---

## Assumptions

- Las **tres liquidaciones reales** del cliente están en poder del equipo antes de escribir la
  primera línea del motor. El riesgo RT-01 (§ 11.2) lo exige y `002-nucleo` FR-027 las pidió. **Si
  no están, esta etapa no arranca**: construir el motor sin el patrón de comparación es construir
  a ciegas el componente de mayor riesgo del proyecto.
- La reserva de 40 h asignada al riesgo RT-01 (§ 11) está disponible para esta etapa. Es donde
  corresponde gastarla.
- `Periodo` llega de `002-nucleo` con apertura y listado; esta etapa completa la máquina de
  estados. Es la resolución del hallazgo 1 del análisis de insumos.
- `Notificacion` se crea aquí sin despachador. Es la resolución del hallazgo 2: la liquidación de
  esta etapa no puede emitir avisos porque el despachador es de `004-servicios`, y encolar sin
  despachar evita perderlos.
- La tasa de interés por mora y el día de vencimiento los fija el administrador por consorcio; el
  sistema no los deduce ni los actualiza solo.
- **El prorrateo es sobre el padrón completo** (FR-006b). Si las tres liquidaciones reales del
  cliente muestran algún rubro repartido entre un grupo de unidades, esta suposición cae y la etapa
  se replantea antes de escribir el motor: es lo que el hueco H-11 vino a evitar.
- El presupuesto es de **194 h**, sin cambios respecto del punto 10: esta etapa no absorbió nada de
  `001-andamiaje`.
- El desempate de «unidad de mayor coeficiente» por identificador menor es una decisión de esta
  especificación, tomada para que el cálculo sea determinístico. Si el cliente prefiere otro
  criterio, es un cambio de una línea en el dominio y de una prueba.
