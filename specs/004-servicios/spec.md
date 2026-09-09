# Especificación de etapa: Servicios y análisis (iteración 3)

**Feature Branch**: `004-servicios`

**Created**: 2026-09-08

**Status**: Draft

**Input**: Iteración 3 del cronograma (§ 8.3.1), 8 semanas, 243 h. Alcance comprometido: `RF-11` a
`RF-16`, `RF-18` a `RF-25` y `RF-06` — reclamos, reservas, novedades, documentación,
notificaciones, indicadores de gestión y funciones asistidas. Casos de uso `CU-07` a `CU-15`.
La fila de § 8.3.1 repite `RF-12` y `RF-20`, que ya están dentro de los rangos: es énfasis en las
funciones asistidas, no un error de cobertura.

> **Convención de códigos.** `FR-nnn` numera los requisitos **locales de esta especificación**.
> Los códigos del proyecto conservan su prefijo: `RF-nn`, `RNF-nn`, `CU-nn`, `RT-nn`, `I-n`. Ante
> la colisión del prefijo `RN-` entre las quince reglas de negocio del punto 7 y los seis riesgos
> de negocio del punto 11, se escribe siempre **«regla RN-nn (§ 7.2)»** y **«riesgo RN-nn
> (§ 11.2)»**.

**Depende de**: `003-liquidacion` terminada. Las reservas necesitan la deuda vencida (`CU-09`), la
morosidad necesita detalles y pagos, y el despachador de notificaciones tiene avisos encolados
esperándolo desde la etapa anterior.

**Es la etapa de mayor incertidumbre y la primera candidata a recorte** si el plazo se comprime
(§ 8.3.1, § 8.5). Esa decisión ya está tomada de antemano, y el orden de recorte del punto 11 la
gobierna: se recorta lo asistido, nunca los indicadores, que satisfacen el requisito obligatorio de
la cátedra.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Las pruebas de concepto deciden qué se construye (Priority: P1)

Paquete 5.1 · § 8.4.3 · riesgos RT-02 y RT-03 (§ 11.2) · § 14.3

Antes de escribir el primer reclamo, el equipo ejecuta las dos pruebas de concepto desechables:
extracción de datos de comprobantes y búsqueda semántica sobre reglamentos. Cada una tiene un
criterio de aceptación numérico. Con el resultado en la mano se elige el proveedor de servicios de
procesamiento automático (§ 14.3, diferido a propósito hasta aquí) y se decide si `RF-06`, `RF-12`
y `RF-20` se construyen completos, reducidos o postergados.

**Why this priority**: § 8.4.3 lo ordena y el orden importa. Construir las funciones asistidas
antes de saber si alcanzan su umbral es gastar 59 h (paquetes 5.6 a 5.8) en algo que puede no
servir.

**Independent Test**: correr las dos pruebas de concepto contra sus juegos de datos reales y
comparar el resultado con el umbral, sin ambigüedad.

**Acceptance Scenarios**:

1. **Given** 30 comprobantes reales de Grupo Delta de proveedores y formatos variados, **When** se
   ejecuta la extracción, **Then** se mide el porcentaje de campos correctos sin corrección humana
   y se acepta con **≥ 80 %** (§ 8.4.3).
2. **Given** un reglamento de copropiedad real y 20 preguntas frecuentes, **When** se ejecuta la
   búsqueda semántica, **Then** se mide en cuántas el fragmento correcto aparece **entre los tres
   primeros** y se acepta con **≥ 85 %** (§ 8.4.3).
3. **Given** una prueba de concepto que **no** alcanza su umbral, **When** se registra el
   resultado, **Then** el requerimiento asociado se reduce o se posterga, y la decisión queda
   escrita antes de construir nada.
4. **Given** el resultado de ambas pruebas, **When** se cierra el paquete 5.1, **Then** § 14.3
   queda escrito con el proveedor elegido y su justificación contra los seis criterios ya fijados,
   y deja de estar abierto.
5. **Given** el código de las pruebas de concepto, **When** termina el paquete, **Then** se
   **descarta**: son exploratorias y desechables (§ 8.4.3), y ninguna línea suya pasa a producción.

---

### User Story 2 — El consorcista abre un reclamo y lo sigue hasta el cierre (Priority: P1)

