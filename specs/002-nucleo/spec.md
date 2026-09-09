# Especificación de etapa: Núcleo (iteración 1)

**Feature Branch**: `002-nucleo`

**Created**: 2026-09-08

**Status**: Clarificada (sesión 2026-09-09)

**Input**: Iteración 1 del cronograma (§ 8.3.1), 6 semanas. Alcance comprometido: `RF-01` a
`RF-05`, `RF-10`, `RF-17` y `RF-26` — usuarios, roles y habilitaciones; consorcios, unidades y
coeficientes; gastos, rubros, proveedores y comprobantes; y la bitácora de auditoría. Casos de uso
`CU-01`, `CU-02` y `CU-05`. Se agrega el **mínimo de períodos** que `RF-04` necesita para existir
(hallazgo 1 del análisis de insumos).

> **Convención de códigos.** `FR-nnn` numera los requisitos **locales de esta especificación**.
> Los códigos del proyecto conservan su prefijo: `RF-nn`, `RNF-nn`, `CU-nn`, `RT-nn`. Ante la
> colisión del prefijo `RN-` entre las quince reglas de negocio del punto 7 y los seis riesgos de
> negocio del punto 11, se escribe siempre **«regla RN-nn (§ 7.2)»** y **«riesgo RN-nn (§ 11.2)»**.

**Depende de**: `001-andamiaje` terminada. Sin la verificación automática, el aislamiento en un
solo punto y la bitácora inviolable, ningún requerimiento de esta etapa puede cumplir la definición
de terminado.

---

## Clarifications

### Session 2026-09-09

- Q: ¿Qué mecanismo ejecuta el reintento cuando falla el correo de invitación o la subida de un
  comprobante? (FR-006, RNF-14) → A: Tabla de pendientes con reintento oportunista en el siguiente
  pedido, más un botón «reenviar» explícito para el administrador.
- Q: Cuando dos administradores editan coeficientes del mismo consorcio a la vez, ¿qué impide que la
  suma quede distinta de `100.00000000`? (FR-011, regla RN-01 § 7.2) → A: Disparador diferido en la
  base que valida la suma al confirmar la transacción.
- Q: ¿Bajo qué condiciones se mide el percentil 95 de menos de 2 segundos del listado de gastos?
  (SC-006, RNF-06) → A: En caliente, descartando la primera consulta tras la suspensión; el arranque
  en frío se mide y se informa aparte, sin condicionar el criterio.
- Q: ¿Qué tamaño máximo y qué formatos acepta un comprobante? (FR-018) → A: 25 MB; PDF, JPEG, PNG,
  WebP, HEIC y TIFF. Obliga a subida directa al almacenamiento y a resolver la presentación de los
  formatos que el navegador no muestra.
- Q: ¿Qué protege al inicio de sesión de un atacante que prueba contraseñas una tras otra? (FR-001,
  RNF-04) → A: Bloqueo temporal de la cuenta tras cinco intentos fallidos, durante quince minutos.
- Q: Dar de alta un consorcio no se puede autorizar por par (rol, consorcio) porque todavía no hay
  consorcio. ¿Cómo se autoriza? (FR-009) → A: Un rol por encima de los del punto 12, en tabla propia.
- Q: ¿Cuáles son los roles del sistema y con qué alcance? (FR-007) → A: Tres niveles.
  **Plataforma**: super administrador (configuración general, alta de administradoras y de
  consorcios). **Empresa**: administradora (todos los consorcios de su cartera). **Consorcio**:
  administrador delegado (los consorcios asignados), consorcista (su unidad) y consejo, que **se
  suma** a consorcista con su propia vigencia en lugar de reemplazarlo.
- Q: ¿Dueño e inquilino son roles distintos? (FR-008) → A: No. Un solo rol de consorcista; la
  distinción se deriva de la ocupación vigente, que ya la guarda con tipo y vigencia. Pueden ser la
  misma persona.
- Q: ¿Quién registra al inquilino de una unidad? (FR-008) → A: La administración, y también el
  **propietario de esa unidad**, limitado a su unidad y a ocupaciones de tipo inquilino.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — El administrador entra al sistema y ve sólo lo suyo (Priority: P1)

`RF-03` · `CU-01` · regla RN-12 (§ 7.2) · RNF-03 · RNF-04 · riesgo RT-04

El primer administrador existe por semilla de arranque. Inicia sesión, invita a otra persona por
correo, le asigna un rol y una habilitación sobre un consorcio concreto. Esa persona ve ese
consorcio y ningún otro.

**Why this priority**: es la primera historia porque todo lo demás cuelga de ella. `Habilitacion`
es la tabla que materializa el Principio I, y hasta que exista no hay forma de verificar la
condición 3 de la definición de terminado sobre nada. Además cierra el hueco H-08: ningún documento
decía quién crea al primer administrador.

**Independent Test**: dos usuarios habilitados sobre consorcios distintos consultan el mismo
listado; cada uno obtiene exclusivamente sus datos, y un usuario sin habilitación vigente obtiene
cero filas.

**Acceptance Scenarios**:

1. **Given** una base recién migrada, **When** se ejecuta la semilla de arranque, **Then** existe
   exactamente un usuario administrador con contraseña derivada con Argon2id (RNF-04) y ninguna
   contraseña en texto plano ni en el repositorio.
2. **Given** un administrador autenticado, **When** invita a una persona por correo electrónico,
   **Then** se envía la invitación y la persona puede fijar su contraseña sin que el administrador
   la conozca.
