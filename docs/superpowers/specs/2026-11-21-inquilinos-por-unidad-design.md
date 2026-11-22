# Inquilinos por unidad — diseño

Fecha: 2026-11-21. Trazabilidad: `RF-03`, `FR-008` / `FR-008b` / `FR-008c` (spec 002), `CU-06`,
`RN-05`, `RN-09`, `RN-12`. Reglas nuevas propuestas: `RN-23` y `RN-24` (§ 7.2, ver «Documentación»).

## Intención

Un dueño puede tener muchas unidades en un edificio —departamentos y cocheras— y alquilarlas a
distintas personas. Los inquilinos son temporales: viven un tiempo y se van. Hoy el sistema guarda
el tipo de ocupación (`propietario` / `inquilino`) pero casi no lo usa, y le faltan tres cosas:

- el dueño no tiene pantalla para cargar a su inquilino (el caso de uso existe, FR-008b, pero
  Usuarios es solo del administrador, y la invitación también: `invitar-persona.ts:71`);
- no hay forma de sacar a un inquilino: la vigencia tiene fin en la base, pero nada lo escribe;
- el que se va conserva el acceso al consorcio (la habilitación de FR-008c nunca se cierra), y el
  que llega ve la historia económica completa de la unidad, la del inquilino anterior incluida.

## Lo que se decidió (con los integrantes)

1. **El dueño ve todas las expensas de todas sus unidades**, alquiladas o no, con toda su historia.
   Ya es así hoy (`unidadesPropias`); no cambia.
2. **El inquilino ve solo las expensas de su unidad desde su ingreso.** La expensa se muestra
   **completa**, con lo arrastrado y el exigible consolidado, igual que hoy (opción «B»).
3. **Si la unidad trae deuda anterior a su ingreso**, el inquilino ve un aviso: hay deuda anterior y
   tiene que comunicarse con el propietario para saldarla. El aviso informa, **no bloquea** el pago.
4. **El dueño y la administración asignan y desasignan inquilinos.** Tiene que ser fácil: es una
   operación frecuente.
5. **Cuando el inquilino se va, pierde el acceso al consorcio**, salvo que conserve otra ocupación
   vigente allí (o un rol distinto de consorcista, que no se toca).
6. **El usuario se conserva siempre.** Quien fue inquilino y después alquila otra unidad —en el mismo
   edificio o en otro— sigue con la misma cuenta y la misma clave; solo se le reabre el acceso.
7. **Toda unidad funcional se trata igual, sea departamento, cochera, local o baulera**: cada una
   tiene su dueño, puede tener su inquilino y tiene su propia expensa. Una cochera puede alquilarse
   junto con el departamento (dos ocupaciones de la misma persona) o a otra persona, que no vive en
   el edificio. Nada de este diseño filtra por tipo de unidad.
8. Enfoques elegidos: **UI «A»** y **acceso «A»** (ver Enfoques).

## Objetivos

- Asignar un inquilino a una unidad en un modal de una pantalla, desde la unidad.
- Terminar un alquiler (o correr la fecha de fin del contrato) en un modal de una pantalla.
- Que la fecha de fin del contrato, cargada al asignar, corte sola la ocupación y el acceso, sin cron.
- Que el inquilino no vea nada económico de la unidad anterior a su ingreso, por ningún camino
  (pantalla de expensas, estado de cuenta, pagos, asistente).

## No objetivos

- Transferir la propiedad (venta) desde la UI del dueño: el propietario lo sigue cargando la
  administración, como hoy.
- Un circuito de solicitudes («pedirle a la administración que cargue al inquilino»): FR-008b ya lo
  dejó fuera de alcance.
- Repartir el cobro entre dueño e inquilino según `RN-05` (ordinarias / extraordinarias): la expensa
  se muestra y se cobra completa (decisión 2).
- Acceso «solo historia» para el ex inquilino.
- Herramientas del asistente para asignar inquilinos.

## Anti-objetivos (sería un fracaso aunque funcione)

- Que un inquilino vea pagos, deudas o expensas de quien vivió antes (RT-04 en pequeño).
- Que un dueño pueda tocar la ocupación de una unidad que no es suya, o que se entere de que existe:
  responde «no encontrado», nunca «prohibido» (SC-008).
- Que el dueño vea la nómina del consorcio (correos, roles de otros) para poder operar.
- Que el ex inquilino pierda su cuenta, o que al volver tenga que registrarse de nuevo.
- Que el padrón de ocupaciones y los accesos se contradigan (la razón de ser de FR-008c).

