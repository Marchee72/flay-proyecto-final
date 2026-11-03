# Research: Asambleas de consorcio

Las decisiones de producto se tomaron con el usuario en el brainstorming
(`docs/superpowers/specs/2026-11-03-asambleas-design.md`). Acá quedan las técnicas que no se
deducen de la spec.

## R-01 Vista en vivo

- **Decision**: `EnVivo` (`src/app/(panel)/en-vivo.tsx`) refresca cada 3 s, montado solo mientras
  la asamblea está `en_curso`. Cada refresco relee el estado completo con una consulta que entra
  por `Asamblea` e incluye puntos, opciones, padrón y votos.
- **Rationale**:
  - Cumple SC-001 (≤ 5 s) sin infraestructura nueva.
  - Cada refresco también drena la cola en el `after()` del panel, así salen los avisos.
  - Con ~100 unidades, la consulta trae unos cientos de filas.
- **Alternatives considered**:
  - SSE con el bus de `eventos-notificaciones.ts`: el bus vive en memoria de un proceso y en
    Vercel no reparte eventos entre instancias, así que un voto podría no llegar.
  - WebSockets o un proveedor de tiempo real: dependencia nueva para un caso que el sondeo cubre.

## R-02 Inmutabilidad en la base

- **Decision**:
  - `UNIQUE (punto_id, unidad_id)` en `VotoAsamblea`: un voto por unidad y por punto, y el segundo
    se traduce a «la unidad ya votó».
  - El disparador `fn_voto_inmutable` rechaza **todo `UPDATE`** de `VotoAsamblea`, y rechaza el
    `INSERT` si el punto no está `abierto` o la asamblea no está `en_curso`.
  - El disparador `fn_asamblea_cerrada` rechaza `INSERT`/`UPDATE` sobre `PuntoAsamblea`,
    `OpcionPunto` y `UnidadEnAsamblea` cuando la asamblea ya no está en `borrador` o `en_curso`.
    Hay dos excepciones:
    - el resumen del punto (`resumen`), que se edita mientras el acta está `en_redaccion`;
    - el estado y el resultado del punto, que se escriben en el `UPDATE` que lo cierra.
  - El orden del día también: con la asamblea `convocada`, se rechaza alta, baja o cambio de
    título, modalidad, mayoría u opciones de un punto (FR-004).
  - La transición de estado de `Asamblea` se valida en el disparador contra la máquina de estados:
    no se vuelve atrás.
- **Rationale**: Principio V e «integridad en la base, no solo en el código». Un voto modificado
  por cualquier ruta, incluido un error futuro, lo frena la base.
- **Excepción, `DELETE`**: no se revoca a `flay_app`, porque `limpiar()` en
  `pruebas/integracion/ayudas.ts` lo necesita y corre con el mismo usuario. La aplicación no expone
  ningún borrado salvo el de una asamblea en `borrador`, y `fn_auditar` registra cualquier `DELETE`
  en la bitácora, que sí es inviolable. Límite: un borrado deliberado desde la cuenta de la
  aplicación queda auditado, pero no impedido. Para impedirlo, la limpieza de pruebas tendría que
  correr como `flay_owner` y el `DELETE` revocarse.
- **Alternatives considered**: `REVOKE UPDATE, DELETE`, que rompe la limpieza de pruebas, igual
  que con la bitácora (nota 2 de `CLAUDE.md`); validación solo en la aplicación, que viola la
  constitución.

## R-03 Padrón congelado al abrir

- **Decision**: al abrir la asamblea, una sola sentencia inserta en `UnidadEnAsamblea` una fila por
  unidad vigente (`bajaDesde: null`). Cada fila guarda:
  - `coeficiente`, copiado;
  - `sinVoto`, calculado con `saldoImpagoPorUnidad(hoy).vencidos > umbral`;
  - `presente = false`.

  La asistencia marca `presente` y quién representa. Quórum, base y resultados se calculan **solo**
  desde esta tabla.
- **Rationale**:
  - La base «totalidad» necesita también a los ausentes con su coeficiente.
  - Un cambio de padrón o un pago durante la reunión no mueve un resultado ya calculado: es RN-02
    aplicado a asambleas.
  - El acta se puede reconstruir siempre.