3. **Given** un usuario con habilitación vigente sobre el consorcio A y ninguna sobre el B,
   **When** solicita cualquier dato del consorcio B por cualquier vía —listado, detalle,
   identificador directo en la dirección—, **Then** obtiene cero resultados o «no encontrado»,
   nunca un mensaje que revele la existencia del recurso.
4. **Given** una habilitación cuya vigencia terminó ayer, **When** el usuario consulta, **Then**
   obtiene cero resultados: la vigencia se evalúa contra la fecha, no contra la existencia de la
   fila.
5. **Given** una persona ocupante de una unidad, **When** se intenta registrar una segunda
   ocupación vigente del mismo tipo sobre esa unidad en la misma fecha, **Then** la **base de
   datos** la rechaza por restricción de exclusión (regla RN-09 § 7.2), no el código.

---

### User Story 2 — El administrador carga el consorcio, sus unidades y los coeficientes (Priority: P1)

`RF-01` · `RF-02` · `CU-01` · reglas RN-01 y RN-02 (§ 7.2)

El administrador da de alta un consorcio, carga sus unidades funcionales con el coeficiente de cada
una, y el sistema no lo deja cerrar el alta hasta que la suma sea exactamente 100,000000 %. Un
cambio de coeficiente rige hacia el futuro y no altera ninguna liquidación ya emitida.

**Why this priority**: es la precondición aritmética de toda la etapa 3. Un coeficiente mal cargado
no produce un error visible: produce una liquidación incorrecta meses después.

**Independent Test**: cargar el consorcio de 96 unidades del juego de datos de § 13.4 y comprobar
que la suma de coeficientes da exactamente `100.00000000` y que el alta con suma distinta es
rechazada con el detalle de la diferencia.

**Acceptance Scenarios**:

1. **Given** un consorcio con unidades cuya suma de coeficientes es `99.99999999`, **When** se
   intenta confirmar, **Then** el sistema rechaza y muestra la diferencia exacta y las unidades
   involucradas, en un mensaje comprensible para el usuario final (RNF-10).
2. **Given** un consorcio cuyos coeficientes suman exactamente `100.00000000`, **When** se
   confirma, **Then** el alta se registra y queda apto para liquidar.
3. **Given** un coeficiente vigente, **When** se lo modifica, **Then** se cierra la vigencia del
   anterior y se abre una nueva desde una fecha futura, y ambos quedan en `CoeficienteHistorico`
   (regla RN-02 § 7.2).
4. **Given** un intento de modificar un coeficiente con vigencia retroactiva, **When** se confirma,
   **Then** el sistema lo rechaza.
5. **Given** cualquier coeficiente, **When** se lo persiste, **Then** se almacena con ocho
   decimales en tipo decimal de precisión fija, nunca en punto flotante (Principio II).

---

### User Story 3 — El administrador registra un gasto con su comprobante (Priority: P1)

`RF-04` · `RF-05` · `RF-17` · `CU-02` · reglas RN-03 y RN-04 (§ 7.2)

El administrador registra un gasto del consorcio, clasificado en un rubro y como ordinario o
extraordinario, imputado a un período abierto, asociado a un proveedor, y le adjunta el comprobante
digitalizado.

**Why this priority**: es la entrada de datos que alimenta toda la etapa 3 y los indicadores de la
etapa 4. Sin gastos no hay nada que liquidar ni que analizar.

**Independent Test**: cargar 30 gastos con comprobante sobre un período abierto, y comprobar que
cada uno queda clasificado, imputado y con su archivo recuperable.

**Acceptance Scenarios**:

1. **Given** un período abierto, **When** se registra un gasto con rubro, proveedor, importe y
   fecha, **Then** queda persistido con el importe en decimal de precisión fija y clasificado como
   ordinario o extraordinario (regla RN-04 § 7.2).
2. **Given** un período liquidado, **When** se intenta registrar o modificar un gasto sobre él,
   **Then** el sistema lo rechaza (regla RN-03 § 7.2).
3. **Given** un gasto registrado, **When** se adjunta un comprobante en imagen o PDF, **Then** el
   archivo queda en el almacenamiento de objetos y el gasto lo referencia; el archivo sólo es
   recuperable por usuarios con habilitación vigente sobre ese consorcio.
4. **Given** la pantalla de registro de gasto, **When** se la construye, **Then** deja la costura
   prevista para que la etapa 4 enchufe la extracción asistida (`RF-06`) **sin rediseñarla**: el
   formulario acepta valores precargados y exige confirmación humana explícita antes de crear el
   gasto (regla RN-14 § 7.2, Principio IV).
5. **Given** un gasto creado, modificado o borrado, **When** termina la operación, **Then** la
   bitácora contiene el asiento correspondiente, puesto por disparador (regla RN-15 § 7.2).

---

### User Story 4 — El consorcista consulta los gastos y comprobantes de su consorcio (Priority: P2)

`RF-10` · `CU-05` · RNF-06 · regla RN-12 (§ 7.2)

El consorcista entra desde el teléfono, filtra los gastos de su consorcio por período y por rubro,
y abre el comprobante de cualquiera de ellos.

**Why this priority**: es la primera funcionalidad que un usuario final ve y la que hace
demostrable la iteración ante el cliente. Es de sólo lectura sobre lo que las historias 2 y 3 ya
construyeron, y por eso va después.

