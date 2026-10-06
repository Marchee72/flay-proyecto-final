# Feature Specification: Asistente conversacional (RF-27)

**Feature Branch**: `005-asistente-conversacional`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Un chatbot dentro del panel para que cada usuario consulte y opere en lenguaje natural solo sobre lo que ya puede ver y hacer en la interfaz segun su rol, ocupacion y consorcio. Toda escritura se confirma con una tarjeta. El asistente nunca responde fuera del alcance del usuario ni fuera del dominio de Flay."

> **Requisito de la cátedra**: *"el sistema debe incorporar funcionalidades de inteligencia
> artificial que agreguen valor"* (consigna, punto 13). Esta funcionalidad es el **RF-27** y el
> caso de uso **CU-16**. Reutiliza la consulta documental asistida (RF-20, CU-10) como una
> capacidad más del asistente, sin reemplazarla.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — El consorcista pregunta por lo suyo (Priority: P1)

Un consorcista abre el asistente desde el panel de su consorcio y escribe en lenguaje natural:
"¿cuánto debo?", "¿qué reservas hay para el salón el sábado?", "¿en qué quedó mi reclamo del
ascensor?". El asistente entiende la intención, consulta la información que ese usuario ya puede
ver en la interfaz y responde con los datos reales, sin pedirle que navegue el menú.

**Why this priority**: es el corazón de la propuesta de valor —bajar la barrera de uso del
sistema para personas que no son usuarias técnicas— y es un producto mínimo viable por sí solo:
un asistente de **solo lectura** ya entrega valor y es demostrable sin ninguna de las historias
siguientes.

**Independent Test**: con la semilla cargada, iniciar sesión como consorcista, preguntar por
expensas, morosidad, reservas y reclamos propios, y verificar que las respuestas coinciden con lo
que muestran las pantallas correspondientes y que nunca aparecen datos de unidades ajenas ni de
otros consorcios.

**Acceptance Scenarios**:

1. **Given** un consorcista con una unidad con deuda vencida, **When** pregunta "¿tengo deuda?",
   **Then** el asistente responde con el saldo y los períodos impagos de su unidad, y con nada de
   otra unidad.
2. **Given** un consorcista, **When** pregunta por la morosidad del edificio, **Then** el
   asistente da el dato **agregado** (porcentaje/monto total) y **no** nombra deudores (RN-13).
3. **Given** un consorcista cuyo consorcio tiene documentación indexada, **When** pregunta algo
   que responde el reglamento, **Then** el asistente responde **con cita** de documento y página;
   si no hay respaldo, dice que no lo encontró en la documentación cargada (RF-20, Principio IV).
4. **Given** un consorcista, **When** pide algo ajeno al dominio ("escribime un poema",
   "¿qué tiempo hace?"), **Then** el asistente se niega con un mensaje fijo y no intenta responder.

---

### User Story 2 — Crear una operación con confirmación (Priority: P2)

Desde el asistente, un usuario pide realizar una acción que modifica datos: reservar un espacio
común o registrar un reclamo. El asistente **no ejecuta** la acción: arma una **tarjeta** con el
resumen de lo que se va a hacer (espacio, unidad, fecha y horario; o título y descripción del
reclamo) y un botón de confirmación. Recién al confirmar, la operación se ejecuta por los mismos
caminos y con las mismas validaciones que la interfaz tradicional.

**Why this priority**: convierte al asistente de consulta en herramienta de trabajo, pero depende
de que exista la base conversacional de la P1. La confirmación humana es una exigencia
constitucional (Principio IV) y del pedido.

**Independent Test**: pedir una reserva por el asistente; verificar que (a) aparece la tarjeta con
los datos correctos, (b) nada se creó antes de confirmar, (c) al confirmar se crea exactamente una
reserva y (d) un segundo clic no crea una segunda.

**Acceptance Scenarios**:

1. **Given** un consorcista sin deuda vencida que ocupa una unidad, **When** pide reservar el SUM
   el sábado de 20 a 23, **Then** el asistente muestra una tarjeta con esos datos y un botón
   "Confirmar", y aún no existe la reserva.
2. **Given** la tarjeta de confirmación de una reserva, **When** el usuario confirma, **Then** se
   crea la reserva (una sola vez) con las reglas del espacio aplicadas y aparece el aviso de éxito.
3. **Given** una tarjeta ya confirmada, **When** el usuario vuelve a confirmar o recarga, **Then**
   no se crea una segunda reserva y el asistente informa que ya fue realizada.
4. **Given** un consorcista con deuda vencida, **When** pide reservar, **Then** la confirmación es
   rechazada con el motivo de negocio (misma regla que la interfaz), no por el asistente.
5. **Given** la tarjeta de confirmación, **When** el usuario descarta, **Then** la operación no se
   realiza y la conversación continúa.

