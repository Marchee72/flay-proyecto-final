# Feature Specification: Asambleas de consorcio

**Feature Branch**: `feat/asambleas`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: asambleas de consorcio, a partir del diseño aprobado en
`docs/superpowers/specs/2026-11-03-asambleas-design.md`: convocatoria con orden del día y Google
Calendar, poderes otorgados en Flay, asistencia y quórum, votación en vivo por unidad (binaria o
de opción múltiple), mayorías configurables por consorcio con decisión provisoria (CCyC art. 2060),
acta redactada después y firmada electrónicamente en Flay.

## Resumen

Hoy las asambleas pasan fuera del sistema: la convocatoria se reparte en papel, la asistencia y
los votos se anotan a mano y el acta se escribe en el libro. Esta funcionalidad lleva la asamblea
entera a Flay, desde la convocatoria hasta el acta firmada, y hace del **acta del sistema el acta
oficial**.

La reunión sigue siendo **presencial**: la gente debate en la sala y Flay acompaña desde el
teléfono. Muestra en vivo el punto en tratamiento, la asistencia, el quórum y los votos que van
entrando, y registra cada voto por unidad.

Es un **cambio de alcance**. El documento 04 excluye hoy «Asambleas, votaciones y actas con validez
legal», y esa exclusión se reemplaza por los requerimientos nuevos (RF-29 a RF-33, propuestos).

El marco es el Código Civil y Comercial (arts. 2058 a 2064) y el reglamento del cliente (arts. 18
a 24).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Convocar una asamblea con su orden del día (Priority: P1)

Un miembro del consejo o la administración crea la asamblea. Carga:

- tipo (ordinaria o extraordinaria), fecha, hora y lugar;
- el orden del día, punto por punto;
- para cada punto, si se vota positivo/negativo/abstención o entre opciones, y qué mayoría
  requiere.

Si la crea el consejo, decide si invita a la administración.

Mientras está en borrador, todo se puede editar. Al enviar la convocatoria, el orden del día queda
fijo. Cada propietario recibe el aviso en Flay y por correo, y desde el aviso o la pantalla de la
asamblea la agrega a Google Calendar o a otro calendario.

**Why this priority**: sin convocatoria no hay asamblea. Es la base de todo lo demás, y un orden
del día impreciso o una convocatoria que no llega a todos vician la asamblea.

**Independent Test**: crear una asamblea con un punto binario y uno de opción múltiple y enviar la
convocatoria. Verificar que llega el aviso a todos los propietarios, con y sin cuenta, que el
enlace de calendario trae fecha, lugar y orden del día, y que el orden del día ya no se puede
editar.

**Acceptance Scenarios**:

1. **Given** un miembro del consejo, **When** crea una asamblea con tres puntos y envía la
   convocatoria con 20 días de anticipación, **Then** queda convocada y cada propietario recibe el
   aviso con fecha, hora, lugar, orden del día y enlaces de calendario.
2. **Given** una asamblea organizada por el consejo sin invitar a la administración, **When** se
   envía la convocatoria, **Then** la administración no recibe el aviso, pero puede ver la
   asamblea.
3. **Given** una fecha a menos de la anticipación mínima del consorcio (15 días por defecto),
   **When** se intenta enviar la convocatoria, **Then** se rechaza con un mensaje que dice la fecha
   más temprana posible.
4. **Given** una asamblea convocada, **When** alguien intenta agregar, quitar o modificar un punto,
   **Then** se rechaza: el orden del día enviado no se cambia.
5. **Given** un propietario sin cuenta en Flay pero con correo en el padrón, **When** se envía la
   convocatoria, **Then** la recibe por correo, con los enlaces de calendario.
6. **Given** un punto de opción múltiple, **When** se lo carga con menos de dos opciones, **Then**
   se rechaza.
7. **Given** un consorcista sin rol de consejo, **When** intenta crear una asamblea, **Then** no
   puede.

---