**Independent Test**: con el juego de datos de § 13.4 cargado, filtrar por período y rubro desde un
teléfono y medir el tiempo de respuesta.

**Acceptance Scenarios**:

1. **Given** un consorcista habilitado, **When** filtra gastos por período y rubro, **Then** ve
   únicamente los de sus consorcios y el listado responde en menos de 2 segundos (RNF-06).
2. **Given** un consorcista, **When** abre un comprobante, **Then** lo ve; **When** manipula la
   dirección para pedir uno de otro consorcio, **Then** obtiene «no encontrado».
3. **Given** un teléfono de 390 px de ancho, **When** se abre el listado, **Then** se ve completo
   sin desplazamiento horizontal (RNF-01) y cumple WCAG 2.1 AA en la pantalla del consorcista
   (RNF-11).

---

### User Story 5 — Toda operación económica queda auditada y el período existe (Priority: P2)

`RF-26` · regla RN-15 (§ 7.2) · RNF-12 · hallazgo 1 del análisis de insumos

Las tablas económicas de esta etapa quedan enganchadas al disparador de auditoría construido en
`001-andamiaje`, y se incorpora el mínimo de la entidad `Periodo` —apertura y listado— para que
`RF-04` tenga contra qué imputar.

**Why this priority**: la auditoría es barata (11 h del paquete 3.7) y su ausencia invalida la
condición 7 de la definición de terminado en cada requerimiento anterior. El mínimo de `Periodo`
es un movimiento chico que desbloquea `RF-04`, cuya ausencia dejaría la historia 3 sin período
imputable.

**Independent Test**: recorrer las tablas económicas de la etapa, hacer una operación sobre cada
una y verificar que todas dejan asiento; abrir un período y comprobar que un gasto puede imputarse.

**Acceptance Scenarios**:

1. **Given** cada una de las tablas económicas de esta etapa, **When** se inserta, modifica o borra
   una fila, **Then** la bitácora recibe un asiento con imagen anterior y posterior.
2. **Given** el usuario de aplicación, **When** intenta alterar la bitácora, **Then** la base lo
   rechaza (RNF-12).
3. **Given** un consorcio sin períodos, **When** el administrador abre el período del mes, **Then**
   queda en estado abierto y los gastos pueden imputarse a él.
4. **Given** un período abierto, **When** se intenta abrir otro para el mismo consorcio y mes,
   **Then** el sistema lo rechaza: un consorcio tiene un solo período por mes.
5. **Given** esta etapa, **When** se cierra, **Then** la máquina de estados completa del período
   —cierre, liquidación y anulación— **no** está construida: es alcance explícito de
   `003-liquidacion` (paquete 4.1).

---

### Edge Cases

- **Un consorcio con una sola unidad.** El coeficiente es `100.00000000` y el caso debe pasar sin
  tratamiento especial.
- **Un coeficiente de 96 unidades que suma `99.99999999` por redondeo del cliente.** El sistema no
  «arregla» la diferencia: la rechaza y la informa. Corregir coeficientes es decisión del
  administrador, no del sistema.
- **Una persona con dos roles distintos en dos consorcios.** Es el caso normal y no una excepción:
  la autorización se evalúa por par (rol, consorcio), nunca por rol global.
- **Un comprobante de más de 25 MB o de un formato no soportado.** Se rechaza con mensaje
  comprensible (RNF-10) **antes** de subirlo, y el gasto queda registrado igual: el comprobante es
  un adjunto, no una precondición del gasto.
- **El almacenamiento de objetos no responde.** El registro del gasto no falla: el adjunto queda
  como `TrabajoPendiente` y se reintenta en el siguiente pedido, con la subida visible como
  pendiente en la pantalla del gasto (RNF-14, FR-006b).
- **El servicio de correo no responde al invitar.** La invitación queda como `TrabajoPendiente` y
  se reintenta en el siguiente pedido; el alta del usuario no falla, y el administrador puede
  forzar el reenvío (hueco H-06, FR-006b).
- **Un rubro que el cliente no contempló.** El alta y la modificación de rubros están **diferidas**
  (§ 9.11, ítems 9 y 10): se resuelve por soporte sobre la lista semilla, y eso se le dice al
  cliente en la demostración.
- **Un usuario que pierde su habilitación mientras tiene una sesión abierta.** La autorización se
  evalúa en cada operación, no al iniciar sesión.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Bloque A — Identidad, roles y aislamiento (`RF-03`)

- **FR-001**: El sistema **DEBE** autenticar por correo electrónico y contraseña, con la contraseña
  derivada mediante Argon2id (RNF-04). Ninguna contraseña se almacena en texto plano ni con función
  de resumen simple.
- **FR-001b**: El sistema **DEBE** bloquear temporalmente la cuenta tras **cinco** intentos
  fallidos consecutivos, durante **quince minutos**, y registrar cada intento fallido con momento y
  origen. Argon2id encarece romper la base robada; esto es lo que frena la prueba de contraseñas
  contra el formulario.
- **FR-001c**: El mensaje de inicio de sesión fallido **DEBE** ser el mismo exista o no la cuenta y
  esté o no bloqueada: no revela qué correos están registrados. El administrador **DEBE** poder
  levantar el bloqueo sin esperar los quince minutos, porque el bloqueo por cuenta permite dejar
  fuera a un usuario legítimo a quien se le conozca el correo; ese flanco se acepta a conciencia y
  se registra en § 18.
