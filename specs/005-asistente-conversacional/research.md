# Research — Asistente conversacional (RF-27)

Las decisiones abiertas se resolvieron con el responsable del proyecto antes de planificar; aquí
quedan con su fundamento y las alternativas descartadas.

## R-01 — Capacidad conversacional como quinta interfaz del dominio

- **Decisión**: agregar `AgenteConversacional` al contrato `src/dominio/contratos/asistencia.ts`,
  con llamado a herramientas, y sumarla a `interface Asistencia`. Tres implementaciones:
  `gemini` (function calling), `determinista` (ruteo por palabra clave, para pruebas) y `nula`
  (degradación).
- **Rationale**: Principio IV exige tres implementaciones por interfaz de asistencia y proveedor
  reemplazable (RNF-15); el patrón ya existe para las otras cuatro. Mantiene al SDK de IA en un
  solo archivo (`gemini.ts`).
- **Alternativas descartadas**: (a) extender `GeneradorRespuesta` con tool-calling — mezcla dos
  responsabilidades y rompe su contrato probado; (b) llamar al SDK desde la capa de aplicación —
  viola el Principio III.

## R-02 — El modelo propone, un paso aparte ejecuta (escrituras)

- **Decisión**: el orquestador, ante una intención de escritura, **persiste una propuesta**
  (`estadoPropuesta: pendiente`) y devuelve una tarjeta; la ejecución vive en `confirmar.ts`, que
  corre el caso de uso real por id. Idempotente: solo `pendiente` ejecuta; al ejecutar pasa a
  `confirmada` en la misma transacción.
- **Rationale**: Principio IV / RN-14 / FR-006/FR-008. Evita que un doble clic, una recarga o un
  reenvío dupliquen. El texto de la tarjeta lo arma el servidor resolviendo IDs a nombres (FR-007),
  lo que además contiene inyección de instrucciones desde texto de terceros.
- **Alternativas descartadas**: ejecutar con "function calling automático" del proveedor —
  entrega la decisión económica al modelo; prohibido por la constitución.

## R-03 — El modelo no es la frontera de seguridad

- **Decisión**: el registro de herramientas filtra por rol solo para **ofrecer** (UX). La
  autorización real la hace cada caso de uso vía `conAutorizacion` (rol + ocupación + consorcio).
  Nada de Prisma directo ni filtros `consorcioId` a mano.
- **Rationale**: Principio I y `pruebas/dominio/filtro-unico.spec.ts`. Aunque el modelo invente una
  herramienta fuera de alcance, el caso de uso responde `NoEncontrado`.
- **Alternativas descartadas**: confiar en que el prompt "no se salga del rol" — no es verificable
  ni seguro.

## R-04 — Minimización de datos hacia el proveedor (RNF-13)

- **Decisión**: una función `minimizar` recorta de los resultados que van al modelo todo dato
  personal (nombre, correo, teléfono, documento); al modelo van unidades, montos, fechas y estados.
  Los datos completos que ve el usuario viajan aparte (`paraUI`) y los dibuja la interfaz.
- **Rationale**: 12-diseño §8.5 ("nunca datos personales ni de deuda" al índice) y 18-seguridad
  (minimización en transferencias). La morosidad nominada que un administrador puede ver se muestra
  en la UI pero **no** se envía al modelo.
- **Alternativas descartadas**: mandar todo al modelo para fluidez — contradice los documentos de
  seguridad y habilita que el modelo invente o equivoque una cifra.
- **Pendiente para docs**: declarar explícitamente esta minimización en `12-diseno.md §8.5` y en
  `18-seguridad.md` (hoy hablan solo del índice documental).

## R-05 — Conversación multi-turno persistida y aislada

- **Decisión**: `ConversacionAsistente` lleva `consorcioId` (aislada por la extensión de Prisma) y
  `usuarioId`; `MensajeAsistente` cuelga de ella. El historial que recibe el modelo son los últimos
  turnos. Los mensajes se leen por su conversación (`include: { mensajes }`), nunca el modelo
  `mensajeAsistente` directo (decisión #10 del proyecto: tablas sin `consorcioId` se alcanzan por su
  padre aislado).
- **Rationale**: FR-012; permite repreguntas; deja rastro. Aislamiento por construcción.
- **Alternativas descartadas**: estado solo en el cliente — se pierde el rastro y complica la
  idempotencia de la propuesta.

## R-06 — Alcance de administrador a varios edificios

- **Decisión**: toda herramienta acepta `consorcioId` opcional validado contra `misConsorcios`; por
  defecto el de la ruta. Cada consulta a otro consorcio re-autoriza (`enConsorcio` anida: es
  `AsyncLocalStorage.run`).
