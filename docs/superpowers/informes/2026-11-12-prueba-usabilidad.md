# Prueba de usabilidad y navegabilidad — Flay

**Fecha:** 12/11/2026 · **Versión:** `main` @ `487fd35` · **Modo:** usuario final, sin mirar el código salvo para confirmar la causa de un defecto.

## Entorno

- Build de producción (`next build` + `next start` en `:3100`) contra la **base Docker local** (`flay-db`, puerto 5434), con la semilla demo ya cargada. Se pisó `.env.local` desde el entorno del proceso para **no tocar el preview de Neon**.
- Navegador automatizado (Playwright): escritorio 1280×720 y teléfono 390×844 táctil.
- Limitaciones del entorno local: sin `RESEND_API_KEY` (los correos quedan en cola), sin credenciales de Mercado Pago (no hay pago en línea) y con los PDF/documentos de la semilla **ausentes** del bucket. Algunos hallazgos se dispararon por esto, pero son defectos reales de robustez (lo aclaro en cada uno).

## Perfiles y casos ejecutados

| Persona | Usuario | Qué se probó |
|---|---|---|
| Visitante | — | Landing, rutas protegidas sin sesión, ingreso con errores, redirección a la ruta pedida |
| Dueño de la plataforma | `plataforma@flay.demo` (creado para la prueba) | Alta de consorcio (CUIT inválido, duplicado, válido), carga de padrón, qué ve |
| Administradora de cartera | `admin1@flay.demo` | Las 27 pantallas del consorcio, bandeja, gasto (inputs inválidos), proveedor, reclamo de punta a punta, vencimientos, invitar usuario, pago manual, liquidación, documentos, exportación, teléfono |
| Operador de un edificio | `operador1@flay.demo` | Aislamiento: URL directa a otro consorcio, galleta manipulada, exportación CSV ajena |
| Consejo (también propietario 2A) | `consejo1@flay.demo` | Permisos de lectura, acciones disponibles, su propia expensa |
| Propietario | `vecino1a@flay.demo` | Rutas de admin por URL, expensas en teléfono, reclamo (vacío, largo, HTML), reservas (todas las reglas), asistente, consulta documental, notificaciones, salir y «atrás» |
| Propietario moroso / inquilino | `moroso3b`, `inquilino1c` | Expensas, bloqueo de reservas |
| Invitada nueva | `ana.prueba@flay.demo` (creada por la UI) | Invitación, fijar contraseña, reuso del enlace, qué ve sin unidad, bloqueo por intentos |

**No cubierto:** sala de asamblea en vivo y votación, carga asistida con un comprobante real, publicar novedades, alta de espacios y pago en línea (sin credenciales).

---

## Resumen

La base es sólida. **El aislamiento entre consorcios y los permisos por rol aguantaron todo lo que intenté.** Las reglas de negocio con mensajes precisos (reservas, vencimientos, padrón) están muy bien resueltas. Los problemas grandes no están en lo que el sistema hace sino en **lo que falta para operarlo sin tocar la base**: vincular personas a unidades, editar lo cargado mal, recuperar una contraseña. A eso se suman dos defectos que tiran pantallas enteras: las expensas del vecino y el indicador de proveedores.

| Severidad | Cantidad |
|---|---|
| Crítico — bloquea un flujo central | 5 |
| Alto | 10 |
| Medio | 17 |
| Bajo / textos | 10 |

---

## Críticos

### C1. El vecino no puede ver ninguna de sus expensas si falta un solo PDF
Con `vecino1a`, `moroso3b` e `inquilino1c`, **Expensas** muestra solo «No encontramos lo que buscabas.» (escritorio y teléfono). Es la pantalla principal del consorcista.
**Causa:** `aVisible` (`src/aplicacion/liquidacion/ver-expensa.ts:300-302`) resuelve la URL del PDF con `resolverLecturaAutorizada`, que lanza `NoEncontrado` si el objeto no está en el almacén (`src/infraestructura/objetos/r2.ts:133-138`). Como `misExpensas` arma la lista con `Promise.all`, **un PDF faltante voltea la lista entera** y también el detalle. Localmente lo dispara el bucket sin los PDF de la semilla; en producción alcanza con un objeto borrado o con una generación que falló.
**Arreglo sugerido:** en `aVisible`, atrapar `NoEncontrado` y devolver `direccion: null` («documento no disponible»), como ya se hace cuando todavía no hay clave.