- **FR-002**: El sistema **DEBE** evaluar la autorización por **par (rol, consorcio)** en cada
  operación de la capa de aplicación (RNF-03, regla RN-12 § 7.2), y no por rol global.
- **FR-003**: El filtro por consorcio **DEBE** aplicarse en la extensión del cliente de datos
  construida en `001-andamiaje` (FR-011 de aquella etapa), **en un solo lugar**. Ninguna consulta
  de negocio de esta etapa repite el filtro; ninguna usa el cliente crudo.
- **FR-004**: Una habilitación **DEBE** tener vigencia con fecha de inicio y fecha de fin opcional.
  Una habilitación no vigente equivale a inexistente a efectos de autorización.
- **FR-005**: El sistema **DEBE** proveer una **semilla de arranque** que cree el primer usuario
  **administrador de cartera**, con la contraseña provista por variable de entorno y nunca
  versionada. No crea ningún consorcio: el primero lo da de alta ese usuario desde la aplicación,
  de modo que la secuencia real quede probada desde el primer día. Cierra el hueco H-08.
- **FR-006**: El sistema **DEBE** permitir invitar a una persona por correo electrónico; el
  invitado fija su propia contraseña. El envío se persiste y se reintenta ante falla, sin que la
  falla del correo haga fallar el alta (RNF-14, hueco H-06).
- **FR-006b**: Todo efecto externo que pueda fallar sin invalidar la operación —envío de correo y
  subida de comprobante— **DEBE** registrarse como fila en `TrabajoPendiente` con su estado, la
  cantidad de intentos y el momento del próximo. El reintento es **oportunista**: el siguiente
  pedido que llega al servidor procesa lo vencido, con espera creciente entre intentos. Además,
  el administrador **DEBE** contar con una acción explícita de reintento y ver el estado del
  pendiente. No se construye ejecutor programado en esta etapa: `004-servicios` decide si el
  despachador de `RF-14` lo necesita, y esta tabla es la costura que va a usar.
- **FR-007**: Los roles **DEBEN** organizarse en **tres niveles de alcance**, porque el punto 9
  compromete «instancia única multiempresa, con aislamiento por consorcio **y por administradora**»
  (factor 13) y el producto se comercializa a varias administradoras sin modificaciones (factor 10,
  y § 6.2, modelo adoptado):

  | Nivel | Rol | Alcance | Dónde vive |
  |---|---|---|---|
  | Plataforma | **super administrador** | Toda la instancia | `HabilitacionPlataforma` |
  | Empresa | **administradora** | Todos los consorcios de su cartera | `HabilitacionAdministradora` |
  | Consorcio | **administrador** | Los consorcios asignados (delegado) | `Habilitacion.rol` |
  | Consorcio | **consorcista** | Su consorcio y su unidad | `Habilitacion.rol` |
  | Consorcio | **consejo** | Se **suma** a consorcista | `Habilitacion.rol` |

  El **consejo no es una clase aparte de usuario**: a sus integrantes los elige la asamblea entre
  los propietarios, así que es una habilitación que **se agrega** a la de consorcista, con la
  vigencia del mandato. La clave única `(usuario, consorcio, rol)` que el punto 7 ya declara es
  exactamente lo que lo permite: cuando el mandato vence, esa habilitación deja de estar vigente y
  la persona sigue siendo consorcista. Un consorcio sin consejo simplemente no tiene ninguna.

  La nómina nominada de deudores se reserva a administrador y consejo (regla RN-13 § 7.2); esta
  etapa aún no la produce, pero el modelo ya la contempla.
- **FR-007c**: El rol **efectivo** de un usuario sobre un consorcio **DEBE** resolverse en un solo
  lugar, considerando los tres niveles en este orden: habilitación de plataforma, habilitación
  sobre la administradora dueña del consorcio, y habilitación sobre el consorcio. Los dos ejes de
  aislamiento colapsan ahí y no en cada consulta: es el mismo criterio del Principio I.
- **FR-007b**: El **super administrador** de plataforma es quien da de alta administradoras y
  consorcios. La razón es estructural: el alta de un consorcio no se puede autorizar por par
  (rol, consorcio) porque al crear el primero no hay ninguno contra el cual evaluar.

  Se modela como **tabla propia** con vigencia, no como una habilitación con consorcio nulo: un
  nulo en la tabla que materializa el Principio I es la clase de agujero que después filtra datos
  ajenos. Lo mismo vale para la habilitación de empresa. Ninguna de las dos abre contexto de
  aislamiento por sí sola: el contexto se abre siempre sobre un consorcio concreto.

  **Impacto documental**: el punto 7 declara `rol` como `administrador, operador, consejo,
  consorcista`, todos por consorcio, y no tiene entidad para la administradora; el punto 9 promete
  un aislamiento por administradora que ningún otro documento sostiene. La corrección corresponde
  asentarla en los puntos 7 y 12 y en `RF-03`, y se registra en el acta de la iteración: no se
  reescribe una entrega ya presentada.

- **FR-008**: La relación entre persona y unidad **DEBE** registrarse como ocupación con tipo
  (propietario o inquilino) y rango de vigencia, y la superposición **DEBE** impedirse con
  **restricción de exclusión en la base de datos**, no en el código (regla RN-09 § 7.2).

  Dueño e inquilino **no son roles**: son el tipo del vínculo. El punto 7 ya corrigió esa confusión
  al separar `Persona` de `Ocupacion` —«un propietario que además habita su unidad no tenía
  representación»— y volver a meterlos en la habilitación reintroduciría el mismo defecto: quien es
  dueño y habita necesitaría dos habilitaciones, y al vender la unidad el rol y el padrón quedarían
  contradiciéndose. Ambos ven lo que pasa en el edificio; lo que la ocupación decide es a quién se
  le cobra la expensa, que es alcance de `003-liquidacion`.