- **Rationale**: FR-011; el usuario lo pidió explícitamente. `conAutorizacion` ya cubre la
  habilitación de plataforma/administradora.
- **Alternativas descartadas**: limitar siempre al consorcio activo — no cumple el pedido.

## R-07 — Límite de dominio y fecha

- **Decisión**: instrucción de sistema acotada a Flay; lo ajeno recibe una negativa fija (acción
  `responder` con el texto estándar, sin invocar herramientas). La fecha de hoy se inyecta desde
  `RELOJ` en horario `America/Argentina/Buenos_Aires`.
- **Rationale**: FR-003 / SC-006; "el sábado" necesita hoy.
- **Alternativas descartadas**: dejar que el modelo use su propia noción de fecha — no determinista
  ni probable.

## R-08 — Sin streaming en v1

- **Decisión**: request/respuesta. La respuesta llega completa; mientras tanto, estado de "pensando".
- **Rationale**: el tool-calling necesita salida estructurada igual; el SSE del proyecto
  (`notificaciones/stream`) queda disponible como mejora futura sin bloquear v1.
- **Alternativas descartadas**: streaming token a token ahora — complejidad sin valor para el MVP.

## R-09 — Tope de saltos del orquestador

- **Decisión**: el loop de "invocar herramienta de lectura → volver a preguntar al modelo" tiene un
  tope fijo (4). Al alcanzarlo, el asistente responde con lo que tenga o pide precisión.
  `// ponytail: tope fijo de 4 saltos; subir si una consulta real necesita encadenar más`.
- **Rationale**: evita bucles y costo descontrolado; 4 cubre "buscar unidad → ver reservas →
  proponer".

## R-08 — Revisión (iteración 2): la respuesta se transmite

**Decisión**: el turno viaja como flujo de eventos (`POST /api/asistente`, un JSON por línea) y el
texto llega a medida que el proveedor lo produce. Cambia lo que R-08 dejó afuera; se mantiene lo que
decidió: la salida estructurada de la llamada a herramienta no se transmite, solo la prosa.

**Por qué ahora**: el pedido de uso real fue ver que el asistente trabaja y leer la respuesta al
instante. El costo resultó chico porque ya existía el patrón de flujo del proyecto.

**Decisiones que arrastra**:

- *NDJSON sobre `fetch`, no SSE*: `EventSource` es solo GET y esto vive un turno; no hay
  reconexión ni keepalive que mantener.
- *`emitir` como cuarto parámetro de `conversar`*, no un `AsyncIterable`: lo que el método decide es
  una acción; el texto es un canal lateral, y así «no lanza por indisponibilidad» sigue siendo una
  propiedad de la firma. Si el modelo emite prosa y luego invoca una herramienta, la aplicación
  manda `descartar` y el cliente limpia lo parcial.
- *El hilo deja de ser región viva*: un párrafo que crece releído entero por el lector de pantalla
  es peor que ninguno. El lector oye el paso y, al terminar, la respuesta completa una vez, desde una
  región viva fuera del diálogo (SC-011).

## R-10 — Sugerencias de continuación

Un método más del agente, `sugerir`, con sus tres implementaciones; se llama **después** de `fin`,
así que nunca demora la respuesta, y su indisponibilidad no se nota. Una sugerencia es
`{ etiqueta, pedido, herramienta? }`; al tocarla se manda `pedido` como un mensaje de usuario más.
No es un vector de inyección: no ejecuta nada y toda escritura sigue por la tarjeta (SC-009). Se
descartan las que piden una herramienta no ofrecida al rol, y se corta en tres. Pedirlas en la misma
llamada que la respuesta se descartó: con llamadas a herramienta y prosa libre no hay salida
estructurada en el mismo turno.

## R-11 — Ancla de la conversación en modo «todos»

`ConversacionAsistente.consorcioId` sigue siendo `NOT NULL` y pasa a significar «el consorcio desde
el que se abrió el hilo». Volverlo nullable no sirve: el aislamiento se decide por la **existencia**
de la columna, no por su nulabilidad, y quitarla sacaría el hilo del aislamiento (RN-12).

## R-12 — El aviso a la cartera es de mejor esfuerzo

No hay transacción que cruce consorcios y la auditoría es por disparador, fila por fila. La
herramienta itera `publicarNovedad` (cada llamada abre su propio contexto aislado) y reporta en cuáles
salió. Si salió en alguno **no lanza**: lanzar devolvería la propuesta a `pendiente` y un reintento
duplicaría la novedad donde ya se publicó. Si fallan todos, lanza y el reintento es seguro.