- **Alternatives considered**: tabla de asistencia solo con presentes, más lectura del padrón vivo
  al calcular. Un coeficiente editado después de la reunión cambiaría el acta.

## R-04 Mora sin voto

- **Decision**: se reutiliza `saldoImpagoPorUnidad(hoy)` de `src/aplicacion/pagos/estado-de-cuenta.ts`.
  Su campo `vencidos` es la cantidad de liquidaciones vencidas e impagas, calculada con
  `saldosDeUnidad`. La unidad queda sin voto si `vencidos > umbralExpensasSinVoto` (2 por
  defecto), y se evalúa una vez, al abrir.
- **Rationale**: es el saldo por período des-arrastrado que ya usa la morosidad; recalcularlo con
  `totalUnidad − imputado` sería el defecto que registra la memoria del proyecto.
- **Alternatives considered**: evaluar en cada voto. Un pago a mitad de reunión cambiaría quién
  vota entre punto y punto.

## R-05 Cómputo de resultados

- **Decision**: funciones puras en `src/dominio/asambleas/resultado.ts` que reciben el padrón
  congelado, los votos, la modalidad, la mayoría requerida y la regla.
  - **Binario**: la base es la de los presentes con voto o la de todas las unidades sin
    `sinVoto`. Se aprueba si los positivos superan la base en unidades **y** en coeficientes, con
    estos umbrales:
    - absoluta: `> 1/2`;
    - dos tercios: `≥ 2/3`;
    - unanimidad: positivos = base.

    La abstención no suma. Las comparaciones se hacen en `Decimal`, multiplicando para no dividir
    (`positivos × 3 ≥ base × 2`), así no se redondea.
  - **Opción múltiple**: pluralidad por unidades y por coeficientes. Si las dos dan distinta opción
    ganadora, o hay empate en el primer lugar, no hay decisión.
  - El resultado se persiste al cerrar el punto, con conteos y estado `aprobado`, `rechazado` o
    `sin_decision`, y con `provisorio` cuando corresponde (R-06).
- **Rationale**: TDD obligatorio (constitución), y la función es la misma para la pantalla en vivo y
  para el acta.

## R-06 Decisión provisoria

- **Decision**: con la regla `totalidad`, un punto binario que se aprueba sobre la base de los
  presentes pero no sobre la del total queda `provisorio = true`, con
  `vencePlazoOposicion = cerradoEn + 15 días corridos`. Es un instante determinístico: el aviso
  nace en la misma transacción, aunque el correo salga después por la cola.

  El estado vigente (`firme`, `provisoria` o `caida`) es **derivado**: lo calcula
  `src/dominio/asambleas/provisoria.ts` a partir de la fecha, los votos y las oposiciones.
  - El silencio cuenta como conformidad: cada ausente con voto que no se opuso suma como positivo.
  - Vencido el plazo, si `positivos + ausentesSinOposición` alcanza el umbral sobre la base total,
    en unidades **y** en coeficientes, queda firme; si no, cae.
  - Antes del vencimiento sigue provisoria. Si las oposiciones ya hacen imposible el umbral, puede
    mostrarse «caerá» como dato, pero el estado formal se fija al vencer.
- **Rationale**: no hace falta una tarea programada para «firmar» decisiones, y el estado se lee
  igual en pantalla y en el acta.
- **Alternatives considered**: guardar el estado y actualizarlo con un cron, que agrega un paso que
  puede no correr.

## R-07 Avisos y correo a personas sin cuenta

- **Decision**:
  - Los usuarios reciben el aviso por `notificar` (`src/aplicacion/comunicacion/notificar.ts`), con
    tipos nuevos en `TipoNotificacion`: `asamblea_convocada`, `asamblea_cancelada`,
    `poder_otorgado`, `poder_revocado`, `decision_provisoria`, `acta_a_firmar` y `acta_firmada`.
  - Los propietarios con `Persona.correo` y sin `Usuario` reciben el mismo texto por un tipo de
    trabajo nuevo, `correo_directo`, con carga `{ destino, titulo, cuerpo }`, despachado con
    `Notificador.enviarNotificacion`.
  - Los que no tienen ni cuenta ni correo se listan en la pantalla al convocar (FR-009).