## Enfoques considerados

### Dónde se asigna y desasigna

- **A — Tabla de ocupantes por unidad, en dos lugares (elegido).** El administrador la ve como
  columna en **Unidades** (todas); el dueño en una sección nueva, **Mis unidades** (solo las suyas).
  Mismo componente, mismas acciones y modales. Expensas sigue siendo solo dinero.
- B — Acciones dentro de Expensas, en el bloque de cada unidad del dueño. Ahorra una sección pero
  mezcla dinero con ocupación, y el administrador igual necesita otro lugar.
- Descartado — Abrirle Usuarios al dueño: expone la nómina completa.

### Cómo se pierde el acceso

- **A — El acceso sigue a la ocupación (elegido).** Toda alta o fin de ocupación recalcula la
  `vigenciaHasta` de la habilitación de consorcista de esa persona en ese consorcio. Con fecha de fin
  de contrato, el acceso se corta solo ese día.
- B — Que la autorización exija ocupación vigente al rol consorcista. Cambia la puerta de todo el
  sistema y deja afuera a consorcistas sin unidad cargada.

## Diseño

### 1. Fechas: una sola convención

La vigencia es `daterange` semiabierto `[desde, hasta)`. En pantalla, **«Hasta» es el último día
inclusive** («vive hasta el 28/02/2027»), así que se guarda `hasta + 1 día`. La conversión vive en un
solo lugar (repositorio de ocupaciones), no en cada formulario. La habilitación usa `vigenciaHasta`
inclusiva (`accesoVigente`: `vigenciaHasta >= hoy`), así que la cuenta es
`vigenciaHasta = upper(vigencia) − 1 día` = el «Hasta» de pantalla. Fechas en hora argentina
(`relojDelSistema.hoy()`), nunca el día UTC (nota 27).

### 2. Reglas de dominio (puras, en `src/dominio/`)

- `RN-23` — **Desde cuándo ve el inquilino.** Para una unidad, el ocupante tiene un `visibleDesde`:
  `null` si es propietario (ve todo), el primer día del mes de `lower(vigencia)` si es inquilino. Una
  liquidación es visible si su período (`anio`, `mes`) es ≥ ese mes. Quien entra el 15/03 ve la de
  marzo.
- `RN-24` — **El acceso sigue a las ocupaciones.** Dadas las ocupaciones de una persona en un
  consorcio, la `vigenciaHasta` de su habilitación de consorcista es: `null` si alguna no tiene fin;
  si no, el máximo de sus fines (en convención de habilitación, § 1). Función pura, con su prueba
  de dominio.
- Validadores de campo (nota 28): `errorDeFinDeAlquiler(desde, hasta)` («La fecha de fin no puede ser
  anterior al ingreso, el 01/03/2026.»), reusados al tipear y al guardar.

### 3. Repositorio de ocupaciones (`src/infraestructura/repositorios/ocupaciones.ts`)

- `terminarOcupacion(ocupacionId, hastaInclusive, cliente)`: `UPDATE ... SET vigencia =
  daterange(lower(vigencia), hasta + 1, '[)')`. Si se superpone con el inquilino siguiente, la
  exclusión de la base la rechaza (RN-09) y se traduce con `comoInquilinoSuperpuesto`.
- `unidadesPropias` pasa a devolver, por unidad, también `visibleDesde` (regla RN-23). **Es el único
  punto** donde se decide el corte: todos sus consumidores (`ver-expensa.ts`, `estado-de-cuenta.ts`,
  `asistente/lectura.ts`, `asambleas/ver.ts`, `poderes.tsx`) reciben el dato y filtran con él. Si una
  persona tuvo dos ocupaciones de la misma unidad, cuenta la vigente hoy.
- `ocupacionesDeUnidades(unidadIds, hoy)`: para la tabla, el inquilino vigente o futuro de cada unidad
  (nombre, correo, desde, hasta inclusive, `ocupacionId`). Los ids vienen de una consulta aislada
  (nota 10).

### 4. Casos de uso (`src/aplicacion/consorcios/`)

- **`asignarInquilino`** (reemplaza el camino de inquilino de `accionAsignarUnidad`):
  datos `{ unidadId, nombre, apellido, correo, desde, hasta? }`. Autoriza administrador **o**
  propietario vigente de **esa** unidad (condición de fila existente, `exigirPropietarioDeLaUnidad`;
  sobre otra unidad, «no encontrado»). En una transacción: busca o crea `Persona` por correo,
  busca o crea `Usuario` (si es nuevo, invitación encolada, como `invitarPersona`), inserta la
  ocupación, y **sincroniza la habilitación** (RN-24). A diferencia de `invitarPersona`, **no** tira
  `YaTieneAcceso` si la persona ya es consorcista del consorcio: solo suma la ocupación.
  La lógica común con `invitarPersona` (persona/usuario/invitación) se extrae y la usan los dos; no
  se duplica.