### User Story 2 - Conducir la reunión y votar en vivo (Priority: P1)

El día de la reunión, quien dirige (un miembro del consejo o la administración, si está invitada)
abre la asamblea:

1. Toma asistencia por unidad: cada unidad está presente por un propietario o por un apoderado.
2. Flay calcula el quórum y marca qué unidades no votan por mora.
3. Registra presidente y secretario entre los presentes.
4. Abre los puntos de a uno. Cada presente vota su unidad, o las que representa, desde su
   teléfono. Quien dirige carga a mano el voto de quien no puede.
5. Al cerrar el punto, Flay calcula el resultado.

Todos los presentes ven en la misma pantalla, en vivo:

- el punto en tratamiento y sus opciones;
- la asistencia y el quórum;
- los votos que van entrando, con el conteo por opción en unidades y en coeficientes, y quién votó
  qué;
- los resultados de los puntos ya tratados.

Un voto emitido no se modifica.

**Why this priority**: es el corazón de la funcionalidad. El resultado de cada punto es lo que el
acta certifica, y un error de cómputo invalida la decisión.

**Independent Test**: abrir una asamblea con unidades de distintos coeficientes y tomar
asistencia. Votar un punto binario desde dos teléfonos y cargar un voto manual. Cerrar el punto y
verificar que el resultado coincide al décimo de coeficiente con el cálculo esperado, y que ningún
voto emitido se puede cambiar.

**Acceptance Scenarios**:

1. **Given** una asamblea abierta y en acreditación, con presentes que suman más del 50 % de los
   coeficientes a la hora de la primera convocatoria, **When** quien dirige la constituye,
   **Then** sesiona en primera convocatoria.
2. **Given** presentes que no llegan al 50 % a la hora de la primera convocatoria, **When** quien
   dirige intenta constituirla, **Then** no puede. **When** lo intenta 30 minutos después, con al
   menos una unidad presente con voto, **Then** sesiona en segunda convocatoria con los presentes.
3. **Given** un punto abierto, **When** un presente vota su unidad desde el teléfono, **Then** el
   voto aparece en la pantalla de todos en pocos segundos, y la unidad ya no puede volver a votar
   ese punto.
4. **Given** una unidad que ya votó, **When** quien dirige intenta cargar un voto manual para esa
   unidad, **Then** se rechaza.
5. **Given** una unidad con varios propietarios presentes, **When** se acreditan, **Then** la
   representa el primero que se acredita, y solo esa persona vota por la unidad en todos los
   puntos.
6. **Given** una unidad que debe más de dos expensas, **When** está presente, **Then** cuenta para
   el quórum, se la ve marcada sin voto y no puede votar.
7. **Given** un punto binario que pide mayoría absoluta, con la regla «presentes», **When** se
   cierra, **Then** se aprueba solo si los votos positivos superan la mitad de las unidades con voto
   presentes **y** la mitad de sus coeficientes. La abstención cuenta como presente que no suma.
8. **Given** un punto de opción múltiple, **When** se cierra, **Then** gana la opción más votada
   por unidades y por coeficientes. Si los dos cómputos dan opciones distintas, o hay empate, el
   punto queda sin decisión.
9. **Given** un punto cerrado, **When** alguien intenta votar, **Then** se rechaza.
10. **Given** la administración no invitada, **When** intenta abrir la asamblea, dirigir o cargar
    votos, **Then** no puede, pero ve la pantalla en vivo.

---

### User Story 3 - Dar un poder para que otro vote por mi unidad (Priority: P2)

Un propietario que no va a ir le da poder en Flay a otro usuario del consorcio, típicamente su
inquilino, para una asamblea convocada. El apoderado vota por esa unidad. Si el propietario no
tiene cuenta, la administración (o quien dirige, si la administración no está invitada) registra
en su nombre el poder que recibió en papel.

**Why this priority**: sin poderes, los propietarios que no viven en el edificio quedan afuera y
muchas asambleas no alcanzan quórum. Igual, la asamblea funciona sin esto.