- **FR-008b**: El **propietario vigente de una unidad DEBE** poder registrar la ocupación de **su**
  unidad, limitado a ocupaciones de tipo inquilino, e invitar a esa persona como usuario del
  consorcio. Sin lo segundo, el dueño carga al inquilino en el padrón y el inquilino nunca puede
  entrar.

  Esto agrega una **condición de fila** a la autorización: hasta aquí bastaba el par
  (rol, consorcio), y ahora hay una operación donde además importa *sobre qué unidad*. Se resuelve
  en el mismo lugar que el resto (FR-007c) y se verifica: un propietario que intenta cargar un
  inquilino en la unidad del vecino recibe «no encontrado», nunca «prohibido».

  Pedirle a la administración que lo cargue **no es funcionalidad nueva**: es el administrador
  haciendo lo que ya puede. Un circuito de solicitudes con estado pendiente queda fuera de alcance.

#### Bloque B — Consorcios, unidades y coeficientes (`RF-01`, `RF-02`)

- **FR-009**: El sistema **DEBE** permitir dar de alta y modificar consorcios. El alta la autoriza
  el **administrador de cartera** (FR-007b), y quien crea el consorcio queda habilitado sobre él
  como administrador en la misma transacción: un consorcio sin nadie que lo administre no le sirve a
  nadie. La modificación de la cabecera la puede hacer el administrador del consorcio. La **baja
  está diferida** (§ 9.11) y se resuelve por soporte; la interfaz no la ofrece.
- **FR-010**: El sistema **DEBE** permitir registrar unidades funcionales con su coeficiente en
  decimal de precisión fija de **ocho decimales**.
- **FR-011**: El sistema **DEBE** rechazar toda operación que deje la suma de coeficientes de un
  consorcio distinta de `100.00000000` exacto, informando la diferencia y las unidades involucradas
  (regla RN-01 § 7.2). La verificación se repite obligatoriamente antes de liquidar en la etapa 3.
- **FR-011b**: El invariante **DEBE** imponerse con un **disparador de restricción diferido** en la
  base, evaluado al confirmar la transacción: ninguna transacción puede dejar un consorcio con
  unidades cuya suma difiera de `100.00000000`, venga de la interfaz, de una migración o de una
  corrección manual. La verificación de aplicación de FR-011 no desaparece: existe para dar el
  mensaje comprensible que exige RNF-10, pero **no es la que garantiza el invariante**. Es el mismo
  criterio que la regla RN-09 (§ 7.2) ya aplica a la superposición de ocupaciones.
- **FR-011c**: Un consorcio **sin ninguna unidad** no viola la regla: el invariante se evalúa
  únicamente sobre consorcios con al menos una unidad. Un alta de consorcio y sus unidades es **una
  sola transacción**; agregar o subdividir unidades después obliga a ajustar las demás en esa misma
  transacción, que es exactamente lo que la regla RN-01 quiere.
- **FR-012**: Un coeficiente **DEBE** poder modificarse sólo hacia el futuro. El histórico se
  conserva en `CoeficienteHistorico` con vigencia, para que una liquidación pasada se pueda
  reconstruir (regla RN-02 § 7.2).
- **FR-013**: Ninguna firma pública del dominio **DEBE** aceptar ni devolver el tipo numérico
  nativo para un coeficiente o un importe (medida 2 de § 14.1, Principio II). La regla de análisis
  estático de `001-andamiaje` lo verifica en cada envío.

#### Bloque C — Rubros, proveedores, gastos y comprobantes (`RF-04`, `RF-05`, `RF-17`)

- **FR-014**: El sistema **DEBE** cargar una **lista semilla de `RubroGasto`** acordada con el
  cliente, con la clasificación ordinario/extraordinario de cada rubro (regla RN-04 § 7.2). El alta
  y la modificación de rubros están diferidas (§ 9.11): se operan por soporte sobre la semilla.
  Cierra el hueco H-07.
- **FR-015**: El sistema **DEBE** permitir registrar y modificar proveedores. `Proveedor` no tiene
  dependencias obligatorias: es raíz del grafo y se construye antes que `Gasto`.
- **FR-016**: El sistema **DEBE** registrar gastos con consorcio, período, rubro, proveedor,
  importe, fecha y autor de la carga. El importe se almacena en `NUMERIC` y viaja como decimal de
  precisión arbitraria en toda la aplicación; hacia la interfaz se serializa **como cadena**
  (medidas 1 y 3 de § 14.1).
- **FR-017**: El sistema **DEBE** impedir registrar o modificar un gasto de un período ya liquidado
  (regla RN-03 § 7.2). Como esta etapa no liquida, declara ya en `src/dominio/contratos` el
  contrato mínimo del estado (valores y transiciones válidas, M-04) que `003` comparte, y la prueba
  lo usa en lugar de fabricar un estado propio.
- **FR-018**: El sistema **DEBE** permitir adjuntar a un gasto un comprobante digitalizado de
  **hasta 25 MB** en **PDF, JPEG, PNG, WebP, HEIC o TIFF**, almacenado en el almacenamiento de
  objetos y accesible sólo con habilitación vigente sobre el consorcio. Tamaño y tipo se verifican
  **antes** de subir, y el rechazo dice cuál es el límite y qué formatos se aceptan (RNF-10).