- **`terminarAlquiler`**: datos `{ ocupacionId, hasta }`. Misma autorización (administrador o
  propietario vigente de la unidad de esa ocupación). Solo sobre ocupaciones de tipo inquilino: el fin
  de un propietario no se ofrece al dueño (no objetivo). Sirve para terminar hoy, en el pasado (carga
  tardía) o correr el fin hacia adelante (renovación). Luego **sincroniza la habilitación**.
- **`sincronizarHabilitacion(personaId, consorcioId, tx)`**: lee las ocupaciones de la persona en el
  consorcio y fija la habilitación de consorcista con RN-24: la crea si no existe y la persona tiene
  usuario, **la reabre si estaba cerrada** (hoy `habilitarComoConsorcista` hace `upsert` con
  `update: {}` y no reabre: un inquilino que vuelve al mismo edificio quedaría afuera), o la cierra.
  No toca habilitaciones de administrador o consejo, ni la de un consorcista sin ninguna ocupación.
  `registrarOcupacion` (alta de propietario por la administración) pasa a usarla también.
- Auditoría: `Ocupacion` ya tiene disparador de bitácora, así que alta, fin y corrimiento quedan
  registrados sin código. `Habilitacion` no lo tiene (tampoco hoy, con «Quitar acceso»); no es dato
  económico y no se agrega en este alcance.
- El estado de cuenta (sección Pagos) entra por `unidadesAlcanzables` → `unidadesPropias`, así que el
  corte le llega por el mismo punto: los movimientos anteriores al ingreso no se listan; el saldo de
  la unidad sigue siendo el consolidado (decisión 2).
- Consorcio archivado: `Ocupacion` ya lleva el candado (`archivado-base.spec.ts`); la UI esconde las
  acciones con `!activo.archivadoEn` y el error llega legible por `traducirArchivado`.

### 5. Expensas del inquilino

- `misExpensas` / `verExpensa` filtran por `visibleDesde`. Abrir por id una expensa anterior al
  ingreso responde «no encontrado».
- **Aviso de deuda anterior**: si entre los impagos de la unidad (`deudaDeUnidad(...).impagos`, la
  cuenta única de la nota 27) hay liquidaciones de períodos anteriores a `visibleDesde`, Expensas
  muestra arriba de la lista un `.aviso` de estado (no toast, nota 25):
  «La unidad 3B tiene deuda anterior al ingreso del inquilino por $ X. Para saldarla, corresponde
  comunicarse con el propietario.» (trato neutro, guía § 4). `$ X` es la suma de los saldos de capital de esos impagos, serializada como cadena.
  Desaparece cuando se cancelan. Solo lo ve quien tiene `visibleDesde` (el inquilino); el dueño no.
- El pago en línea no cambia: cobra el exigible consolidado.

### 6. Pantallas

Siguen `docs/guia-estilos.md`: modal con `BotonModal` (§ 3.4, crear/confirmar en una pantalla),
`TablaDesplazable` con `<caption>` y `plural()`, acciones a la derecha, `.vacio` cuando no hay nada,
resultado como toast con `conHecho` / `conError` (nota 24), validadores de campo al tipear (nota 28),
textos en infinitivo neutro, 44 px táctil, 390×844.

**Componente `CeldaInquilino`** (`src/app/(panel)/consorcios/[consorcio]/ocupantes/`): la celda
«Inquilino» de una unidad, con sus acciones. Lo usan la tabla de Unidades y la de Mis unidades.

```
Unidad   Inquilino                                       Acciones
3B       Juan Pérez · 01/03/2026 – 28/02/2027            [Terminar alquiler]
4A       —                                               [Asignar inquilino]
C-12     —                                               [Asignar inquilino]
```

- Cada inquilino vigente o futuro de la unidad va en su línea, con «desde – hasta» («sin fecha» si
  no tiene fin) y su botón «Terminar alquiler» → modal con «Último día» (hoy por omisión, `min` =
  ingreso). Texto: «Juan Pérez deja de tener acceso al consorcio desde el día siguiente, salvo que
  ocupe otra unidad.» Botón «Confirmar».