**Independent Test**: un propietario otorga poder a su inquilino. El inquilino entra a la asamblea
abierta, figura presente por esa unidad y vota. Un cuarto poder al mismo apoderado se rechaza.

**Acceptance Scenarios**:

1. **Given** una asamblea convocada, **When** el propietario otorga poder a su inquilino, **Then**
   el inquilino queda como apoderado de esa unidad para esa asamblea, y los dos reciben un aviso.
2. **Given** un apoderado con tres unidades representadas (tope por defecto), **When** se le
   intenta otorgar una cuarta, **Then** se rechaza explicando el tope.
3. **Given** un poder otorgado, **When** el propietario lo revoca antes de que abra la asamblea,
   **Then** el apoderado deja de representar la unidad. Una vez abierta, ya no se puede revocar.
4. **Given** un inquilino sin poder, **When** entra a la asamblea, **Then** la ve, pero no puede
   votar.
5. **Given** un propietario presente cuya unidad tiene poder otorgado, **When** se toma asistencia,
   **Then** la unidad vota una sola vez: la representa quien se registre primero.

---

### User Story 4 - Redactar y firmar el acta (Priority: P2)

Al finalizar la asamblea, quedan fijos la asistencia, los votos y los resultados. Después, el
secretario (o quien dirigió) redacta un resumen de lo debatido en cada punto, y Flay arma el acta
con eso, la asistencia y los resultados.

Firman electrónicamente el presidente, el secretario y dos propietarios presentes: cada uno entra
con su usuario y confirma el acta. Flay registra quién firmó, cuándo y la huella del documento.
Con las cuatro firmas, el acta queda como documento oficial del consorcio, visible para los
consorcistas y consultable por el asistente.

**Why this priority**: el acta es lo que da validez a lo decidido. Sin ella, la asamblea queda
registrada pero no documentada oficialmente.

**Independent Test**: finalizar una asamblea, redactar los resúmenes, pedir las cuatro firmas y
verificar que el acta queda publicada como documento del consorcio. Cambiar el texto después de la
primera firma debe resultar imposible.

**Acceptance Scenarios**:

1. **Given** una asamblea finalizada, **When** alguien intenta cambiar un voto, la asistencia o un
   resultado, **Then** se rechaza.
2. **Given** los resúmenes redactados, **When** se envía el acta a firmar, **Then** el texto queda
   fijo, y cada firmante recibe un aviso con plazo de 10 días.
3. **Given** un firmante designado, **When** confirma el acta, **Then** queda registrada su firma
   con fecha, hora y huella del documento firmado.
4. **Given** las cuatro firmas, **When** se registra la última, **Then** el acta queda como
   documento oficial del consorcio, de tipo acta.
5. **Given** un usuario que no es firmante designado, **When** intenta firmar, **Then** no puede.
6. **Given** el plazo de 10 días vencido sin todas las firmas, **When** pasa ese plazo, **Then**
   quien dirigió y los firmantes pendientes reciben un aviso. El acta sigue esperando firma.

---

### User Story 5 - Oposición de ausentes cuando la mayoría se cuenta sobre el total (Priority: P3)

En un consorcio configurado con la regla «totalidad» (CCyC 2060), un punto binario aprobado por la
mayoría de los presentes que no alcanza la mayoría sobre el total queda **provisorio**:

1. Flay notifica a los propietarios ausentes.
2. Durante 15 días corridos, cada ausente puede oponerse desde Flay. Si no tiene cuenta, la
   administración registra la oposición que recibió.
3. Pasado el plazo, la decisión queda **firme**, salvo que los votos en contra más las oposiciones
   impidan la mayoría sobre el total, y entonces **cae**. El silencio vale como conformidad.

**Why this priority**: solo aplica a los consorcios que eligen esa regla. Es lo que permite que una
asamblea con baja asistencia decida igual, sin que eso pase por encima de los ausentes.