`RF-11` · `RF-13` · `CU-07` · `CU-08` · reglas RN-11 y RN-12 (§ 7.2)

El consorcista registra un reclamo desde el teléfono, con rubro y descripción. El administrador lo
toma, le asigna responsable y proveedor, y lo mueve por sus estados hasta cerrarlo. Cada transición
queda en el historial.

**Why this priority**: es el requerimiento de mayor valor percibido por el consorcista y la fuente
de datos de los indicadores I-3 e I-4, que hacen medibles dos objetivos de la organización que
antes no lo eran (§ 9.3). Es P1 porque cinco requerimientos posteriores cuelgan de él.

**Independent Test**: abrir un reclamo, recorrer todas sus transiciones y verificar que el
historial las contiene todas, y que un usuario de otro consorcio no lo ve.

**Acceptance Scenarios**:

1. **Given** un consorcista habilitado, **When** registra un reclamo con rubro y descripción,
   **Then** queda en el estado inicial y **sin responsable**, que es el único estado que lo admite
   (regla RN-11 § 7.2).
2. **Given** un reclamo en estado inicial, **When** se intenta moverlo a otro estado sin asignar
   responsable, **Then** el sistema lo rechaza (regla RN-11 § 7.2).
3. **Given** cualquier transición de estado, **When** ocurre, **Then** queda un asiento en
   `ReclamoHistorial` con estado anterior, estado nuevo, autor y momento. Cero transiciones sin
   asiento: es la fuente del indicador I-4.
4. **Given** un usuario de otro consorcio, **When** intenta ver el reclamo por su identificador,
   **Then** obtiene «no encontrado» (regla RN-12 § 7.2).
5. **Given** una transición de estado, **When** ocurre, **Then** deja encolada la notificación al
   autor y al responsable (`RF-14`).

---

### User Story 3 — El administrador ve el panel de indicadores y decide (Priority: P1)

`RF-21` a `RF-25` · `CU-11` · indicadores `I-1` a `I-6` · RNF-06 · reglas RN-12 y RN-13 (§ 7.2)

El administrador abre el panel y ve, sobre datos generados por el propio sistema, la morosidad de
la cartera, el gasto por rubro con sus desvíos, el desempeño de los proveedores y el tiempo de
resolución de reclamos, cada uno con su alerta.

**Why this priority**: satisface el **requisito obligatorio de la cátedra** sobre herramientas para
la toma de decisiones, y el punto 10 lo declara no negociable. Es P1 y no se recorta bajo ninguna
compresión de plazo.

**Independent Test**: con el juego de datos de § 13.4 y doce períodos liquidados, comprobar cada
indicador contra un cálculo hecho a mano sobre esos mismos datos.

**Acceptance Scenarios**:

1. **Given** doce períodos liquidados con pagos, **When** se abre `I-1`, **Then** la morosidad
   coincide con el cálculo manual y la serie mensual muestra la línea de referencia del 12 %.
2. **Given** un consorcio que supera el 15 % de morosidad o que crece 3 puntos en dos meses,
   **When** se abre el panel, **Then** aparece la alerta correspondiente.
3. **Given** un rubro con desvío superior al 30 % respecto del promedio móvil de los doce períodos
   anteriores **del mismo consorcio**, **When** se abre `I-2`, **Then** el desvío aparece
   destacado. La comparación nunca es contra un valor fijo: en contexto inflacionario señalaría
   desvíos donde sólo hay actualización de precios (§ 9.2).
4. **Given** `I-4`, **When** se lo calcula, **Then** usa **mediana y percentil 90**, no promedio:
   unos pocos reclamos muy largos distorsionan el promedio y ocultan el comportamiento habitual.
5. **Given** un consorcista, **When** intenta abrir el panel, **Then** no accede; **Given** un
   miembro del consejo, **When** abre el detalle de morosidad, **Then** ve la nómina nominada
   (regla RN-13 § 7.2).
6. **Given** el panel completo, **When** se lo carga, **Then** responde en menos de 2 segundos en
   el percentil 95 (RNF-06), apoyado en vistas materializadas refrescadas de madrugada.