- **FR-018b**: La subida **DEBE** ir del navegador al almacenamiento **directamente**, con un
  permiso de corta duración que emite la aplicación; el archivo no atraviesa el servidor. No es una
  optimización: la plataforma de despliegue limita el cuerpo de un pedido muy por debajo de 25 MB.
  En consecuencia, la interfaz declarada en `src/dominio/contratos` (FR-019) expone **emitir permiso
  de subida** y **resolver lectura autorizada**, nunca «recibir bytes».
- **FR-018c**: HEIC y TIFF **no se muestran** en los navegadores. Para esos formatos la interfaz
  **DEBE** ofrecer la descarga del original en lugar de la vista incrustada, y decir por qué.
  Generar una vista previa convertida queda **fuera de alcance** de esta etapa: se evalúa en
  `004-servicios`, junto con el procesamiento de documentos.
- **FR-019**: El acceso al almacenamiento de objetos **DEBE** consumirse a través de una interfaz
  declarada en `src/dominio/contratos`, implementada en infraestructura (Principio III, decisión 4
  de § 12.1.3). El dominio no conoce al proveedor.
- **FR-020**: La pantalla de registro de gasto **DEBE** admitir valores precargados y exigir
  confirmación humana explícita antes de crear el gasto, de modo que `RF-06` (etapa 4) se enchufe
  sin rediseñarla (regla RN-14 § 7.2, Principio IV).

#### Bloque D — Consulta de gastos (`RF-10`)

- **FR-021**: El sistema **DEBE** ofrecer un listado de gastos filtrable por consorcio, período y
  rubro, con acceso al comprobante de cada uno.
- **FR-022**: El listado **DEBE** responder en menos de 2 segundos en el percentil 95 (RNF-06) con
  el volumen de un año del punto 7.5 (10.800 gastos), apoyado en los índices previstos en § 7.6.
  La medición se hace en caliente y el arranque en frío se informa aparte (SC-006, SC-006b).
- **FR-023**: Las pantallas destinadas al consorcista **DEBEN** cumplir WCAG 2.1 nivel AA (RNF-11)
  y verse correctamente en teléfono (RNF-01).

#### Bloque E — Períodos mínimos y auditoría (hallazgo 1, `RF-26`)

- **FR-024**: El sistema **DEBE** permitir abrir y listar períodos por consorcio, con un único
  período por consorcio y mes. **Sólo eso**: el cierre, la liquidación y la anulación son alcance
  de `003-liquidacion` (paquete 4.1). Esta división resuelve el hallazgo 1 sin anticipar la
  liquidación.
- **FR-025**: Todas las tablas económicas de esta etapa —`Gasto`, `Comprobante`, `Unidad`,
  `CoeficienteHistorico`, `Periodo`— **DEBEN** quedar enganchadas al disparador `fn_auditar()`
  construido en `001-andamiaje` (regla RN-15 § 7.2, `RF-26`).
- **FR-026**: Cada migración de esta etapa **DEBE** estar versionada en el repositorio. Ningún
  cambio manual sobre la base, en ningún entorno (§ 8.3.5).

#### Bloque F — Datos y cierre documental

- **FR-027**: El equipo **DEBE** obtener del cliente **tres liquidaciones reales** antes de que
  comience `003-liquidacion`. El riesgo RT-01 (§ 11.2) exige tenerlas «antes de escribir el código»
  del motor; pedirlas es trabajo de esta etapa porque conseguirlas depende del cliente y toma
  tiempo. Cierra la parte de calendario del hueco H-09.
- **FR-028**: El equipo **DEBE** construir el juego de datos ficticios de § 13.4 —dos consorcios de
  tamaño contrastante, uno de 12 y otro de 96 unidades— y usarlo como fixture de las pruebas de
  integración y de extremo a extremo. Un juego de datos que sirve para demostrar y para probar se
  mantiene solo.
- **FR-029**: `docs/entrega-final/13-prototipo.md` § 13.3 **DEBE** reflejar el estado por módulo al
  cierre de la etapa (condición 8 de § 8.3.4).

### Key Entities