**Independent Test**: con la regla «totalidad», aprobar un punto con mayoría de presentes pero no
del total, y verificar que queda provisorio y los ausentes reciben el aviso. Simular oposiciones
suficientes y verificar que cae; sin oposiciones, verificar que queda firme a los 15 días.

**Acceptance Scenarios**:

1. **Given** la regla «totalidad» y un punto que supera la mayoría sobre el total, **When** se
   cierra, **Then** queda firme sin plazo de oposición.
2. **Given** la regla «totalidad» y un punto aprobado solo por la mayoría de los presentes, **When**
   se cierra, **Then** queda provisorio y cada ausente recibe el aviso, en Flay y por correo.
3. **Given** una decisión provisoria, **When** un ausente se opone dentro del plazo, **Then** queda
   registrada su oposición. Un presente no puede oponerse.
4. **Given** el plazo vencido sin oposiciones suficientes, **When** se consulta la decisión,
   **Then** figura firme. Con oposiciones suficientes, figura caída.
5. **Given** la regla «presentes», **When** se cierra un punto, **Then** queda firme al cerrar.
6. **Given** un punto de opción múltiple con cualquier regla, **When** se cierra, **Then** queda
   firme al cerrar.

---

### User Story 6 - Configurar las reglas de asamblea del consorcio (Priority: P3)

La administración define, por consorcio:

- la regla de mayoría: «presentes» o «totalidad»;
- la anticipación mínima de la convocatoria;
- el tope de unidades por apoderado;
- desde cuántas expensas adeudadas se pierde el voto.

Cada consorcio arranca con los valores del reglamento: «presentes», 15 días, 3 unidades, más de 2
expensas.

**Why this priority**: con los valores por defecto la funcionalidad opera. Configurarlos solo hace
falta cuando el reglamento del consorcio dice otra cosa.

**Independent Test**: cambiar el tope a 2 y verificar que un tercer poder al mismo apoderado se
rechaza. Cambiar la regla a «totalidad» y verificar que la próxima asamblea la usa.

**Acceptance Scenarios**:

1. **Given** un consorcio nuevo, **When** se convoca una asamblea, **Then** rigen los valores por
   defecto.
2. **Given** una asamblea ya convocada, **When** la administración cambia la configuración,
   **Then** la asamblea convocada conserva la regla con la que se convocó.
3. **Given** un consorcista o un miembro del consejo, **When** intenta cambiar la configuración,
   **Then** no puede.

---

### Edge Cases

- **Asamblea que nunca alcanza quórum.** Si no hay quórum en primera y la segunda convocatoria no
  se abre, quien dirige puede cancelarla. Queda registrada como cancelada, sin acta.
- **Reprogramación o cancelación después de convocar.** Una asamblea convocada se puede cancelar,
  y se avisa a todos. Reprogramar es cancelar y convocar de nuevo con la anticipación mínima. El
  aviso nuevo trae el enlace de calendario actualizado; el evento que ya se guardó en un calendario
  externo no se actualiza solo.
- **Unidad dada de baja después de convocar.** No se toma asistencia ni vota.
- **Cambio de propietario entre la convocatoria y la reunión.** Vota el propietario vigente el día
  de la reunión. Un poder otorgado por quien dejó de ser propietario no vale.
- **Unanimidad con unidades morosas presentes o ausentes.** Para la unanimidad, la base son las
  unidades con voto. Una sola abstención o un solo voto negativo impide la decisión.
- **Empate exacto en un punto binario.** No alcanza la mayoría: el punto no se aprueba.
- **Quien dirige pierde la conexión.** Otro miembro del consejo, o la administración si está
  invitada, puede tomar la dirección. Los votos ya emitidos no se pierden.
- **Punto sin votos.** Al cerrarse, queda sin decisión, y así lo consigna el acta.
- **Un firmante deja de tener usuario o habilitación antes de firmar.** Con el acta a firmar,
  quien dirigió reemplaza a ese firmante pendiente por otro presente con usuario, en el mismo rol.
  Las firmas ya hechas se mantienen, porque el contenido no cambió, y el reemplazo queda en la
  bitácora.