7. **Given** los indicadores, **When** se los calcula, **Then** se calculan **dentro de la
   aplicación y de su base**, sin herramienta externa de inteligencia de negocios: los datos
   personales no salen del sistema (RNF-13, § 9.1).

---

### User Story 4 — El consorcista reserva un espacio común (Priority: P2)

`RF-15` · `RF-16` · `CU-09` · reglas RN-10 y RN-12 (§ 7.2)

El administrador da de alta los espacios comunes y sus reglas de uso. El consorcista reserva uno, y
el sistema impide la superposición y verifica que la unidad no tenga deuda vencida.

**Why this priority**: es valor visible para el consorcista y depende de la deuda vencida que
`003-liquidacion` construyó. Es P2 porque su ausencia no impide operar el sistema.

**Independent Test**: intentar dos reservas superpuestas del mismo espacio y verificar que la
segunda es rechazada **por la base de datos**; intentar reservar con deuda vencida y verificar el
rechazo.

**Acceptance Scenarios**:

1. **Given** una reserva confirmada, **When** se intenta otra que se superpone en el mismo espacio,
   **Then** la **base de datos** la rechaza por restricción de exclusión sobre el rango horario
   (regla RN-10 § 7.2), no el código.
2. **Given** una unidad con deuda vencida, **When** su ocupante intenta reservar, **Then** el
   sistema lo rechaza con un mensaje comprensible que nombra la causa (precondición de `CU-09`,
   RNF-10).
3. **Given** una reserva confirmada o rechazada, **When** cambia de estado, **Then** deja encolada
   la notificación al solicitante (`RF-14`).
4. **Given** dos solicitudes simultáneas para el mismo horario, **When** se procesan, **Then**
   exactamente una queda confirmada.

---

### User Story 5 — El consorcista recibe avisos y consulta novedades y documentación (Priority: P2)

`RF-14` · `RF-18` · `RF-19` · `CU-12` · `CU-15` · RNF-14

Se construye el despachador de notificaciones que consume la cola creada en `003-liquidacion`, se
publican novedades y se carga la documentación del consorcio.

**Why this priority**: el despachador tiene avisos de liquidación esperando desde la etapa
anterior, y `RF-20` no puede existir sin `RF-19`. Va después del panel porque el panel es
requisito obligatorio y esto no.

**Independent Test**: emitir una liquidación en la etapa anterior, correr el despachador y
verificar que los avisos encolados salen; cortar el correo y verificar que nada del negocio falla.

**Acceptance Scenarios**:

1. **Given** notificaciones encoladas desde `003-liquidacion`, **When** corre el despachador,
   **Then** las despacha y ninguna se pierde (hallazgo 2 del análisis de insumos).
2. **Given** un fallo del servicio de correo, **When** el despachador reintenta, **Then** la
   notificación queda pendiente y **ninguna función del negocio se bloquea** (RNF-14).
3. **Given** un administrador, **When** publica una novedad, **Then** los consorcistas del
   consorcio la ven y reciben el aviso.
4. **Given** un documento del consorcio cargado, **When** se marca como no visible para
   consorcistas, **Then** sólo administrador y consejo lo ven.

---

### User Story 6 — Las funciones asistidas ayudan y nunca deciden (Priority: P3)

`RF-06` · `RF-12` · `RF-20` · `CU-13` · `CU-14` · `CU-10` · reglas RN-14 y RN-12 (§ 7.2) ·
RNF-14 · RNF-15 · Principio IV

El sistema extrae los datos de un comprobante y los **propone**; el operador confirma y recién ahí
nace el gasto. El sistema clasifica el rubro y la urgencia de un reclamo y **sugiere** un proveedor.
El consorcista pregunta en lenguaje natural sobre la documentación y obtiene la respuesta **con
cita del documento y del fragmento**.

**Why this priority**: son las de mayor incertidumbre y las únicas cuya ausencia no impide operar
(§ 8.3.1). Son las primeras candidatas a recorte, y esa decisión está tomada de antemano en lugar
de improvisarse bajo presión.

**Independent Test**: deshabilitar el servicio externo y verificar que las tres funciones degradan
a su equivalente manual sin bloquear nada; preguntar algo que no está en la documentación cargada y
verificar que el sistema no inventa.