| Entidad | Qué representa | Relaciones y restricciones clave |
|---|---|---|
| `Consorcio` | Un edificio de propiedad horizontal de la cartera | Raíz del aislamiento: casi toda entidad cuelga de él (regla RN-12 § 7.2) |
| `Unidad` | Unidad funcional con su coeficiente vigente | `consorcio_id` obligatorio; suma de coeficientes = `100.00000000`, impuesta por disparador diferido en la base (regla RN-01 § 7.2, FR-011b) |
| `CoeficienteHistorico` | Coeficiente de una unidad con rango de vigencia | Permite reconstruir una liquidación pasada (regla RN-02 § 7.2) |
| `Persona` | Persona física, con o sin usuario | Raíz; datos personales bajo Ley 25.326 (RNF-13) |
| `Usuario` | Credencial de acceso de una persona | Contraseña derivada con Argon2id (RNF-04) |
| `Ocupacion` | Vínculo persona–unidad como propietario o inquilino | Restricción de exclusión sobre la vigencia (regla RN-09 § 7.2) |
| `Administradora` | Empresa que administra una cartera de consorcios | Segundo eje del aislamiento (§ 9, factor 13). El producto es multiempresa (§ 6.2) |
| `Habilitacion` | Permiso vigente de un usuario sobre un consorcio, con rol | **Es la tabla que materializa el Principio I.** Clave única `(usuario, consorcio, rol)`: el consejo se suma a consorcista |
| `HabilitacionAdministradora` | Permiso vigente sobre toda la cartera de una empresa | Su existencia vigente es el rol |
| `HabilitacionPlataforma` | Permiso de super administrador | Su existencia vigente es el rol; es el único que da de alta administradoras |
| `RubroGasto` | Clasificación del gasto, con marca ordinario/extraordinario | Precargado por semilla; alta y modificación diferidas (§ 9.11) |
| `Proveedor` | Prestador de servicios o bienes al consorcio | Raíz del grafo: sin dependencias obligatorias |
| `Gasto` | Erogación del consorcio imputada a un período | `periodo_id` y `rubro_id` obligatorios; inmutable si el período fue liquidado (reglas RN-03 y RN-04 § 7.2) |
| `Comprobante` | Archivo digitalizado que respalda un gasto | `gasto_id` obligatorio; contenido en almacenamiento de objetos |
| `Periodo` | Mes de operación de un consorcio | **Sólo apertura y listado en esta etapa.** Un período por consorcio y mes |
| `TrabajoPendiente` | Efecto externo que falló y hay que reintentar: correo o subida | Estado, intentos y momento del próximo intento; lo procesa el siguiente pedido (FR-006b) |
| `BitacoraAuditoria` | Asiento inmutable (creada en `001-andamiaje`) | Esta etapa le engancha sus tablas económicas |

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sobre los **2** consorcios del juego de datos de § 13.4 (12 y 96 unidades), la suma
  de coeficientes es exactamente `100.00000000` en ambos, verificada con comparación decimal, no
  con tolerancia.
- **SC-002**: **100 %** de las entidades con `consorcio_id` tienen una prueba automatizada que
  confirma que un usuario sin habilitación vigente obtiene **cero filas**, tanto por listado como
  por identificador directo en la dirección. Cero entidades sin esa prueba.
- **SC-002b**: Matriz rol×acción (I-11): un usuario con habilitación vigente pero rol sin permiso
  (p. ej. consorcista intentando alta de gasto o de usuario) es denegado en el **100 %** de las
  operaciones de escritura de la etapa. La dimensión rol queda probada, no solo consorcio.
- **SC-003**: El filtro por consorcio aparece **en un solo archivo** del repositorio. Una búsqueda
  del filtro fuera de la extensión del cliente de datos devuelve **0 coincidencias** (Principio I,
  riesgo RT-04).
- **SC-004**: Un intento de alta de unidades cuya suma de coeficientes difiere en `0.00000001` es
  rechazado, y el mensaje nombra la diferencia exacta y las unidades involucradas.
- **SC-004b**: Dos transacciones simultáneas que modifican coeficientes del mismo consorcio no
  pueden dejar la suma fuera de `100.00000000`: la prueba las ejecuta en paralelo **salteándose la
  capa de aplicación** y verifica que la base rechaza al menos una (FR-011b). Un consorcio sin
  unidades no es rechazado.
- **SC-005**: Un intento de registrar una segunda ocupación vigente del mismo tipo sobre la misma
  unidad y fecha es rechazado **por la base de datos**, no por el código (regla RN-09 § 7.2). La
  prueba lo verifica saltándose la capa de aplicación.
- **SC-006**: Con **10.800 gastos** cargados —volumen de un año del punto 7.5—, el listado filtrado
  de `RF-10` responde en **menos de 2 segundos en el percentil 95** sobre 100 consultas con el
  arnés `medir:p95` en el entorno de demostración (RNF-06, I-07). La medición es **en caliente**: se
  descarta la primera consulta posterior a una suspensión de la base o a un arranque en frío de la
  función, porque mide la infraestructura de la capa gratuita y no la consulta. El criterio evalúa
  lo que el equipo controla.
- **SC-006b**: El **arranque en frío** se mide igual, se informa por separado en § 14.5 y **no
  condiciona** SC-006. Es el dato que sostiene la justificación 5 del punto 5.5 —que el prototipo
  puede permanecer publicado sin costo— y el que diría, si fuera desmesurado, que la capa gratuita
  no alcanza para la demostración.
- **SC-006c**: Un comprobante de **25 MB** en PDF se sube y se recupera; uno de **26 MB** se rechaza
  **antes** de transferir un solo byte; un HEIC se recupera por descarga con la explicación de por
  qué no se muestra incrustado. El archivo nunca atraviesa el servidor de la aplicación (FR-018b).
- **SC-006d**: Al sexto intento fallido consecutivo, el inicio de sesión es rechazado **aunque la
  contraseña sea correcta**, y vuelve a funcionar pasados quince minutos o cuando el administrador
  levanta el bloqueo. El mensaje es idéntico para cuenta inexistente, contraseña incorrecta y
  cuenta bloqueada (FR-001b, FR-001c).
- **SC-002c**: Un usuario **sin** habilitación de plataforma no puede dar de alta un consorcio ni
  una administradora, ni siquiera siendo administrador de otro consorcio; una habilitación de
  plataforma vencida ayer tampoco alcanza (FR-007b, FR-009).
- **SC-002d**: Un usuario con habilitación sobre la **administradora** obtiene rol efectivo de
  administrador sobre el **100 %** de los consorcios de esa cartera y **cero** filas de los
  consorcios de cualquier otra administradora (FR-007, FR-007c, § 9 factor 13).