- **Aislamiento.** Ningún usuario ve, vota ni firma asambleas de un consorcio donde no tiene
  habilitación vigente. Un poder no da acceso a otros datos del consorcio.

## Requirements *(mandatory)*

### Functional Requirements

**Convocatoria (RF-29 propuesto)**

- **FR-001**: El sistema DEBE permitir crear una asamblea a un usuario con rol consejo o
  administrador del consorcio, con tipo (ordinaria o extraordinaria), fecha y hora de primera
  convocatoria, lugar y un orden del día de uno o más puntos.
- **FR-002**: Cada punto DEBE tener título, descripción opcional, modalidad y mayoría requerida.
  La modalidad es binaria (positivo, negativo, abstención) o de opción múltiple (dos o más opciones
  definidas al crear). La mayoría requerida es absoluta, dos tercios o unanimidad, y solo aplica a
  los puntos binarios.
- **FR-003**: Si quien crea es del consejo, el sistema DEBE permitirle decidir si la
  administración está invitada. Si quien crea es la administración, está invitada siempre.
- **FR-004**: El orden del día y los datos de la asamblea DEBEN poder editarse solo en borrador.
  Enviada la convocatoria, el orden del día NO DEBE poder modificarse (CCyC 2059).
- **FR-005**: El sistema DEBE rechazar el envío de una convocatoria cuya fecha no respete la
  anticipación mínima del consorcio, con un mensaje que indique la fecha más temprana posible
  (RNF-10).
- **FR-006**: Al enviar la convocatoria, el sistema DEBE avisar a todos los propietarios vigentes
  y a la administración si está invitada. El aviso va dentro de Flay y por correo, y el correo
  también llega a los propietarios sin cuenta que tengan correo en el padrón.
- **FR-007**: El sistema DEBE ofrecer, en la pantalla de la asamblea y en el aviso, un enlace para
  agregar el evento a Google Calendar y un archivo de calendario estándar para otros calendarios.
  El evento lleva título, fecha y hora, lugar, orden del día y enlace a la asamblea.
- **FR-008**: El sistema DEBE permitir cancelar una asamblea convocada antes de abrirla, con aviso
  a todos los convocados.
- **FR-009**: El sistema DEBE informar al convocar qué propietarios no tienen cuenta ni correo, para
  que la administración los convoque por otro medio.

**Poderes (RF-30 propuesto)**

- **FR-010**: Un propietario vigente DEBE poder otorgar, para una asamblea convocada, un poder
  sobre su unidad a otro usuario habilitado en el consorcio.
- **FR-011**: La administración, o quien dirige si la administración no está invitada, DEBE poder
  registrar un poder en nombre de un propietario sin cuenta, consignando que se recibió en papel.
- **FR-012**: El sistema DEBE rechazar un poder que haga superar al apoderado el tope de unidades
  representadas del consorcio.
- **FR-013**: Un poder DEBE valer para una sola asamblea, y poder revocarse hasta que la asamblea
  se abre.
- **FR-014**: Otorgar y revocar un poder DEBE avisar al propietario y al apoderado.

**Asistencia, quórum y votación (RF-31 propuesto)**

- **FR-015**: Solo un miembro del consejo o la administración invitada DEBE poder abrir, dirigir y
  finalizar una asamblea, y cualquiera de ellos DEBE poder tomar la dirección.
- **FR-016**: Al abrir, el sistema DEBE permitir registrar la asistencia por unidad, indicando si
  está presente por propietario o por apoderado. Una unidad se registra una sola vez.
- **FR-017**: La asamblea se abre (empieza la acreditación) desde la hora de la primera
  convocatoria, y quien dirige la constituye después. El sistema DEBE calcular el quórum como el
  porcentaje de coeficientes presentes:
  - en primera convocatoria, constituye con más del 50 %;
  - desde 30 minutos después, constituye en segunda convocatoria con los presentes, siempre que
    haya al menos una unidad presente con voto.

  Los puntos solo se abren con la asamblea constituida.