**Acceptance Scenarios**:

1. **Given** un comprobante cargado, **When** se ejecuta la extracción, **Then** se crea una
   `ExtraccionComprobante`, que es una **entidad separada de `Gasto`**; el gasto nace recién en la
   acción de confirmar del operador (regla RN-14 § 7.2, Principio IV).
2. **Given** una extracción con un campo mal reconocido, **When** el operador lo corrige y
   confirma, **Then** el gasto se crea con el valor corregido y la corrección queda registrada:
   es la fuente del indicador I-5.
3. **Given** un reclamo nuevo, **When** se ejecuta el triage, **Then** produce una
   `SugerenciaReclamo` —rubro, urgencia y proveedor sugerido— que el administrador acepta o
   descarta. **Nunca** cambia el estado del reclamo por sí sola.
4. **Given** una pregunta sobre la documentación, **When** el sistema responde, **Then** la
   respuesta **cita el documento y el fragmento de origen**. Sin fuente, no hay respuesta
   (Principio IV).
5. **Given** una pregunta cuya respuesta **no** está en la documentación cargada, **When** se la
   formula, **Then** el sistema dice que no la encuentra, y no inventa.
6. **Given** un consorcista, **When** consulta documentación, **Then** el filtro por consorcio y
   por visibilidad se aplica **antes** de recuperar fragmentos, no después de generar la respuesta
   (regla RN-12 § 7.2).
7. **Given** el servicio externo caído, **When** se usa cualquiera de las tres funciones, **Then**
   degrada a su equivalente manual sin bloquear el sistema (RNF-14).
8. **Given** cada una de las cuatro interfaces del dominio —`ExtractorDocumental`,
   `ClasificadorTexto`, `GeneradorVectores`, `GeneradorRespuesta`—, **When** se revisa el código,
   **Then** cada una tiene **exactamente tres** implementaciones: la del proveedor, una
   determinística para pruebas y una nula para degradación (RNF-14, RNF-15, § 12.8).

---

### Edge Cases

- **Un reclamo cerrado que se reabre.** Es una transición más, con su asiento; el indicador I-4
  mide el tiempo hasta el **último** cierre, y eso se documenta para que el número sea
  interpretable.
- **Un consorcio sin doce períodos de historia.** El indicador I-2 no puede calcular el promedio
  móvil: se muestra el dato con la advertencia de historia insuficiente, no un desvío falso.
- **Un proveedor sin reclamos asignados.** Aparece en I-3 con las columnas de tiempo vacías, no con
  cero: cero significaría resolución instantánea.
- **Una reserva de un espacio dado de baja.** Las reservas futuras se cancelan y se notifican; las
  pasadas se conservan.
- **Un documento de 200 páginas.** La indexación es diferida (§ 12.2); la carga del documento no
  espera a que termine.
- **Una pregunta en la que el fragmento correcto sale cuarto.** Cuenta como fallo del criterio de
  § 8.4.3, que exige estar entre los tres primeros. El umbral no se relaja después de medir.
- **El proveedor de servicios automáticos cambia de precio o desaparece.** Es exactamente el caso
  que RNF-15 anticipa: se reemplaza la implementación de las cuatro interfaces sin tocar la lógica
  de negocio.
- **El panel con la cartera completa de 11 consorcios y cinco años de datos.** Las vistas están
  materializadas y refrescadas de madrugada; el presupuesto de RNF-06 se mide sobre ese volumen
  (§ 7.5), no sobre datos de juguete.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Bloque A — Pruebas de concepto y elección de proveedor (paquete 5.1)

- **FR-001**: El equipo **DEBE** ejecutar las dos pruebas de concepto de § 8.4.3 **antes** de
  construir `RF-06`, `RF-12` y `RF-20`, y registrar el resultado numérico.
- **FR-002**: Si una prueba de concepto no alcanza su umbral (80 % y 85 % respectivamente), el
  requerimiento asociado **DEBE** reducirse o postergarse, con la decisión escrita.
- **FR-003**: `docs/entrega-final/14-codificacion.md` § 14.3 **DEBE** quedar escrito con el
  proveedor elegido y su justificación contra los seis criterios ya fijados. Deja de estar abierto.