- **Rationale**: el puerto `Notificador` ya acepta un `Aviso` con destino libre. `Notificacion`
  exige `usuarioId`, y hacerlo nulo rompería la bandeja.
- **Alternatives considered**: crear `Usuario` invitados automáticamente, que da de alta cuentas
  que nadie pidió (RNF-13).

## R-08 Calendario

- **Decision**:
  - Enlace de plantilla de Google Calendar
    (`https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=AAAAMMDDTHHMMSSZ/…&location=…&details=…`),
    con duración por defecto de 2 h. Va en la pantalla y en el texto del aviso, porque viaja todo
    en la URL y no necesita sesión.
  - `.ics` (RFC 5545, `VEVENT` con `UID = asamblea.id@flay`) servido por
    `/api/asambleas/[asamblea]/ics` con sesión y autorización.
  - Los dos los arma `src/dominio/asambleas/calendario.ts`, en texto puro.
- **Rationale**: es lo que el usuario pidió (Google Calendar), sin OAuth ni dependencia. El `.ics`
  cubre Apple y Outlook.
- **Alternatives considered**: la API de Google Calendar con OAuth, que exige verificar la app en
  Google y guardar tokens por usuario, demasiado para «agregar el evento». Una librería `ics`:
  quince líneas de texto no justifican una dependencia.

## R-09 Firma electrónica y huella

- **Decision**:
  - **Enviar a firmar**: se genera el PDF del contenido (`acta.tsx`), se guarda en `ALMACEN` y se
    registra su SHA-256 (`node:crypto`) en `ActaAsamblea.hashContenido`. Desde ahí el contenido no
    cambia (R-02).
  - **Firmar**: el firmante designado **vuelve a ingresar su contraseña**, que se verifica con
    `DERIVADOR` (Argon2id). Se inserta una `FirmaActa` con fecha y hora de la base y el
    `hashContenido` que vio.
  - **Última firma**: se genera el PDF final, que es el contenido más una hoja de firmas con
    nombre, rol, fecha y hora y huella del contenido. Se guarda, y en la misma transacción se crea
    el `DocumentoConsorcio` (`tipo: acta`, `visibleConsorcistas: true`, `hashSha256` del final) con
    su trabajo `indexar_documento`, como hace `cargarDocumento`.
  - Los PDF se generan **sincrónicos** en la acción: un acta tiene pocas páginas, no 96 como las
    expensas.
- **Rationale**:
  - Pedir la contraseña otra vez es lo que distingue «firmar» de «estar logueado» y fortalece la
    prueba de la firma electrónica (Ley 25.506, art. 5).
  - La huella hace detectable cualquier alteración (SC-007). Para que se pueda comprobar,
    `verificarHuella` recalcula el SHA-256 de los PDF guardados y la pantalla del acta muestra la
    huella y el resultado («íntegra» o «alterada»).
  - Si un firmante pendiente pierde el usuario, se lo **reemplaza** en el mismo rol y las firmas
    ya hechas se mantienen, porque firmaron el mismo `hashContenido`.
- **Alternatives considered**: firma digital con certificado (descartada por el usuario); firmar
  solo con la sesión activa (evidencia más débil); generar el PDF por la cola (innecesario para un
  documento).

## R-10 Recordatorio de firmas a los 10 días

- **Decision**: una tarea diaria nueva, `/api/tareas/asambleas`, protegida con `CRON_SECRET` igual
  que `refrescar-vistas`, entra en `vercel.json`. Busca actas `a_firmar` con más de 10 días y avisa
  una sola vez (`recordatorioEnviadoEn`).
  - **Cómo cruza consorcios sin romper el Principio I**: la tarea no tiene usuario ni contexto. Un
    primer paso con `prismaBase`, como hace `drenar`, lista solo `{ id, consorcioId }` filtrando
    por estado y fecha, **sin** `consorcioId` en el `where`. Después, cada acta se procesa dentro
    de `enConsorcio(consorcioId, …)` con el cliente aislado: la lectura de firmantes, `notificar` y
    la marca del recordatorio. Ningún dato de negocio se lee fuera del aislamiento.
  - Si `pruebas/dominio/filtro-unico.spec.ts` detecta el `consorcioId` del `select`, el archivo
    entra a `PERMITIDOS` con su razón: «la tarea programada enumera actas vencidas de todos los
    consorcios para entrar a cada uno por `enConsorcio`; no lee datos de negocio fuera de él».
    También pueden necesitar entrada `configuracion.ts` y `convocar.ts`, que leen y escriben las
    reglas de `Consorcio` por su propio identificador, igual que `regla-vencimientos.ts`.