- **FR-018**: El sistema DEBE marcar sin voto a las unidades cuyo número de expensas adeudadas
  supere el umbral del consorcio. Cuentan para el quórum, pero no votan ni integran la base de
  votos.
- **FR-019**: Antes de constituir, quien dirige DEBE registrar presidente y secretario, elegidos
  entre las personas presentes **con usuario en Flay**, porque los dos firman el acta (FR-031).
- **FR-020**: Quien dirige DEBE abrir y cerrar los puntos de a uno, en el orden del día. Solo se
  vota el punto abierto.
- **FR-021**: Cada presente DEBE poder votar desde su teléfono, por cada unidad que representa con
  voto. Quien dirige DEBE poder cargar el voto de una unidad presente que no votó.
- **FR-022**: Cada unidad emite un solo voto por punto. Un voto emitido NO DEBE poder modificarse
  ni eliminarse, ni por quien votó ni por quien dirige.
- **FR-023**: Mientras la asamblea está en curso, el sistema DEBE mostrar a cualquier usuario
  habilitado del consorcio, en una vista que se actualiza sola en no más de 5 segundos:
  - el punto abierto y sus opciones;
  - la asistencia y el quórum;
  - el conteo por opción, en unidades y en coeficientes;
  - el voto de cada unidad;
  - los resultados de los puntos cerrados.
- **FR-024**: Al cerrar un punto binario, el sistema DEBE resolverlo por doble cómputo: unidades y
  coeficientes. Con la mayoría absoluta, se aprueba si los positivos superan la mitad de la base en
  los dos cómputos; con dos tercios, si alcanzan los dos tercios en los dos; con unanimidad, si
  todas las unidades de la base votan positivo. La base depende de la regla del consorcio: las
  unidades presentes con voto («presentes») o todas las unidades vigentes con voto («totalidad»).
  La abstención no suma en ningún cómputo.
- **FR-025**: Al cerrar un punto de opción múltiple, el sistema DEBE elegir la opción con más votos
  en unidades y en coeficientes. Si los dos cómputos dan opciones distintas, o hay empate en la
  primera posición, el punto queda sin decisión.
- **FR-026**: Al finalizar la asamblea, la asistencia, los votos y los resultados DEBEN quedar
  inmutables. Ninguna ruta de la aplicación puede alterarlos (Principio V).

**Decisión provisoria y oposición (RF-33 propuesto)**

- **FR-027**: Con la regla «totalidad», un punto binario aprobado por la mayoría requerida sobre los
  presentes con voto, que no la alcanza sobre el total, DEBE quedar provisorio. El sistema DEBE
  avisar a los propietarios de las unidades ausentes, en Flay y por correo.
- **FR-028**: Durante 15 días corridos desde el cierre del punto, que es cuando sale el aviso, el propietario de una unidad ausente DEBE
  poder oponerse a la decisión provisoria. La administración DEBE poder registrar la oposición de
  un propietario sin cuenta.
- **FR-029**: Vencido el plazo, la decisión DEBE figurar firme, salvo que los votos en contra más
  las oposiciones impidan la mayoría requerida sobre el total en alguno de los dos cómputos; en ese
  caso, DEBE figurar caída. Las oposiciones no modifican los votos registrados.

**Acta (RF-32 propuesto)**

- **FR-030**: Después de finalizar, el secretario o quien dirigió DEBE poder redactar un resumen
  por punto. El sistema DEBE componer el acta con:
  - los datos de la asamblea y la convocatoria en la que sesionó;
  - la asistencia, con unidades, representación y coeficientes;
  - las autoridades;
  - por cada punto: el resumen, el voto de cada unidad, el resultado y su estado (firme o
    provisoria).