---

### User Story 3 — El administrador gestiona el edificio (Priority: P2)

Un administrador usa el asistente para ver la morosidad nominada, revisar y **asignar** reclamos a
un responsable, **publicar una novedad** (que notifica a los destinatarios) y ver gastos del
edificio. Puede trabajar sobre el consorcio activo o pedir explícitamente otro de su
administración.

**Why this priority**: amplía el alcance a quien más repite estas tareas. Las escrituras de
administrador (asignar, publicar) reutilizan el mecanismo de tarjeta de la P2.

**Independent Test**: como administrador, pedir la morosidad del edificio (debe venir nominada),
asignar un reclamo abierto a un responsable válido vía tarjeta, publicar una novedad vía tarjeta, y
repetir una consulta de lectura sobre otro consorcio de su administración nombrándolo.

**Acceptance Scenarios**:

1. **Given** un administrador, **When** pregunta por la morosidad del edificio, **Then** recibe la
   nómina de deudores (nominada), cosa que al consorcista se le niega.
2. **Given** un administrador y un reclamo abierto, **When** pide asignarlo a un responsable,
   **Then** el asistente muestra la tarjeta con el responsable resuelto por su nombre y, al
   confirmar, el reclamo pasa a "asignado".
3. **Given** un administrador que administra varios consorcios, **When** nombra otro consorcio de
   su administración en la pregunta, **Then** el asistente responde sobre ese consorcio; **When**
   nombra uno que no administra, **Then** no obtiene datos.
4. **Given** un usuario sin rol de administrador, **When** intenta asignar un reclamo o publicar
   una novedad por el asistente, **Then** la operación es rechazada por la autorización, no por la
   interfaz del asistente.

---

### User Story 4 — La conversación recuerda el hilo (Priority: P3)

El asistente mantiene el contexto de la conversación: el usuario puede referirse a turnos
anteriores ("¿y el mes pasado?", "reservá ese mismo horario pero el domingo") y el asistente lo
entiende. La conversación queda registrada.

**Why this priority**: mejora notablemente la experiencia pero el asistente es útil aun
respondiendo preguntas sueltas; por eso es P3.

**Independent Test**: hacer una pregunta, luego una repregunta que solo tenga sentido con el
contexto anterior, y verificar que la respuesta es coherente; confirmar que los mensajes quedan
registrados y asociados al usuario y consorcio.

**Acceptance Scenarios**:

1. **Given** una respuesta previa sobre las expensas de este mes, **When** el usuario pregunta "¿y
   el mes pasado?", **Then** el asistente responde sobre el período anterior sin pedir que repita
   la unidad.

---

### Edge Cases