### C2. No hay forma de asignarle una unidad a una persona desde la interfaz
**Invitar persona** pide nombre, correo, rol y vigencia, pero **no la unidad**. Ninguna pantalla usa `registrarOcupacion`. Lo comprobé de punta a punta con Ana: aceptó la invitación, ingresó y ve «No hay unidades a tu nombre en este consorcio» en Expensas y «No tenés una unidad a tu nombre» en Reservas. No puede ver su expensa, pagar ni reservar, **y ningún administrador puede arreglarlo**. Todo consorcista que se sume después de la semilla queda así.

### C3. El indicador de proveedores (I-3) da error 500 siempre
`/consorcios/<id>/indicadores/proveedores` → error del servidor en todos los casos.
**Causa:** `desempenoProveedores` (`src/infraestructura/repositorios/indicadores.ts:139-143`) hace `JOIN "Proveedor"` (que también tiene `consorcio_id`) y `alcance()` (`:25-33`) escribe `consorcio_id` sin calificar → Postgres `42702 column reference "consorcio_id" is ambiguous`.
**Arreglo sugerido:** que `alcance` reciba el alias, o calificar `v.consorcio_id` en esa consulta.

### C4. El miembro del consejo no puede ver ni pagar su propia expensa
`consejo1` es propietario de la 2A. En Expensas ve la vista de la administración (totales por período) y en la liquidación ve la fila 2A, pero **sin enlace a su expensa ni botón de pago**.
**Causa:** `src/app/(panel)/consorcios/[consorcio]/expensas/page.tsx:55-59` → `esDeLaAdministracion ? Promise.resolve([]) : misExpensas(...)`. Si es consejo, nunca se buscan sus unidades. Debería mostrar las dos cosas.

### C5. Quien olvida la contraseña no tiene cómo volver a entrar
- No hay «¿Olvidaste tu contraseña?» en el ingreso.
- En Usuarios, «Reenviar» aparece solo para los invitados; para un usuario activo no hay ninguna acción.
- Después de 5 intentos fallidos la cuenta se bloquea 15 minutos **sin avisarlo** (a propósito, FR-001c): con la clave correcta sigue diciendo «El correo o la contraseña no coinciden.». `desbloquearUsuario` existe pero ninguna pantalla lo usa.

El vecino que se equivoca cinco veces cree que olvidó la clave, y ni él ni la administración tienen una salida.

---

## Altos

### A1. Los formularios borran lo que escribiste cuando el servidor los rechaza
Pasa en Nuevo gasto (importe, fecha y descripción quedan vacíos), Nuevo reclamo, Reservar, Invitar persona, Nuevo proveedor y en el **correo** del ingreso. Es el comportamiento por defecto de React 19 con acciones de formulario. **Vencimientos sí conserva los valores**, así que el patrón ya está resuelto en el código: hay que replicarlo (devolver los valores en el estado y usarlos como `defaultValue`).

### A2. Invitar acepta un correo inválido
Invité a `ana@` y se creó el usuario (`estado = invitado`), con el correo en cola para siempre. `invitar-persona.ts:79` solo hace `trim().toLowerCase()`, sin validar el formato, mientras que el ingreso sí usa `z.string().email()`.

### A3. No se puede sumar a alguien que ya tiene usuario, ni quitarle el acceso a nadie
Invitar un correo existente da «Ese correo ya tiene un usuario en el sistema.». Un propietario con unidades en dos edificios, o un administrador al que se le asigna un consorcio nuevo, no se pueden agregar. Tampoco hay pantalla para **cambiar el rol, revocar el acceso o dar de baja** a alguien: `otorgarHabilitacion` y `revocarHabilitacion` no tienen interfaz. Usuarios solo ofrece «Invitar persona» y «Reenviar».