- **FR-004**: El código de las pruebas de concepto **DEBE** descartarse: es exploratorio y
  desechable (§ 8.4.3).

#### Bloque B — Reclamos (paquete 5.2, `RF-11`, `RF-13`)

- **FR-005**: El sistema **DEBE** registrar reclamos con consorcio, unidad opcional, rubro, autor,
  descripción, estado y responsable.
- **FR-006**: Un reclamo **DEBE** tener siempre un estado, y responsable asignado en todo estado
  distinto del inicial (regla RN-11 § 7.2).
- **FR-007**: Toda transición de estado **DEBE** dejar un asiento en `ReclamoHistorial` con estado
  anterior, estado nuevo, autor y momento.
- **FR-008**: Un reclamo **DEBE** poder asociarse a un proveedor y, si genera erogación, a un gasto
  (fuente de los indicadores I-3 e I-4).

#### Bloque C — Espacios y reservas (paquete 5.3, `RF-15`, `RF-16`)

- **FR-009**: El sistema **DEBE** permitir administrar espacios comunes y sus reglas de uso.
- **FR-010**: La superposición de reservas confirmadas del mismo espacio **DEBE** impedirse con
  **restricción de exclusión en la base de datos** sobre el rango horario (regla RN-10 § 7.2), no
  con validación de aplicación.
- **FR-011**: Una unidad con deuda vencida **NO DEBE** poder reservar (precondición de `CU-09`).
  La verificación consume el saldo que `003-liquidacion` produce.

#### Bloque D — Notificaciones, novedades y documentación (paquete 5.4, `RF-14`, `RF-18`, `RF-19`)

- **FR-012**: El sistema **DEBE** construir el **despachador** de notificaciones que consume la
  cola creada en `003-liquidacion`, con reintentos (hallazgo 2 del análisis de insumos).
- **FR-013**: El despachador **DEBE** cubrir las cuatro notificaciones de § 12.7: liquidación
  publicada, cambio de estado de reclamo, reserva confirmada o rechazada, y novedad publicada.
- **FR-014**: Una falla del servicio de correo **NO DEBE** hacer fallar ninguna operación de
  negocio (RNF-14).
- **FR-015**: El sistema **DEBE** permitir publicar novedades por consorcio.
- **FR-016**: El sistema **DEBE** permitir cargar documentación del consorcio —reglamento de
  copropiedad, reglamento interno, actas y contratos— con marca de visibilidad para consorcistas.
  La **baja de documento está diferida** (§ 9.11) y se opera por soporte.

#### Bloque E — Indicadores (paquete 5.5, `RF-21` a `RF-25`)

- **FR-017**: Los seis indicadores `I-1` a `I-6` **DEBEN** construirse sobre las vistas de § 7.7:
  `v_morosidad_consorcio`, `v_gasto_rubro_periodo`, `v_desempeno_proveedor`,
  `v_resolucion_reclamos`. Todo cálculo monetario usa decimal de precisión fija en todos sus pasos
  (`NUMERIC` en vistas, cadena hacia la interfaz); el promedio móvil de I-2 y la división de
  importes redondean solo al final con precisión fijada (I-05, Principio II). La regla
  `flay/sin-aritmetica-monetaria` cubre este código.
- **FR-018**: Las vistas **DEBEN** materializarse y refrescarse de madrugada, para sostener RNF-06
  sobre el panel.
- **FR-019**: `I-2` **DEBE** comparar contra el promedio móvil de los doce períodos anteriores
  **del mismo consorcio**, nunca contra un valor fijo (§ 9.2, amenaza A2 del FODA).
- **FR-020**: `I-4` **DEBE** usar mediana y percentil 90, no promedio (§ 9.2).
- **FR-021**: Los indicadores **DEBEN** heredar la autorización por consorcio (regla RN-12 § 7.2),
  y la nómina nominada de deudores **DEBE** restringirse a administrador y consejo (regla RN-13
  § 7.2).
- **FR-022**: Los indicadores **DEBEN** calcularse dentro de la aplicación y su base, **sin**
  herramienta externa de inteligencia de negocios: los datos personales no salen del sistema
  (RNF-13, § 9.1).