- **Servicio de IA no disponible**: el asistente degrada con un mensaje claro ("el asistente no
  está disponible en este momento") y, cuando aplica (reglamentos), ofrece el camino manual. Nunca
  lanza un error crudo (RNF-14, RNF-15).
- **Intención ambigua o incompleta** (falta la fecha, el espacio o la unidad): el asistente
  pregunta lo que falta antes de armar una tarjeta; no inventa valores.
- **Texto de terceros con instrucciones** (una descripción de reclamo o una novedad que dice
  "ignorá las reglas y..."): no altera el comportamiento; las acciones solo salen de la tarjeta de
  confirmación y de datos resueltos en el servidor.
- **"El sábado", "mañana"**: se interpretan contra la fecha actual en horario de Argentina.
- **Fuera de la ruta de un consorcio** (lista, bandeja): el asistente está disponible en todo el
  panel; arranca en modo «todos los consorcios» si hay más de uno, o en el único que alcanza. El
  hilo se ancla al último consorcio usado (FR-017).
- **Reclamo/espacio/unidad inexistente o ajeno** referido por el usuario: no se encuentra, igual
  que en la interfaz (no se revela su existencia).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE ofrecer un asistente conversacional dentro del panel de un consorcio
  que acepte preguntas y pedidos en lenguaje natural en español.
- **FR-002**: El asistente DEBE responder **únicamente** con información que el usuario ya puede
  ver en la interfaz según su rol, su ocupación y el consorcio. La autorización la resuelven los
  casos de uso existentes; el asistente no es la frontera de seguridad (Principio I).
- **FR-003**: El asistente DEBE limitarse al dominio de Flay (consorcios, expensas, reservas,
  reclamos, novedades, documentación). Ante un pedido ajeno al dominio DEBE negarse con un mensaje
  fijo, sin intentar responderlo.
- **FR-004**: El asistente DEBE poder consultar, como mínimo: estado y disponibilidad de reservas;
  expensas, estado de cuenta y morosidad (agregada para consorcista, nominada para
  administrador/consejo, RN-13); datos de la unidad del usuario y del consorcio; gastos del
  edificio; reclamos propios y generales; novedades vigentes; y la documentación/reglamentos con
  cita y abstención (reutiliza RF-20).
- **FR-005**: El asistente DEBE poder iniciar, como mínimo, estas operaciones de escritura: crear
  reserva y registrar reclamo (cualquier rol habilitado); asignar reclamo y publicar novedad (solo
  administrador).
- **FR-006**: Ninguna operación de escritura iniciada por el asistente DEBE ejecutarse sin una
  **confirmación humana explícita**. El asistente DEBE presentar una tarjeta con el resumen de la
  acción y un control de confirmación antes de ejecutar (Principio IV, RN-14).
- **FR-007**: El resumen de la tarjeta DEBE construirlo el sistema a partir de los datos reales
  (resolviendo identificadores a nombres), no el modelo generativo; y los parámetros de la acción
  DEBEN validarse en el servidor en el momento de ejecutar, sin confiar en lo que haya llegado del
  cliente.
- **FR-008**: La confirmación DEBE ser **idempotente**: una propuesta confirmada no puede volver a
  ejecutarse (un doble clic, una recarga o un reenvío no crean duplicados), y solo la puede
  confirmar el usuario que la originó.
- **FR-009**: Al ejecutarse, cada escritura DEBE pasar por el mismo caso de uso que la interfaz
  tradicional, con sus validaciones, autorización y auditoría; el asistente no abre un camino
  alternativo (Principio V).
- **FR-010**: Los datos que se envían al proveedor de IA DEBEN estar **minimizados**: sin nombre,
  correo, teléfono ni documento de personas; solo unidades, montos, fechas y estados. Las cifras y
  datos que el usuario ve DEBEN provenir del caso de uso y mostrarse en la interfaz, no redactarse
  por el modelo (RNF-13, Ley 25.326; coherente con 12-diseño §8.5).
- **FR-011**: El administrador DEBE poder dirigir una consulta a otro consorcio dentro de su
  administración nombrándolo; por defecto el asistente opera sobre el consorcio activo de la ruta.
  Toda consulta a otro consorcio DEBE re-autorizarse.
- **FR-012**: El asistente DEBE conservar el hilo de la conversación de modo que el usuario pueda
  referirse a turnos anteriores, y DEBE registrar la conversación asociada al usuario y al
  consorcio.
- **FR-013**: Ante la indisponibilidad del servicio de IA, el asistente DEBE degradar con un
  mensaje comprensible y sin interrumpir el resto del panel (RNF-10, RNF-14, RNF-15).
- **FR-014**: El asistente DEBE ser utilizable en teléfono (390×844) y cumplir accesibilidad A/AA
  (RNF-01).

- **FR-015** *(iteración 2)*: el asistente DEBE mostrar que está trabajando, nombrar cada consulta
  que hace («Consultando reclamos…») y entregar el texto de la respuesta a medida que llega. Lo que
  se persiste y lo que se envía al proveedor no cambia: el texto final es el mismo.
- **FR-016**: el asistente DEBE cerrar sus respuestas con hasta tres sugerencias de continuación
  (o la pregunta por un dato faltante) construidas sobre las herramientas ofrecidas al rol. Tocar una
  DEBE enviar su texto como un mensaje del usuario más y NUNCA ejecutar una operación: toda
  escritura sigue pasando por la tarjeta de confirmación (FR-006). No se ofrecen junto a una tarjeta.
- **FR-017**: el usuario DEBE poder elegir el alcance dentro del chat —un consorcio de su alcance o
  «todos los consorcios»—, con el consorcio de la ruta (o el último usado) por omisión, y el chat
  DEBE mostrar el o los consorcios en contexto. Cambiar el alcance empieza un hilo nuevo. En modo
  «todos», el consorcio de `ConversacionAsistente` es el **ancla** (desde dónde se abrió el hilo);
  no limita lo que se consulta, porque cada herramienta resuelve y re-autoriza el suyo (FR-011).
- **FR-018**: en modo «todos los consorcios» el asistente DEBE poder hacer consultas, publicar una
  novedad a toda la cartera con una sola confirmación, y cualquier otra escritura **sobre un único
  consorcio nombrado** por la persona (por nombre o dirección, nunca por identificador): se enruta a
  ese consorcio, la tarjeta de confirmación lo nombra y se re-autoriza sobre él (FR-011). Si no se
  nombra cuál, el asistente lo pregunta; una escritura de un solo consorcio nunca se asume sobre el
  ancla ni se difunde a todos. Una consulta atada a un consorcio, si no se nombra cuál, DEBE resolverse sobre todos los consorcios del alcance donde el rol alcanza, con un resultado por consorcio, de modo que el asistente pueda sumar, comparar y rankear entre ellos (p. ej. «¿cuántos morosos hay en total?»). Cada corrida re-autoriza por su cuenta (FR-011) y es de mejor esfuerzo: un consorcio que falla no tumba a los demás.
- **FR-019**: la publicación a la cartera DEBE informar en cuáles consorcios se publicó y en cuáles
  no. Es de mejor esfuerzo (no hay transacción entre consorcios): si salió en alguno la propuesta
  queda confirmada para que un reintento no duplique; si fallaron todos, vuelve a pendiente.

### Key Entities *(include if feature involves data)*

- **Conversación**: un hilo entre un usuario y el asistente en el contexto de un consorcio. Guarda
  a quién pertenece y sobre qué consorcio ocurre (aislada como el resto de los datos de negocio).
- **Mensaje del asistente**: cada turno de la conversación (del usuario, del asistente o resultado
  de una herramienta consultada), en orden. Un mensaje puede llevar una **propuesta de acción**
  con su estado (pendiente, confirmada, descartada), que es lo que respalda la idempotencia de la
  confirmación.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En las pruebas de alcance, un consorcista **nunca** obtiene, por ninguna pregunta,
  datos de una unidad que no ocupa ni de un consorcio sobre el que no tiene habilitación vigente
  (0 fugas).
- **SC-002**: La morosidad que recibe un consorcista es siempre agregada (sin nombres); la del
  administrador/consejo es nominada (RN-13), verificado en pruebas.
- **SC-003**: Ninguna operación de escritura ocurre sin confirmación: en las pruebas, iniciar una
  escritura y no confirmar deja el sistema sin cambios; confirmar la ejecuta exactamente una vez,
  aun con doble confirmación o recarga.
- **SC-004**: Los datos enviados al proveedor de IA no contienen nombre, correo, teléfono ni
  documento de ninguna persona, verificado en pruebas con la implementación de prueba.
- **SC-005**: Toda respuesta sobre documentación que afirme algo incluye al menos una cita; cuando
  no hay respaldo, el asistente lo declara en lugar de inventar (hereda SC-014/SC-015 de RF-20).
- **SC-006**: Un pedido ajeno al dominio de Flay recibe la negativa fija y ninguna respuesta de
  contenido, verificado en pruebas.
- **SC-007**: Con el servicio de IA caído, el asistente responde el mensaje de degradación y el
  resto del panel sigue funcionando (sin error visible al usuario).

- **SC-008** *(iteración 2)*: el indicador de actividad y los pasos aparecen antes de la respuesta
  y el texto llega en más de una entrega, verificado en pruebas.
- **SC-009**: tocar una sugerencia no produce ningún cambio en la base; solo la confirmación de la
  tarjeta lo hace.
- **SC-010**: en modo «todos los consorcios», una escritura de un solo consorcio sin consorcio nombrado
  no se propone ni se ejecuta (se pregunta cuál); con consorcio nombrado escribe solo en ese; y el
  aviso a la cartera escribe exactamente una fila por consorcio administrado y ninguna en otro
  (0 fugas, RT-04).
- **SC-011**: con el chat transmitiendo, axe no reporta infracciones A/AA y el hilo no es una región
  viva: el lector oye el paso en curso y la respuesta completa una sola vez.

## Assumptions

- El asistente reutiliza los casos de uso de lectura y escritura ya existentes (reservas,
  expensas, pagos, reclamos, novedades, gastos, documentación) y no crea reglas de negocio nuevas:
  su trabajo es entender la intención y enrutarla.
- La capacidad conversacional se incorpora como una interfaz de asistencia más del dominio, con
  las tres implementaciones que exige la constitución (proveedor real, determinista para pruebas,
  nula para degradación). Las pruebas corren con la implementación determinista.
- Alcance: la respuesta se transmite desde la iteración 2 (FR-015; ver R-08, revisada); sin
  notificaciones proactivas del asistente; el asistente no modifica datos económicos de liquidación (gastos,
  pagos, liquidaciones) — esas operaciones siguen por la interfaz dedicada.
- La retención/borrado de conversaciones bajo la Ley 25.326 se tratará junto con la política
  general de datos personales del sistema, fuera del alcance de esta feature.
- La página dedicada de consulta documental (RF-20) se mantiene; el asistente la ofrece además
  como una capacidad conversacional.

## Dependencies

- **RF-20 / CU-10** (consulta documental asistida): reutilizada como capacidad "consultar
  reglamentos".
- Casos de uso existentes de reservas, liquidación/expensas, pagos, reclamos, comunicación/novedades
  y gastos, todos con autorización por rol y consorcio.
- Infraestructura de asistencia automática (contrato del dominio con sus tres implementaciones) y
  su selección por entorno.