- «Asignar inquilino» se ofrece cuando ningún inquilino de la unidad está sin fecha de fin (si el
  actual tiene fin, se puede cargar el siguiente). Modal con Nombre, Apellido, Correo, Desde (hoy),
  Hasta (opcional, ayuda: «Fin del contrato. Vacío: sin fecha.»). Botón «Asignar».
- Toasts nuevos en `HECHO`: `inquilino-asignado` («Inquilino asignado.»), `alquiler-terminado`
  («Fin del alquiler registrado.»). El de asignar es **el mismo** tenga o no cuenta la persona: el
  dueño no tiene por qué enterarse de si ese correo ya estaba en Flay.

**Unidades** (administrador): suma la columna «Inquilino» con las mismas acciones. El consejo ve la
columna sin acciones (ya ve el padrón sin editarlo).

**Mis unidades** (sección nueva en `secciones.ts`, bloque Administración, rol `consorcista`):
- Las unidades donde la persona es **propietaria vigente**, en una tabla Unidad · Tipo · Inquilino
  (`CeldaInquilino`, con acciones).
- Si además alquila alguna, debajo y sin acciones: «Unidad 2C en alquiler desde 01/03/2026 hasta
  28/02/2027.» («sin fecha de fin» si no tiene).
- Sin ninguna de las dos: `.vacio` «No hay unidades a nombre de esta cuenta en este consorcio.»
- La lista de unidades sale del caso de uso (propietario vigente), nunca de un parámetro.

La columna «Unidades» de Usuarios sigue mostrando «3B · inquilino»; «Asignar unidad» e «Invitar persona»
dejan de ofrecer «Inquilino» y cargan solo propietarios (el inquilino se asigna desde la unidad),
para no tener dos caminos. El caso de uso `invitarPersona` conserva el tipo: solo cambia la pantalla.

### 7. Privacidad e IA

Nada de esto pasa por el asistente. La lectura del asistente usa `unidadesPropias`, así que hereda el
corte de RN-23 sin cambio propio; una prueba canario lo cubre (invariante 8).

### 8. Pruebas

- Dominio: RN-23 (borde de mes, ingreso a mitad de mes), RN-24 (sin fin, con fines, mezcla),
  conversión de fechas inclusiva ↔ semiabierta, `errorDeFinDeAlquiler`.
- Integración:
  - el inquilino ve solo desde su ingreso; abrir por id una anterior da «no encontrado»; el estado de
    cuenta y el asistente tampoco la muestran;
  - el aviso de deuda anterior aparece con impagos previos y desaparece al saldarlos;
  - el dueño sigue viendo todo, en todas sus unidades;
  - el dueño asigna y termina solo en su unidad; en la del vecino, «no encontrado»;
  - terminar cierra el acceso si no queda otra ocupación y lo mantiene si queda;
  - con fecha de fin, al día siguiente (reloj adelantado) el acceso ya no es vigente;
  - el mismo inquilino vuelve al mismo consorcio: misma cuenta, acceso reabierto;
  - el mismo inquilino alquila en otro consorcio: misma cuenta, sin invitación nueva;
  - superposición de inquilinos (alta o corrimiento del fin): mensaje de RN-09.
- E2E + a11y: Mis unidades (dueño) y columna de Unidades (administrador), los dos modales,
  escritorio y 390×844.

### 9. Documentación

- `docs/entrega-3/07-analisis-de-datos.md` § 7.2: agregar `RN-23` y `RN-24` (sin nombres de producto).
- `docs/entrega-final/16-manual-usuario.md`: «Asignar y terminar un alquiler» para el dueño y el
  administrador.
- Corregir el comentario de `Ocupacion` en `schema.prisma` («decide a quién se le cobra la
  expensa»): lo que decide es qué se ve y quién administra al inquilino.

## Lo que queda al constructor

- Nombres de archivos y la extracción exacta de la parte común con `invitarPersona`.
- Si el filtro de `visibleDesde` va en la consulta o después de `expensasDe` (que sea un solo lugar).
- Orden de las filas cuando una unidad tiene inquilino vigente y futuro.

## Decisiones tomadas por el diseño (para revisar)

- «Hasta» se muestra inclusivo y se guarda semiabierto.
- El inquilino ve desde el **mes** de ingreso, no desde el día.
- Mis unidades va en el bloque Administración y lo ve el rol consorcista.
- El consejo ve la columna de inquilino sin acciones.
- El toast de asignar no revela si el correo ya tenía cuenta.
- «Asignar unidad» en Usuarios queda solo para propietarios.
- El dueño no puede terminar la ocupación de un propietario ni la suya propia.