- **FR-023**: Cada indicador **DEBE** tener sus alertas implementadas: morosidad > 15 % o +3 puntos
  en dos meses (`I-1`); desvío > 30 % o ausencia de gasto en rubro recurrente (`I-2`); meta de 72 h
  para urgencias (`I-4`).
- **FR-024**: `docs/entrega-final/14-codificacion.md` § 14.2 **DEBE** ratificarse o rectificarse al
  iniciar este paquete, contra la herramienta de graficación efectivamente usada.

#### Bloque F — Funciones asistidas (paquetes 5.6 a 5.8, `RF-06`, `RF-12`, `RF-20`)

- **FR-025**: Cada una de las cuatro interfaces del dominio —`ExtractorDocumental`,
  `ClasificadorTexto`, `GeneradorVectores`, `GeneradorRespuesta`— **DEBE** declararse en
  `src/dominio/contratos` y tener **exactamente tres** implementaciones en infraestructura: la del
  proveedor, una determinística para pruebas y una nula para degradación (RNF-14, RNF-15,
  Principio IV, § 12.8).
- **FR-026**: La extracción **DEBE** producir una `ExtraccionComprobante`, entidad separada de
  `Gasto`. El gasto nace recién al confirmar el operador (regla RN-14 § 7.2). La pantalla es la que
  `002-nucleo` FR-020 dejó preparada: se enchufa, no se rediseña.
- **FR-027**: El triage **DEBE** producir una `SugerenciaReclamo` que el administrador acepta o
  descarta. **Nunca** modifica el estado del reclamo por sí solo.
- **FR-028**: La consulta documental **DEBE** citar documento y fragmento en toda respuesta. Sin
  fuente, no hay respuesta (Principio IV).
- **FR-029**: El filtro por consorcio y por visibilidad **DEBE** aplicarse **antes** de recuperar
  fragmentos, no después de generar la respuesta (regla RN-12 § 7.2).
- **FR-030**: La indexación de documentos **DEBE** ser diferida y no bloquear la carga (§ 12.2).
- **FR-031**: Cada función asistida **DEBE** probarse con el servicio deshabilitado, y la búsqueda
  documental **DEBE** probarse con preguntas cuya respuesta no está en la documentación cargada
  (verificación del Principio IV).

#### Bloque G — Cierre del proyecto

- **FR-032**: Todas las tablas económicas nuevas **DEBEN** quedar enganchadas al disparador de
  auditoría (regla RN-15 § 7.2, `RF-26`).
- **FR-032b**: Exportación abierta (§ 5.5.4, I-06): el sistema **DEBE** exponer exportación por
  consorcio en formato abierto (CSV) de gastos, liquidación y pagos, con autorización por
  habilitación vigente. Es lo que SC-018 verifica como "exportación abierta".
- **FR-033**: Las tres condiciones de verificación de § 5.5.4 —degradación ante fallas de terceros,
  exportación abierta de los datos y prueba de concepto de `RF-20`— **DEBEN** quedar verificadas y
  registradas.
- **FR-034**: `docs/entrega-final/15-pruebas.md` **DEBE** quedar con los resultados de los casos
  `PA-01` a `PA-07`, `PI-01` a `PI-09`, `PR-01` a `PR-09` y `PN-01` a `PN-06`.
- **FR-035**: § 14.5 (métricas), § 13.3, § 13.5, § 13.7, § 16 (manual de usuario) y § 17
  (capacitación) **DEBEN** completarse al cierre, y la auditoría externa de § 18 **DEBE** quedar
  registrada como puerta de producción.

### Key Entities