- **FR-031**: Quien dirigió DEBE designar los firmantes: presidente, secretario y dos propietarios
  presentes con usuario en Flay. Enviada a firmar, el contenido del acta NO DEBE poder
  modificarse. La única excepción es reemplazar a un firmante que todavía no firmó por otro
  presente con usuario, en el mismo rol (caso borde).
- **FR-032**: Cada firmante DEBE poder firmar electrónicamente con su sesión. El sistema registra
  firmante, fecha y hora, y la huella del documento firmado.
- **FR-033**: Con todas las firmas, el acta DEBE quedar publicada como documento oficial del
  consorcio, de tipo acta, visible para los consorcistas y disponible para la consulta documental
  (RF-20).
- **FR-034**: A los 10 días sin todas las firmas, el sistema DEBE avisar a quien dirigió y a los
  firmantes pendientes.

**Configuración y transversales**

- **FR-035**: La administración DEBE poder configurar, por consorcio: la regla de mayoría, la
  anticipación mínima, el tope de unidades por apoderado y el umbral de expensas adeudadas. Los
  valores por defecto son «presentes», 15 días, 3 unidades y más de 2 expensas. Cada asamblea
  conserva la configuración con la que se convocó.
- **FR-036**: Toda operación DEBE estar autorizada por rol y por consorcio, y aislada por consorcio
  (Principio I). La administración no invitada ve la asamblea, pero no la dirige ni vota.
- **FR-037**: Todo cálculo con coeficientes DEBE hacerse en aritmética decimal de precisión fija,
  nunca en punto flotante (Principio II).
- **FR-038**: Convocar, abrir, cada voto, cerrar puntos, finalizar, cada oposición y cada firma
  DEBEN quedar en la bitácora de auditoría (RN-15).
- **FR-039**: La vista en vivo, el voto y la firma DEBEN operar correctamente en teléfono (RNF-01) y
  cumplir WCAG 2.1 AA (RNF-11).

### Key Entities *(include if feature involves data)*

- **Asamblea**: reunión de un consorcio. Tiene tipo, fecha y hora de primera convocatoria (la
  segunda es 30 minutos después), lugar, organizador, si la administración está invitada, estado
  (borrador, convocada, en curso, finalizada, acta firmada, cancelada), la convocatoria en que
  sesionó, presidente, secretario, quien dirige y la configuración congelada al convocar.
- **Punto del orden del día**: pertenece a una asamblea. Tiene orden, título, descripción,
  modalidad, mayoría requerida, estado (pendiente, abierto, cerrado), resultado y resumen redactado
  después.
- **Opción**: alternativa de un punto de opción múltiple.
- **Poder**: autorización de un propietario a otro usuario para representar una unidad en una
  asamblea. Registra si se otorgó en Flay o se registró desde papel, y si fue revocado.
- **Asistencia**: presencia de una unidad en una asamblea. Indica quién la representa (propietario
  o apoderado), su coeficiente y si tiene voto o está sin voto por mora.
- **Voto**: lo que votó una unidad en un punto. Indica quién lo emitió, si desde su teléfono o por
  carga de quien dirige, y cuándo. Es inmutable.
- **Oposición**: rechazo de un propietario ausente a una decisión provisoria, dentro del plazo.
- **Acta**: documento compuesto de la asamblea, con su huella, sus firmantes designados y su
  estado (en redacción, a firmar, firmada).
- **Firma**: firmante, rol en el acta (presidente, secretario, propietario), fecha y hora, y huella
  del documento.
- **Configuración de asambleas del consorcio**: regla de mayoría, anticipación mínima, tope de
  unidades por apoderado y umbral de mora.
- **Relación con entidades existentes**:
  - `Consorcio` y `Unidad`, que aportan el coeficiente y la vigencia;
  - `Ocupacion`, que dice quién es propietario o inquilino vigente;
  - `Habilitacion`, que da el rol consejo o administrador;
  - el estado de cuenta, que da la deuda de cada unidad;
  - `Notificacion`, para los avisos;
  - `DocumentoConsorcio` de tipo acta, para el acta firmada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un presente ve en su teléfono, en no más de 5 segundos, el voto que otra persona acaba
  de emitir y el conteo actualizado.