- **Rationale**: es un aviso que tiene que salir aunque nadie navegue, así que el drenaje
  oportunista no alcanza. Si el plan de Vercel no admite un segundo cron, se encadena dentro de la
  tarea diaria existente.

## R-11 Convocatoria y quórum

- **Decision**: hay dos pasos, como en la sala.
  1. **Abrir** (`convocada → en_curso`), desde la hora de la primera convocatoria. Congela el padrón
     (R-03) y empieza la acreditación: cada presente marca «estoy presente» por sus unidades, y
     quien dirige marca a los demás.
  2. **Constituir**: quien dirige declara la asamblea constituida. `quorum.ts` decide con el reloj:
     - entre la primera convocatoria y la segunda (`fechaHora + 30 min`, derivada y sin columna),
       solo si coeficientes presentes `> 50 %`;
     - desde la segunda, siempre que haya al menos una unidad presente con voto.

     Se guardan `constituidaEn` y `convocatoriaQueRige`. Los puntos solo se abren con la asamblea
     constituida. La acreditación sigue abierta después, para quien llega tarde.
- **Rationale**: art. 20 del reglamento. El quórum se mide sobre la foto del padrón, y lo decide el
  reloj, no quien dirige.

## R-12 Poderes y tope

- **Decision**: `Poder` con `UNIQUE (asamblea_id, unidad_id) WHERE revocado_en IS NULL`. El tope
  por apoderado se valida en la transacción de otorgar, después de un
  `pg_advisory_xact_lock(hashtext(asambleaId || apoderadoId))`, para que dos otorgamientos
  simultáneos no lo superen. Se revoca hasta que empieza la acreditación. Quien otorga tiene que
  ser propietario vigente (`ocupaUnidad`); el apoderado, un usuario con habilitación vigente en el
  consorcio. Al acreditar por poder se vuelve a verificar con `ocupaUnidad(otorgante, unidad, hoy)`
  que el otorgante siga siendo propietario: un poder de quien ya no lo es no vale.
- **Rationale**: no hay restricción declarativa que cuente filas por apoderado, y el candado de
  transacción es lo más chico que evita la carrera.

## R-13 Configuración por consorcio

- **Decision**: cuatro columnas nuevas en `Consorcio`, con valores por defecto en la base:
  `reglaMayoriaAsamblea` (`presentes` | `totalidad`), `anticipacionConvocatoriaDias` (15),
  `topeUnidadesPorApoderado` (3) y `umbralExpensasSinVoto` (2). Al convocar, se **copian** a la
  `Asamblea` (FR-035).
- **Rationale**: son cuatro escalares 1:1 con el consorcio, y una tabla aparte no aporta nada.
  `Consorcio` ya lleva la configuración de mora y vencimiento.

## R-14 Autorización

- **Decision**:
  - Crear y convocar: `rolesPermitidos: ['administrador', 'consejo']`.
  - Dirigir, cargar votos manuales y registrar poderes u oposiciones en papel: consejo, o
    administrador **solo si `administracionInvitada`**, que se comprueba en el caso de uso después
    de `conAutorizacion`.
  - Ver: cualquier habilitado.
  - Votar: quien está registrado como representante presente de la unidad.
  - Firmar: el usuario designado como firmante.
  - Configurar: `administrador`.
- **Rationale**: `conAutorizacion` es el único que autoriza por rol; la condición de invitación es
  propia de la asamblea.

## R-15 Fuera de este plan

- Herramientas del asistente conversacional (RF-27) sobre asambleas: se pueden sumar después.
- Reprogramar: es cancelar y convocar de nuevo (spec, casos borde).