| Entidad | Qué representa | Relaciones y restricciones clave |
|---|---|---|
| `Reclamo` | Pedido de intervención de un consorcista | `consorcio_id` obligatorio; estado siempre presente y responsable salvo en el inicial (regla RN-11 § 7.2) |
| `ReclamoHistorial` | Asiento de cada transición de estado | Fuente del indicador `I-4`; cero transiciones sin asiento |
| `SugerenciaReclamo` | Rubro, urgencia y proveedor **sugeridos** | Separada de `Reclamo`: sugiere, nunca decide (Principio IV) |
| `EspacioComun` | Espacio de uso común y sus reglas | `consorcio_id` obligatorio |
| `Reserva` | Uso reservado de un espacio en un rango horario | Restricción de exclusión sobre el rango (regla RN-10 § 7.2); precondición de deuda vencida |
| `Novedad` | Comunicado del consorcio | `consorcio_id` y autor obligatorios |
| `DocumentoConsorcio` | Reglamento, acta o contrato | Marca de visibilidad para consorcistas; contenido en almacenamiento de objetos |
| `FragmentoDocumento` | Fragmento indexado con su vector | Índice vectorial `pgvector`; filtrado por consorcio y visibilidad **antes** de recuperar |
| `ConsultaDocumental` | Pregunta, respuesta y fuentes citadas | Sin fuente, no se persiste respuesta |
| `Notificacion` | Aviso a despachar (creada en `003-liquidacion`) | Esta etapa construye el **despachador** |
| `ExtraccionComprobante` | Datos propuestos a partir de un comprobante | **Separada de `Gasto`**: el gasto nace al confirmar (regla RN-14 § 7.2) |

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: La prueba de concepto de extracción se mide sobre **30 comprobantes reales** y su
  resultado se compara con el umbral del **80 %**; la de búsqueda semántica sobre **20 preguntas**
  contra el umbral del **85 %** (§ 8.4.3). Cero umbrales relajados después de medir.
- **SC-002**: § 14.3 queda escrito con proveedor elegido y justificación. **0** puntos de § 14
  abiertos al cerrar la etapa.
- **SC-003**: **100 %** de las transiciones de estado de reclamo dejan asiento en
  `ReclamoHistorial`. Cero transiciones sin asiento.
- **SC-004**: Un intento de mover un reclamo fuera del estado inicial sin responsable es rechazado
  en el **100 %** de los casos (regla RN-11 § 7.2).
- **SC-005**: Dos reservas superpuestas del mismo espacio: la segunda es rechazada **por la base de
  datos** en el **100 %** de los intentos, incluida la ejecución concurrente (regla RN-10 § 7.2).
  La prueba lo verifica saltándose la capa de aplicación.
- **SC-006**: Una unidad con deuda vencida no puede reservar en el **100 %** de los intentos, y el
  mensaje nombra la causa (RNF-10).
- **SC-007**: Las notificaciones encoladas por `003-liquidacion` se despachan en el **100 %** de
  los casos al correr el despachador. **Cero** avisos perdidos entre etapas (hallazgo 2).
- **SC-008**: Con el servicio de correo caído, **0** operaciones de negocio fallan y **100 %** de
  las notificaciones quedan pendientes con reintento (RNF-14).
- **SC-009**: Los **6** indicadores coinciden con el cálculo manual sobre el juego de datos de
  § 13.4 con doce períodos liquidados. Cero indicadores sin verificación independiente.
- **SC-010**: El panel completo, sobre el volumen a cinco años del punto 7.5 (11 consorcios,
  ~600.000 registros), responde en **menos de 2 segundos en el percentil 95** sobre 100 cargas
  con el arnés `medir:p95` en el entorno de demostración (RNF-06, I-07). Estado de cuenta,
  reclamos y reservas quedan fuera del presupuesto verificado y se declaran así (I-07).
- **SC-011**: Un consorcista obtiene **0** filas de la nómina nominada de deudores y sí el dato
  agregado; administrador y consejo obtienen la nómina (regla RN-13 § 7.2).
- **SC-012**: Cada una de las **4** interfaces del dominio tiene **exactamente 3** implementaciones.
  Una búsqueda en el repositorio que devuelva 2 o 4 es un defecto (RNF-15, § 12.8).
- **SC-013**: Con el servicio externo deshabilitado, las **3** funciones asistidas degradan a su
  equivalente manual y **0** funciones del negocio quedan bloqueadas (RNF-14).
- **SC-014**: **100 %** de las respuestas de `RF-20` citan documento y fragmento. Una respuesta sin
  fuente es un defecto, no una respuesta parcial (Principio IV).
- **SC-015**: Sobre un juego de **10** preguntas cuya respuesta **no** está en la documentación
  cargada, el sistema responde «no encontrado» en las 10. Cero invenciones.