### A4. Lo cargado mal no se puede corregir
- **Gastos:** el detalle solo tiene «Volver» y «Subir comprobante», aunque el período esté abierto. En «Revisar y liquidar» hay un enlace **«Corregir gastos»** que lleva a una lista donde no se puede editar nada.
- **Proveedores:** `editarProveedor` existe en aplicación pero ninguna pantalla lo usa. Un CUIT mal tipeado queda para siempre.

### A5. Alta de consorcio sin validar el CUIT ni avisar duplicados
Se creó un consorcio con **CUIT `12`**, mientras que Proveedores sí exige 11 dígitos. También se creó un **tercer «Mitre 456»** con la misma dirección y la misma administradora, sin ninguna advertencia. En el selector y en la lista de consorcios no hay cómo distinguirlos, y tampoco hay cómo dar de baja uno creado por error.

### A6. El superadministrador no puede dar de alta una administradora
`altaAdministradora` no tiene pantalla. El lateral del superadmin solo tiene Consorcios y Bandeja, y el alta de consorcio exige elegir una administradora existente.

### A7. Sin pasarela de pagos, el vecino no sabe cómo pagar
En el detalle de la expensa no aparece ningún botón ni otra indicación (alias, CBU, «pagá en la administración»). Hoy depende de que la administradora tenga credenciales de Mercado Pago. Haría falta un texto de medios de pago configurable por consorcio.

### A8. Pago manual: una fecha futura da un mensaje engañoso
Con fecha **01/05/2027** el mensaje es «La expensa venció en firme: se podrá pagar con la próxima liquidación…». El problema real es la fecha, que debería rechazarse con «La fecha del pago no puede ser posterior a hoy». Además, al elegir la unidad **el formulario no muestra cuánto debe**, y el administrador tiene que ir a buscarlo a otra pantalla.

### A9. El calendario del historial de reservas se rompe en el teléfono
`/reservas/historial` a 390 px: la tabla `.calendario` mide 720 px (desborde horizontal de la página), las celdas tienen tamaños dispares, los días 2, 9 y 16 aparecen estirados y falta el encabezado de los días de la semana. Es la única pantalla con desborde de todas las que medí.

### A10. Ingreso: errores de formato con el mensaje de credenciales
El formulario tiene `noValidate`. Con los campos vacíos o con `noesuncorreo`, la respuesta es «El correo o la contraseña no coinciden.». Debería decir «Escribí tu correo» o «Ese correo no tiene un formato válido», y además conservar el correo (ver A1).

---

## Medios