- **SC-002**: El resultado de cada punto coincide exactamente, en unidades y en coeficientes con
  ocho decimales, con el cálculo manual sobre el mismo padrón. Los casos verificados cubren los
  tres umbrales, las dos reglas de base y la opción múltiple.
- **SC-003**: El 100 % de los intentos de modificar un voto emitido, el orden del día de una
  asamblea convocada, una asamblea finalizada o un acta enviada a firmar se rechaza.
- **SC-004**: El 100 % de los propietarios vigentes con cuenta o con correo recibe la convocatoria,
  y la convocatoria lista a los que no tienen ninguno de los dos.
- **SC-005**: Un usuario de un consorcio no ve, no vota y no firma ninguna asamblea de otro
  consorcio.
- **SC-006**: Un presente que entra por primera vez a la asamblea en curso desde el teléfono emite
  su voto en menos de 30 segundos.
- **SC-007**: El acta firmada reproduce sin omisiones la asistencia, las autoridades, los votos por
  unidad y los resultados registrados, y cualquier alteración del documento posterior a la firma
  es detectable por su huella.
- **SC-008**: Con la regla «totalidad», toda decisión provisoria figura firme o caída al vencer los
  15 días, de acuerdo con las oposiciones registradas.

## Assumptions

- **Cambio de alcance.** La reunión es presencial; no hay asamblea virtual ni videollamada. Se
  documenta como alcance nuevo: se quita la exclusión de `docs/entrega-1/04-alternativas-solucion.md`
  y se agregan RF-29 a RF-33, RN nuevas y casos de uso nuevos en los documentos 04, 07 y 12.
  (Confirmado con el usuario.)
- **Firma electrónica en Flay**, no firma digital con certificado (Ley 25.506). El acta del sistema
  es la oficial, y su respaldo probatorio es la sesión autenticada, la bitácora y la huella.
  (Confirmado con el usuario.)
- **Voto por unidad y nominal**, no secreto. (Mi decisión.)
- **Varios propietarios en una unidad.** Vale el primer voto. Como el voto no se modifica, la unidad
  queda cerrada para ese punto. (Mi decisión, a partir de «no se pueden modificar votos».)
- **Opción múltiple por pluralidad**, siempre firme al cerrar. La regla «totalidad» y la mayoría
  requerida no aplican a estos puntos. (Confirmado con el usuario.)
- **Segunda convocatoria a los 30 minutos**, que sesiona con los presentes (art. 20 del
  reglamento). El reloj decide cuál rige al abrir.
- **Mora sin voto.** Pierde el voto la unidad que adeuda más de 2 expensas (art. 23). La deuda se
  mide con el estado de cuenta vigente el día de la reunión. La unidad morosa presente cuenta para
  el quórum.
- **El acta la firman cuatro personas**: presidente, secretario y dos propietarios (art. 24 del
  reglamento), con plazo de 10 días.
- **El secretario redacta los resúmenes** después de la reunión; quien dirigió también puede.
  (Confirmado con el usuario: «se completa después».)
- **Decisión provisoria.** El silencio del ausente vale como conformidad, y los 15 días son corridos
  desde el aviso (CCyC 2060). El acta se firma sin esperar el plazo y consigna el estado de cada
  decisión.
- **Calendario sin integración.** Se agrega a Google Calendar con un enlace, sin conectar la cuenta
  del usuario. Un evento ya guardado no se actualiza si la asamblea cambia.
- **Administración no invitada.** No recibe la convocatoria y no dirige ni vota, pero ve la
  asamblea y el acta. (Confirmado con el usuario.)
- **Fuera de alcance**: elegir el consejo o autoridades permanentes desde Flay, y redactar el acta
  con ayuda de IA.