- **SC-002e**: Un **administrador delegado** obtiene datos únicamente de los consorcios que tiene
  asignados, aunque pertenezcan a la misma administradora que otros que no tiene (FR-007).
- **SC-002f**: Un propietario puede registrar un inquilino en **su** unidad y recibe «no
  encontrado» al intentarlo sobre la unidad de otro; tampoco puede registrar una ocupación de tipo
  propietario (FR-008b).
- **SC-007**: Cada una de las **5** tablas económicas de la etapa deja exactamente un asiento de
  auditoría por operación, con imagen anterior y posterior. Cero operaciones sin asiento.
- **SC-008**: `INSERT`, `UPDATE` y `DELETE` sobre la bitácora con el usuario de aplicación fallan
  en los **3** casos (RNF-12).
- **SC-009**: Cero importes y cero coeficientes representados en punto flotante en cualquier capa,
  verificado por la regla de análisis estático de `001-andamiaje` y por inspección de los tipos
  generados por el mapeador (medidas 1, 2 y 4 de § 14.1).
- **SC-010**: La serialización de un importe hacia la interfaz es **cadena** en el 100 % de los
  casos, verificado con una prueba de extremo a extremo sobre un importe de más de quince dígitos
  significativos (medida 3 de § 14.1).
- **SC-011**: Las **3** pantallas del consorcista (`CU-05` y su detalle) se ven sin desplazamiento
  horizontal a 390 px (RNF-01) y pasan la verificación automática de WCAG 2.1 AA sin infracciones
  de nivel A o AA (RNF-11).
- **SC-012**: Un período abierto acepta gastos; un período marcado como liquidado los rechaza en
  el **100 %** de los intentos, de alta y de modificación (regla RN-03 § 7.2).
- **SC-013**: Las **3 liquidaciones reales** del cliente están en poder del equipo antes de abrir
  `003-liquidacion` (riesgo RT-01 § 11.2). Sin ellas, la etapa 3 no arranca.
- **SC-013b**: Con el servicio de correo caído, el alta de usuario **igual se completa** y queda un
  `TrabajoPendiente`; al volver el servicio, el siguiente pedido lo despacha sin intervención, y la
  acción de reenvío del administrador lo despacha aunque no haya llegado el momento del próximo
  intento. Cero altas perdidas por caída del correo (RNF-14).
- **SC-014**: La demostración al cliente recorre `CU-01`, `CU-02` y `CU-05` de punta a punta sobre
  el entorno de demostración desplegado, en **1 hora** (§ 8.3.2), sin ningún paso ejecutado desde
  una máquina de desarrollo.

### Cierre contra la definición de terminado (§ 8.3.4)

| # | Condición | Cómo la cierra esta etapa |
|---|---|---|
| 1 | Integrado y revisado | Una rama por `RF-nn`, incorporación con revisión aprobada; el paquete 3.2 se hace **en pares** por ser superficie de seguridad (§ 10) |
| 2 | Pruebas y verificación en verde | La verificación de `001-andamiaje` corre en cada envío; SC-002 y SC-006 son parte de ella |
| 3 | Autorización por rol y consorcio | SC-002 y SC-003: es la condición central de esta etapa, y la que la historia 1 construye |
| 4 | Opera en teléfono | SC-011 |
| 5 | Mensajes de error comprensibles | SC-004 y el estándar de § 14.4 fijado en `001-andamiaje` |
| 6 | Desplegado en demostración | SC-014: la demostración corre sobre el entorno desplegado |
| 7 | Auditoría de datos económicos | SC-007 y SC-008 |
| 8 | Documentación actualizada | FR-029 |

---

## Assumptions

- `001-andamiaje` está terminada. Esta etapa **no** construye verificación automática, despliegue,
  mecanismo de aislamiento ni bitácora: los usa.
- El cliente entrega la lista semilla de rubros (FR-014) y las tres liquidaciones reales (FR-027).
  Ambos dependen de él y no del equipo; por eso se piden al inicio de la etapa y no al final.
- Las **23 funcionalidades diferidas** de § 9.11 recortan buena parte de los ABM: altas y bajas de
  rubro, bajas de consorcio, unidad, usuario, proveedor y documento. Se operan por soporte y así se
  le comunica al cliente en la demostración. La interfaz no ofrece lo que no está construido.
- El presupuesto de esta etapa es de **187 h**: las 221 h de la iteración 1 del punto 10 menos las
  34 h del paquete 3.1, que `001-andamiaje` ya consumió. No hay horas nuevas.
- `Periodo` se parte deliberadamente entre esta etapa (apertura y listado) y `003-liquidacion`
  (máquina de estados completa). Es la resolución del hallazgo 1 del análisis de insumos.
- El servicio de correo se contrata en esta etapa aunque el despachador general de `RF-14` llegue
  en `004-servicios`: la invitación de usuario lo necesita ya (hueco H-06).
- El 10 % de la capacidad de la iteración se reserva para refactorización, conforme a la
  constitución.
- El bloqueo por cuenta de FR-001b se elige sabiendo que permite negar el servicio a un usuario
  cuyo correo se conozca. Se acepta porque el universo de usuarios es cerrado y conocido —los
  consorcistas de una cartera de administración, no un registro público— y porque el administrador
  puede levantarlo. Si el sistema se abriera a registro libre, la decisión se revisa.