1. **La expensa vencida parece una deuda aparte.** En la lista, 08/2026 figura «Vencida $267.500,94» y 11/2026 «Pendiente $422.850,96», que ya la incluye. El detalle de 08 encabeza con **«TOTAL A PAGAR $267.500,94»** en grande; la aclaración («se paga con la última expensa») va en gris y chico. Un vecino puede sumar las dos. Mejor: «Incluida en la expensa 11/2026 → ver».
2. **La expensa en pantalla no muestra de qué se compone** (cuota del mes, deuda anterior, interés, ajuste): solo el total y los vencimientos. El desglose vive en el PDF, y si el PDF falta no hay forma de verlo.
3. **Vencimientos guardados que violan su propia regla.** Mitre 456 tiene mora 2 % y recargo 10 %. La pantalla abre sin aviso, y al tocar solo un día no deja guardar: «La tasa de mora mensual (2.0000 %) debe ser mayor…». El error de campo debería aparecer al cargar.
4. **Porcentajes sin formato local:** `5.0000`, `+10.0000 %`, `2.0000 %` en Vencimientos, en el detalle de la expensa y en los mensajes. Deberían ser `5 %` / `5,5 %`.
5. **Reservar con deuda:** el botón está activo y el bloqueo («La unidad 3B tiene deuda vencida (6 períodos)…») recién se informa después de completar todo el formulario, que además se borra. Debería avisarse arriba, o deshabilitar el botón con el motivo.
6. **Consulta documental engañosa:** si el único documento falló al indexarse, el vecino recibe «No lo encontramos en la documentación cargada». Debería decir que la documentación todavía no está disponible para consultas. El admin sí ve «No se pudo procesar» con «Reintentar», que está bien.
7. **Invitación:** el botón dice «Guardar y entrar» pero manda al ingreso, así que hay que volver a escribir la clave. Un enlace ya usado muestra el formulario y avisa que venció recién al enviarlo; debería avisarlo al abrir.
8. **Accesibilidad, Nuevo gasto:** *Período*, *Rubro* y *Clasificación* no tienen nombre accesible (la etiqueta no está asociada al control). Un lector de pantalla lee «cuadro de texto» sin nombre.
9. **Error de hidratación de React (#418) intermitente** en `/bandeja` (1 de cada 3 cargas). Probablemente una fecha o un texto relativo que difiere entre servidor y cliente.
10. **Reclamos:** en uno **cerrado** sigue «Cambiar asignación»; en uno recién **asignado** aparece «Reabrir», que se lee como si estuviera cerrado.
11. **Nuevo gasto propone un período liquidado** (11/2026), y el primer intento falla con «El período está liquidado…». Debería proponer el período abierto o el mes siguiente al último liquidado.
12. **Indicadores dice «Sin períodos liquidados todavía, o sin actualizar»** aunque haya 7 liquidados: hay que tocar «Actualizar ahora». Si las vistas están viejas, conviene decirlo así y ofrecer el botón ahí mismo.
13. **Pagos → «Último movimiento» con fecha futura** (28/12/2026): es el vencimiento de la última expensa, no un movimiento.
14. **Teléfono:** el botón flotante del asistente tapa importes y textos al final de las listas y tarjetas (por ejemplo, Gastos, o el aviso del detalle de la expensa). Falta un margen inferior que lo contemple.
15. **Teléfono, administrador:** la barra inferior es la del vecino (Resumen, Expensas, Reclamos, Reservas); Gastos y Pagos, que son su día a día, quedan dentro de ☰.
16. **Nuevo reclamo:** «Unidad» arranca en «Área común» aunque el vecino tenga una sola unidad.
17. **El vecino no recibe aviso cuando se le registra un pago manual**. Sí recibe los de reservas y liquidaciones.

## Bajos / textos

- «4 reclamos abiertos, **1 críticos**»; «**critica**» sin tilde en la bandeja.
- Rubros sin tildes (*Energia electrica*, *Honorarios de administracion*, *Renovacion…*) y un rubro **«Rubro ordinario de prueba»** visible para todos.
- Datos demo con texto interno: «Reclamo del juego ficticio de § 13.4», el reglamento de «Torre Pellegrini» cargado en Mitre 456, el gasto «prueba pago en línea».
- Copia para el consorcista que no aplica: en `/consorcios` lee «Los edificios que **administrás**»; en `/unidades` dice «Tu rol no permite ver **el consorcio**».
- Padrón: el texto «unidad por unidad la suma nunca daría 100 y cada alta sería un rechazo» es una explicación técnica; alcanza con «Cargá todas las unidades juntas: los coeficientes tienen que sumar 100 %». «Cargar 0 unidades» está habilitado.
- El CUIT del proveedor no valida el dígito verificador (`30-70011111-2` se aceptó; los de la semilla tampoco son válidos).
- Placeholder de importe `0.00` con punto, cuando el resto de la app usa coma.
- Los diálogos (Nuevo reclamo, Reservar) tardan alrededor de 1 s en mostrar el formulario, sin indicador.
- Asistente: la tarjeta de reserva no muestra la cantidad de personas, y la confirmación dice un genérico «Listo, la acción se realizó.».
- Los usuarios demo tienen una clave de 8 caracteres, aunque la política exige 12: la semilla la saltea.

---

## Lo que está bien

- **Aislamiento (RN-12 / RT-04): sin fugas.** `operador1` no ve Mitre 456 ni por URL directa (resumen, gastos, reclamo, expensa, liquidación), ni con la galleta `flay_consorcio` manipulada, ni por la exportación CSV (404). El mensaje no revela si el recurso existe.
- **Permisos por rol coherentes.** El consorcista recibe «Tu rol no permite…» en las 10 rutas de administración y 403 al exportar. El consejo tiene lectura más «Nueva asamblea», sin Vencimientos ni Usuarios. El lateral oculta lo que no corresponde.
- **Reservas:** todas las reglas con mensajes precisos: orden de horas, capacidad («Quincho admite hasta 25 personas»), anticipación de 48 h, duración máxima de 8 h, solapamiento y deuda.
- **Reclamos:** flujo completo (asignar → en curso → resuelto → cerrado) con comentario en cada paso e historial legible. El HTML que escribe el vecino (`<script>`) se muestra escapado.
- **Liquidación:** la pantalla de revisión antes de confirmar, el reparto por unidad con columnas de deuda anterior, interés y **ajuste de redondeo visible**, y la emisión con aviso al vecino.
- **Importes:** `12.500,50` (formato argentino) se interpreta bien; los montos se muestran como `$ 12.500,50` en todos lados.
- **Vencimientos:** validación en vivo por campo, una regla cruzada al guardar y **conserva los valores** ante un error. Es el modelo a seguir para el resto de los formularios (A1).
- **Padrón:** el generador reparte y suma 100 % exacto, y el alta de consorcio lleva directo a cargarlo.
- **Asistente:** respondió bien la deuda (`$1.562,56`, vence el 10/01/2027) y la reserva pasó por una tarjeta **Confirmar / Descartar** antes de ejecutarse (RN-14).
- **Teléfono:** sin desborde horizontal en 12 de 13 pantallas, las listas se convierten en tarjetas y hay barra inferior.
- **Sesión:** después de «Salir», el botón atrás y recargar llevan al ingreso sin mostrar datos en caché. Después de ingresar se vuelve a la ruta pedida.
- **Invitación:** la política de clave es clara (12 caracteres, que coincidan) y el enlace no se puede reusar.
- **Notificaciones:** claras, con consorcio y tiempo relativo, y «Marcar todo como leído».
- **Exportación** a CSV con `;`, que abre bien en Excel con configuración regional argentina.

---

## Prioridad sugerida

1. **C1** (una línea en `aVisible`) y **C3** (calificar `v.consorcio_id`): son chicos y desbloquean dos pantallas.
2. **C4**: mostrar «Mis expensas» también al consejo.
3. **C2 + A3**: pantalla de ocupantes por unidad y gestión de accesos (asignar unidad, cambiar rol, revocar). Sin esto no se puede operar un consorcio real sin tocar la base.
4. **C5**: recuperación de contraseña por correo y «desbloquear / reenviar acceso» para el admin.
5. **A1**: conservar los valores en todos los formularios con el patrón de Vencimientos.
6. **A2, A5, A8, A10**: validaciones de entrada (formato de correo, CUIT, fecha futura, campos vacíos).
7. **A4**: editar o anular gastos con el período abierto, y editar proveedores.
8. El resto según el tiempo disponible: el calendario en el teléfono (A9) y la lectura de las expensas vencidas (M1–M2) son los que más le ahorran a un vecino.

---

## Lo que quedó en la base local

Todo en `flay-db` (Docker, puerto 5434); nada en Neon.

- Superadmin `plataforma@flay.demo` / `flay1234flay1234`.
- Mitre 456: gasto de $ 12.500,50 y **liquidación 12/2026 emitida**; pago manual de $ 422.850,96 a la 1A; reservas del quincho de la 1A el 20/11 y el 27/11; el reclamo «Luz del palier quemada» cerrado; un reclamo nuevo con `<script>` en el título; los proveedores «Proveedor Prueba» y «Prov Sin Guiones»; los invitados `ana@` y `ana.prueba@flay.demo` (clave `flay1234flay`, con bloqueo de 15 min por la prueba).
- Consorcios nuevos: «Edificio Prueba» (CUIT `12`), un tercer «Mitre 456» y «Edificio Usabilidad» (9 unidades).
- Las claves de los PDF que vacié temporalmente para seguir probando (C1) **se restauraron**.

Si se quiere volver a la semilla limpia: seguir el procedimiento de la nota 1 de `CLAUDE.md` (`migrate reset` + extensiones + `db:deploy` + `semilla`).