- **SC-016**: Un consorcista formula una pregunta cuya respuesta está en un documento no visible
  para consorcistas o de otro consorcio: obtiene «no encontrado» en el **100 %** de los casos, y el
  fragmento **nunca** llega al generador de respuesta (regla RN-12 § 7.2).
- **SC-017**: Ningún gasto se crea sin confirmación humana explícita. **0** filas de `Gasto`
  originadas directamente por una extracción (regla RN-14 § 7.2).
- **SC-018**: Las **3** condiciones de verificación de § 5.5.4 quedan verificadas y registradas,
  incluyendo la exportación CSV por consorcio de FR-032b (I-06).
- **SC-020**: Reclamo y reserva a 390 px sin desplazamiento horizontal y 0 infracciones WCAG 2.1
  A/AA con `test:a11y` (I-10, RNF-01, RNF-11).
- **SC-021**: Cada operación sobre las tablas económicas nuevas de la etapa deja exactamente un
  asiento de auditoría con anterior y posterior; cero operaciones sin asiento (I-10).
- **SC-022**: I-1 a I-3 cuadran en decimal con tolerancia cero contra el cálculo manual; cero
  importes en punto flotante en el pipeline de indicadores (I-05).
- **SC-019**: La demostración final recorre `CU-07` a `CU-15` sobre el entorno desplegado, según el
  guion de 8 pasos de § 13.1, corriendo únicamente sobre la semilla ficticia versionada § 13.4
  (se registra su hash) y **0** datos reales de personas (M-08).

### Cierre contra la definición de terminado (§ 8.3.4)

| # | Condición | Cómo la cierra esta etapa |
|---|---|---|
| 1 | Integrado y revisado | Una rama por `RF-nn`; 15 requerimientos, todos con revisión cruzada |
| 2 | Pruebas y verificación en verde | SC-003 a SC-017 corren dentro de la verificación automática; los casos `PA`, `PI`, `PR` y `PN` de § 15 se completan |
| 3 | Autorización por rol y consorcio | SC-011 y SC-016. `RF-20` es el punto más delicado del sistema: el filtro va **antes** de recuperar fragmentos, nunca después de generar |
| 4 | Opera en teléfono | El reclamo y la reserva son los flujos que el consorcista usa desde el teléfono; se verifican a 390 px con WCAG 2.1 AA (RNF-01, RNF-11) |
| 5 | Mensajes de error comprensibles | SC-006 y toda la degradación de SC-013: «el servicio no está disponible, cargue el dato a mano» es un mensaje, un volcado técnico no |
| 6 | Desplegado en demostración | SC-019: la demostración final corre sobre el entorno desplegado |
| 7 | Auditoría de datos económicos | FR-032 |
| 8 | Documentación actualizada | FR-034 y FR-035: es la etapa que cierra los puntos 13 a 18 |

---

## Assumptions

- `003-liquidacion` está terminada y sus avisos están encolados esperando al despachador.
- El cliente provee **30 comprobantes reales** y un **reglamento de copropiedad real** con 20
  preguntas frecuentes para las pruebas de concepto (§ 8.4.3). Sin ellos, el paquete 5.1 no puede
  medir nada, y sin medir no se decide si construir.
- § 14.3 se decide **aquí y no antes**. El diferimiento es deliberado: las cuatro interfaces del
  dominio (§ 12.8) permiten construir las etapas 1 a 3 sin saber quién será el proveedor.
- El orden de recorte del punto 11 gobierna si el plazo se comprime: se recortan las funciones
  asistidas (paquetes 5.6 a 5.8, 59 h), **nunca** el panel de indicadores (paquete 5.5, 52 h), que
  satisface el requisito obligatorio de la cátedra. Esa decisión está tomada de antemano.
- La reserva de 80 h asignada al riesgo RG-01 (§ 11) está disponible; es la etapa más larga y la
  que más probablemente la use.
- El presupuesto es de **243 h**, sin cambios respecto del punto 10.
- El indicador `I-5` mide la carga administrativa contra la línea de base de 38 horas mensuales del
  punto 2.7. Ese número viene del análisis y no se recalcula: es el patrón contra el que se verifica
  el supuesto crítico del riesgo RN-01 (§ 11.2).
- El 10 % de la capacidad se reserva para refactorización, conforme a la constitución.
