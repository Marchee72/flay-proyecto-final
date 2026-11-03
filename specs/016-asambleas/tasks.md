---
description: "Task list — Asambleas de consorcio"
---

# Tasks: Asambleas de consorcio

**Input**: Design documents from `specs/016-asambleas/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/contratos.md,
quickstart.md

**Tests**: incluidos.

- El cómputo de quórum, mayorías y decisión provisoria decide sobre coeficientes, así que lleva
  TDD **obligatorio** (Constitución, Principio II).
- La inmutabilidad y el aislamiento se prueban en integración (Principios I y V).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1..US6 según `spec.md`

---

## Phase 1: Setup

- [ ] T001 Confirmar que la base local está limpia y migrada (`npm run db:deploy`, `npm run db:drift`) sobre la rama `feat/asambleas`. Si `npm run semilla` corrió antes, seguir la nota 1 de `CLAUDE.md` antes de correr integración.

---

## Phase 2: Foundational (bloquea todas las historias)

**⚠️ CRITICAL**: ninguna historia empieza hasta terminar esta fase.

- [ ] T002 Agregar a `prisma/schema.prisma` todo lo de `data-model.md`. Las tablas nuevas llevan todas `consorcioId` y relaciones, y usan `Decimal(11,8)` para `UnidadEnAsamblea.coeficiente`.
  - **Modelos**: `Asamblea`, `PuntoAsamblea`, `OpcionPunto`, `Poder`, `UnidadEnAsamblea`, `VotoAsamblea`, `OposicionDecision`, `ActaAsamblea` y `FirmanteActa`.
  - **Enums**: `TipoAsamblea`, `EstadoAsamblea` (`borrador`, `convocada`, `en_curso`, `finalizada`, `acta_firmada`, `cancelada`), `ConvocatoriaAsamblea`, `ModalidadPunto` (`binaria`, `opcion_multiple`), `MayoriaRequerida` (`absoluta`, `dos_tercios`, `unanimidad`), `EstadoPunto` (`pendiente`, `abierto`, `cerrado`), `ResultadoPunto` (`aprobado`, `rechazado`, `sin_decision`), `SentidoVoto` (`positivo`, `negativo`, `abstencion`), `OrigenVoto` (`propio`, `carga_manual`), `OrigenRegistro` (`en_linea`, `papel`), `Representacion` (`propietario`, `apoderado`), `EstadoActa` (`en_redaccion`, `a_firmar`, `firmada`), `RolFirmante` (`presidente`, `secretario`, `propietario`) y `ReglaMayoria` (`presentes`, `totalidad`).
  - **Columnas nuevas en `Consorcio`**: `reglaMayoriaAsamblea` (default `presentes`), `anticipacionConvocatoriaDias` (Int, 1–60, default 15), `topeUnidadesPorApoderado` (Int, 1–10, default 3) y `umbralExpensasSinVoto` (Int, 0–24, default 2).
  - **Valores nuevos**: `asamblea_convocada`, `asamblea_cancelada`, `poder_otorgado`, `decision_provisoria`, `acta_a_firmar` y `acta_firmada` en `TipoNotificacion`, y `correo_directo` en `TipoTrabajo`.
- [ ] T003 Crear `prisma/migrations/<timestamp>_asambleas/migration.sql`. Según `data-model.md` y research R-02, tiene que incluir:
  - **Únicos**: `UNIQUE (asamblea_id, orden)` en puntos, `UNIQUE (punto_id, orden)` en opciones y `UNIQUE (punto_id, unidad_id)` en votos y en oposiciones.
  - `UNIQUE (asamblea_id, unidad_id)` en `UnidadEnAsamblea`, y `UNIQUE (asamblea_id)` en `ActaAsamblea`.
  - **Únicos parciales**: un punto `abierto` por asamblea, y `Poder (asamblea_id, unidad_id) WHERE revocado_en IS NULL`.
  - **CHECK**: `mayoria` obligatoria si `binaria` y nula si `opcion_multiple`; voto con exactamente uno de `sentido` u `opcion_id`; rangos de las columnas de `Consorcio`.
  - **`fn_voto_inmutable`**: rechaza todo `UPDATE`, y el `INSERT` si el punto no está `abierto`, la asamblea no está `en_curso` o la unidad no está `presente` o está `sinVoto`.
  - **`fn_asamblea_cerrada`**: el orden del día queda fijo desde `convocada`; nada cambia desde `finalizada`, salvo `resumen` con el acta `en_redaccion`; la presencia es solo `false → true` y el representante, una sola vez.
  - **Más disparadores**: la transición de estados de `Asamblea` sin retroceso, las oposiciones dentro del plazo y solo de ausentes con voto, la firma única con `hashFirmado = hashContenido`, y nada editable desde `a_firmar` salvo las firmas.
  - **Auditoría**: `fn_auditar` sobre las nueve tablas. Los mensajes de `RAISE EXCEPTION` van en castellano, para el usuario.

  Después, correr `npx prisma generate`, `npm run db:deploy` y `npm run db:drift`.
- [ ] T004 Sumar las tablas nuevas a `limpiar()` en `pruebas/integracion/ayudas.ts`, en orden de FK y antes de `documentoConsorcio`, `unidad`, `persona` y `consorcio`: `firmanteActa`, `actaAsamblea`, `oposicionDecision`, `votoAsamblea`, `unidadEnAsamblea`, `poder`, `opcionPunto`, `puntoAsamblea` y `asamblea`.
- [ ] T005 [P] Tests de dominio (TDD: escribirlos y verlos FALLAR primero) en `pruebas/dominio/asambleas/estado.spec.ts`: las transiciones válidas e inválidas de asamblea (incluido `en_curso → cancelada` solo sin constituir), de punto y de acta.
- [ ] T006 Implementar `src/dominio/asambleas/estado.ts` (`transicionAsamblea`, `transicionPunto`, `transicionActa`, y el error `TransicionInvalida`) hasta que T005 pase. Sin infraestructura (Principio III).
- [ ] T007 [P] Crear los errores de aplicación de `contracts/contratos.md` en `src/aplicacion/asambleas/errores.ts`, como subclases de `ErrorDeAplicacion` con mensajes RNF-10 y código `RF-29`…`RF-33` según corresponda. Agregar el helper que traduce `23505` y `P0001` de la base a esos errores.
- [ ] T008 [P] Agregar la sección «Asambleas» (ícono `Gavel` de lucide, sin `roles`) al bloque «Convivencia» de `src/app/(panel)/secciones.ts`.

**Checkpoint**: esquema migrado con inmutabilidad en la base, y máquinas de estado probadas sin base.

---

## Phase 3: User Story 1 — Convocar una asamblea con su orden del día (Priority: P1) 🎯 MVP

**Goal**: el consejo o la administración crea la asamblea, carga los puntos y la convoca. Llegan los avisos y se puede agregar a Google Calendar o descargar el `.ics`.

**Independent Test**: crear una asamblea con un punto binario y uno de opción múltiple y convocar. Tienen que llegar los avisos (`Notificacion` más `correo_directo` para quien no tiene cuenta), el enlace de calendario tiene que ser correcto y el orden del día tiene que quedar fijo.

- [ ] T009 [P] [US1] Tests de dominio en `pruebas/dominio/asambleas/calendario.spec.ts`:
  - `enlaceGoogleCalendar` arma `dates` en UTC `AAAAMMDDTHHMMSSZ/…` con 2 h de duración y codifica `text`, `location` y `details`;
  - `textoIcs` usa CRLF, escapa `,`, `;` y `\n`, y lleva `UID = <id>@flay`, `DTSTART`/`DTEND` en UTC y `LOCATION`.
- [ ] T010 [P] [US1] Implementar `src/dominio/asambleas/calendario.ts` (`enlaceGoogleCalendar`, `textoIcs` y el tipo `EventoAsamblea`) hasta que T009 pase.
- [ ] T011 [P] [US1] Test de integración en `pruebas/integracion/asambleas-convocatoria.spec.ts`. Cubre:
  - el consejo crea; el consorcista sin consejo no puede;
  - un punto de opción múltiple con menos de 2 opciones se rechaza;
  - `convocar` con una fecha anterior a `hoy + anticipacionConvocatoriaDias` falla con `AnticipacionInsuficiente`, cuyo mensaje trae la fecha mínima;
  - con la asamblea convocada, cambiar un punto falla, también por `$executeRaw`, porque lo frena el disparador;
  - se crea una `Notificacion` `asamblea_convocada` por propietario con usuario, y un `TrabajoPendiente` `correo_directo` por propietario sin usuario con correo;
  - la respuesta lista a los propietarios sin cuenta ni correo;
  - la administración no invitada no recibe aviso, pero ve la asamblea;
  - `cancelar` avisa;
  - un usuario de otro consorcio recibe `NoEncontrado` (SC-005).
- [ ] T012 [US1] Implementar `src/aplicacion/asambleas/convocar.ts`, con roles y errores según `contracts/contratos.md`:
  - `crearAsamblea`, `editarBorrador` y `borrarBorrador`, este último solo en `borrador`;
  - `convocar`: copia las cuatro reglas de `Consorcio` a la `Asamblea`, valida la anticipación en hora de Argentina, avisa con `notificar` a los propietarios vigentes (`usuariosQueOcupan` sobre las unidades con `bajaDesde: null`) y a la administración si está invitada, y encola `correo_directo` con el enlace de Google Calendar en el cuerpo;
  - `cancelar`.

  Todo con `conAutorizacion` y transacción.
- [ ] T013 [US1] Agregar el manejador `correo_directo` en `src/aplicacion/pendientes/manejadores.ts`, con la carga `{ destino, titulo, cuerpo }` validada con Zod y `Notificador.enviarNotificacion` (research R-07). La lista de propietarios sin cuenta, con correo y sin contacto sale de `ocupantesVigentesDe` en `src/infraestructura/repositorios/ocupaciones.ts`.
- [ ] T014 [US1] Implementar `listarAsambleas` y `verAsamblea` en `src/aplicacion/asambleas/ver.ts`. `verAsamblea` es una sola consulta que entra por `Asamblea` e incluye puntos, opciones, padrón, votos y poderes, y devuelve además `misUnidades` y `misPermisos` (`puedeDirigir`, `dirige`, `puedeVotar`). Los coeficientes van como cadena.
- [ ] T015 [US1] Crear la ruta `src/app/api/asambleas/[asamblea]/ics/route.ts`: exige sesión, autoriza con `verAsamblea` y devuelve `text/calendar; charset=utf-8` con `Content-Disposition: attachment; filename="asamblea.ics"`.
- [ ] T016 [US1] Pantallas:
  - `src/app/(panel)/consorcios/[consorcio]/asambleas/page.tsx`: lista con estado y fecha, y «Nueva asamblea» para consejo y administración;
  - `asambleas/nueva/page.tsx` con un formulario cliente: datos, invitación a la administración (solo si organiza el consejo) y puntos dinámicos con modalidad, mayoría y opciones;
  - `asambleas/[asamblea]/page.tsx` para los estados `borrador` (editar, convocar, borrar) y `convocada` (datos, orden del día, «Agregar a Google Calendar», «Descargar .ics» y cancelar).

  Las server actions van en `asambleas/acciones.ts` y `asambleas/[asamblea]/acciones.ts`, y redirigen con `?hecho=`/`?error=`; las claves nuevas se suman a `HECHO` en `src/app/avisos.tsx`. Tiene que verse bien en teléfono (RNF-01).

**Checkpoint**: se puede convocar de punta a punta, y la convocatoria llega por los dos canales.

---

## Phase 4: User Story 2 — Conducir la reunión y votar en vivo (Priority: P1)

**Goal**: abrir, acreditar, constituir con quórum, votar desde el teléfono y por carga manual, ver todo en vivo, cerrar puntos con resultado y finalizar.

**Independent Test**: con unidades de coeficientes distintos, votar un punto binario desde dos sesiones más un voto manual, cerrarlo y comprobar el resultado exacto. Ningún voto se puede modificar.

- [ ] T017 [P] [US2] Tests de dominio en `pruebas/dominio/asambleas/quorum.spec.ts`:
  - `puedeConstituir` da `antes_de_hora`;
  - con exactamente 50,00000000 % en primera convocatoria da `sin_quorum`, y con 50,00000001 % da `primera`;
  - desde `fechaHora + 30 min` da `segunda` aunque haya 0 %;
  - `segundaConvocatoria` suma 30 minutos.
- [ ] T018 [P] [US2] Tests de dominio en `pruebas/dominio/asambleas/resultado.spec.ts`, con los casos de `quickstart.md` § 1:
  - el caso testigo 40/30/20/10;
  - los tres umbrales con las dos bases;
  - la abstención no suma;
  - un presente `sinVoto` queda fuera de la base;
  - un empate exacto se rechaza;
  - en unanimidad, una abstención alcanza para impedir la decisión;
  - con `totalidad`, un punto aprobado sobre los presentes y no sobre el total queda `provisorio: true`, y uno aprobado sobre el total, `provisorio: false`;
  - en opción múltiple, gana la opción que coincide en los dos cómputos; si discrepan o hay empate en el primer lugar, `sin_decision`;
  - `alcanzaUmbral` compara multiplicando, sin dividir.

  Todo en `Decimal`, y ninguna firma acepta `number` para coeficientes.
- [ ] T019 [US2] Implementar `src/dominio/asambleas/quorum.ts` y `src/dominio/asambleas/resultado.ts` (`conteo`, `resultadoBinario`, `resultadoOpcionMultiple`, `alcanzaUmbral`) hasta que T017 y T018 pasen.
- [ ] T020 [P] [US2] Test de integración en `pruebas/integracion/asambleas-votacion.spec.ts`. Cubre:
  - `abrir` antes de hora falla;
  - `abrir` congela el padrón: cambiar un coeficiente después no cambia `UnidadEnAsamblea`;
  - una unidad con `vencidos > umbral` (`saldoImpagoPorUnidad`) queda `sinVoto`;
  - `acreditarme` y `acreditar`: la primera acreditación gana, y la segunda falla con `UnidadYaAcreditada`;
  - `constituir` sin quórum falla;
  - no se puede abrir un punto sin constituir ni dos puntos a la vez;
  - `votar`: el segundo voto de la unidad falla con `UnidadYaVoto`, `cargarVoto` sobre una unidad que ya votó falla, y un `UPDATE` directo del voto falla por el disparador;
  - votar un punto cerrado o con una unidad `sinVoto` falla;
  - `cerrarPunto` persiste `resultado` y `conteo`;
  - `finalizar` con puntos sin cerrar falla; después de finalizar, cualquier cambio de voto, presencia o resultado falla;
  - la administración no invitada no puede `abrir` ni `cargarVoto`;
  - un usuario de otro consorcio recibe `NoEncontrado`;
  - las operaciones quedan en la bitácora, acotadas a la corrida.
- [ ] T021 [US2] Implementar `src/aplicacion/asambleas/conducir.ts`:
  - `abrir`: un `INSERT … SELECT` de `UnidadEnAsamblea` con las unidades vigentes, el coeficiente copiado y `sinVoto` a partir de `saldoImpagoPorUnidad(hoy)`; quien abre pasa a dirigir;
  - `acreditarme`: las unidades donde el usuario es propietario vigente (`unidadesOcupadasPor`) más las que tiene por poder vigente;
  - `acreditar`, `designarAutoridades`, `constituir` (con `puedeConstituir`), `abrirPunto`, `cerrarPunto` (con `resultadoBinario` o `resultadoOpcionMultiple` sobre el padrón congelado, persistiendo `resultado`, `opcionGanadoraId`, `conteo` y `provisorio`), `tomarDireccion` y `finalizar` (que crea `ActaAsamblea` en `en_redaccion`);
  - la regla de quién puede dirigir de research R-14.
- [ ] T022 [US2] Implementar `votar` y `cargarVoto` en `src/aplicacion/asambleas/votar.ts`, con un solo `INSERT` y la traducción de `23505` y `P0001` a los errores de T007.
- [ ] T023 [US2] Pantalla en vivo: el estado `en_curso` de `asambleas/[asamblea]/page.tsx` monta `<EnVivo />` (`src/app/(panel)/en-vivo.tsx`), solo en ese estado. Los componentes van en `asambleas/[asamblea]/en-vivo/`:
  - cabecera con el quórum (coeficiente presente) y la convocatoria que rige;
  - el punto abierto con sus opciones y un botón por cada unidad que represento, deshabilitado si ya votó;
  - el conteo por opción en unidades y en coeficientes, y la lista de votos por unidad;
  - los puntos cerrados con su resultado;
  - el panel de quien dirige: acreditar, autoridades, constituir, abrir y cerrar punto, cargar voto manual, tomar la dirección y finalizar.

  Las acciones van en `asambleas/[asamblea]/acciones.ts`. Teléfono primero (RNF-01) y WCAG AA (RNF-11): botones de voto grandes y con nombre accesible, y el conteo anunciado con `aria-live="polite"`.
- [ ] T024 [US2] Mostrar en `asambleas/[asamblea]/page.tsx`, en los estados `finalizada` y `acta_firmada`, los resultados por punto con su conteo.

**Checkpoint**: una asamblea completa se convoca, se vota en vivo y se finaliza. Es el MVP útil.

---

## Phase 5: User Story 3 — Dar un poder (Priority: P2)

**Goal**: el propietario otorga un poder en Flay a otro usuario del consorcio. Se puede registrar un poder recibido en papel. Hay un tope por apoderado.

**Independent Test**: el propietario le da poder al inquilino; el inquilino se acredita por esa unidad y vota; un cuarto poder al mismo apoderado se rechaza.

- [ ] T025 [P] [US3] Tests de dominio en `pruebas/dominio/asambleas/poderes.spec.ts`: `verificarTope` deja pasar debajo del tope y lanza `TopeDePoderes` al alcanzarlo, con tope 1 y con tope 3.
- [ ] T026 [P] [US3] Implementar `src/dominio/asambleas/poderes.ts` hasta que T025 pase.
- [ ] T027 [P] [US3] Test de integración en `pruebas/integracion/asambleas-poderes.spec.ts`. Cubre:
  - `otorgarPoder` solo lo hace un propietario vigente (`NoEsPropietario`) y solo a un usuario habilitado (`ApoderadoNoHabilitado`);
  - un segundo poder vigente sobre la misma unidad falla (`UnidadYaTienePoder`);
  - el cuarto poder al mismo apoderado falla, también con dos otorgamientos concurrentes (`Promise.all`);
  - `revocarPoder` falla con la asamblea abierta;
  - `registrarPoderEnPapel` deja `origen: papel`;
  - el apoderado se acredita con `acreditarme` y vota;
  - un inquilino sin poder ve la asamblea, pero no vota;
  - se avisa a los dos (`poder_otorgado`).
- [ ] T028 [US3] Implementar `src/aplicacion/asambleas/poderes.ts` (`otorgarPoder`, `registrarPoderEnPapel`, `revocarPoder`), con `pg_advisory_xact_lock(hashtext(asambleaId || apoderadoId))` dentro de la transacción antes de contar (research R-12) y `ocupaUnidad` para el otorgante.
- [ ] T029 [US3] Bloque «Mis poderes» en el estado `convocada` de `asambleas/[asamblea]/page.tsx`: otorgar, eligiendo unidad y apoderado entre los habilitados del consorcio, y revocar. Quien puede dirigir ve además la carga de un poder en papel. Las acciones van en `acciones.ts`.

**Checkpoint**: los poderes funcionan, y la acreditación de US2 ya los toma en cuenta.

---

## Phase 6: User Story 4 — Redactar y firmar el acta (Priority: P2)

**Goal**: después de finalizar, se redactan los resúmenes y se designan los firmantes; el acta se envía a firmar con huella, firman los cuatro con su contraseña y queda publicada como `DocumentoConsorcio` de tipo `acta`.

**Independent Test**: finalizar, redactar, firmar los cuatro y comprobar el documento publicado con su hash. El texto no se puede cambiar después de enviarlo a firmar.

- [ ] T030 [US4] Sumar `ActaParaDocumento` y `generarActa(acta): Promise<Buffer>` a `GeneradorDeDocumentos` en `src/dominio/contratos/documentos.ts`, con todos los valores ya formateados como cadena y `hojaDeFirmas?` opcional (`contracts/contratos.md` § Documento PDF).
- [ ] T031 [US4] Crear la plantilla `src/infraestructura/documentos/acta.tsx`, con el patrón de `expensa.tsx` (fuente Noto de `tipografia.ts` y `renderToBuffer`), y conectarla en el generador que exporta la infraestructura. Lleva:
  - cabecera, autoridades y la tabla de asistencia;
  - por cada punto: el resumen, la tabla de votos por unidad, el conteo, el resultado y el estado de la decisión;
  - la hoja de firmas, si viene.
- [ ] T032 [P] [US4] Test de integración en `pruebas/integracion/asambleas-acta.spec.ts`. Cubre:
  - `redactarResumen` solo con el acta `en_redaccion`;
  - `designarFirmantes` exige 1 presidente, 1 secretario y 2 propietarios presentes con usuario;
  - `enviarAFirmar` falla con resúmenes o firmantes incompletos; si no, guarda el PDF en `ALMACEN` y `hashContenido` (SHA-256), pasa a `a_firmar` y avisa `acta_a_firmar`;
  - después de enviar a firmar, cambiar un resumen falla por el disparador;
  - `firmar` con una contraseña incorrecta da `ContrasenaIncorrecta`; un no-firmante no puede firmar; firmar dos veces falla;
  - la cuarta firma deja `DocumentoConsorcio` (`tipo: acta`, `visibleConsorcistas: true`, `hashSha256` del PDF final) con su trabajo `indexar_documento`, el acta `firmada`, la asamblea `acta_firmada` y el aviso `acta_firmada`;
  - otro consorcio recibe `NoEncontrado`.

  El generador va con un doble determinístico.
- [ ] T033 [US4] Implementar `src/aplicacion/asambleas/acta.ts`:
  - `redactarResumen` y `designarFirmantes`;
  - `enviarAFirmar`: genera el PDF sincrónico y calcula el SHA-256 con `node:crypto`;
  - `firmar`: verifica con `DERIVADOR`; en la última firma, genera el PDF final con la hoja de firmas y, en la misma transacción, crea el `DocumentoConsorcio` y el trabajo `indexar_documento`, igual que `cargarDocumento` en `src/aplicacion/comunicacion/documentos.ts`.

  Las dependencias (generador, almacén, derivador y reloj) entran por parámetro desde `src/aplicacion/dependencias.ts` (nota 5).
- [ ] T034 [US4] Implementar `recordarFirmasPendientes(ahora)` en `src/aplicacion/asambleas/recordatorios.ts`: toma las actas `a_firmar` con `enviadaAFirmarEn < ahora − 10 días` y `recordatorioEnviadoEn` nulo, avisa a quien dirigió y a los firmantes pendientes, y marca el recordatorio. Corre por consorcio dentro de `enConsorcio`.

  La ruta `src/app/api/tareas/asambleas/route.ts` va protegida con `CRON_SECRET`, como `refrescar-vistas`, y se suma a `vercel.json` como diaria. Agregar un test de integración del recordatorio en `pruebas/integracion/asambleas-acta.spec.ts`.
- [ ] T035 [US4] Pantalla `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/acta/page.tsx`:
  - un resumen por punto;
  - la designación de firmantes, con un selector entre los presentes con usuario;
  - «Enviar a firmar»;
  - «Firmar», con un modal que pide la contraseña;
  - el estado de cada firma;
  - la descarga del PDF por enlace firmado (`src/app/api/objetos/permiso/route.ts`).

  Enlazar la pantalla desde `asambleas/[asamblea]/page.tsx` en `finalizada` y `acta_firmada`.

**Checkpoint**: el acta oficial queda firmada y publicada en Documentación, y la puede consultar el asistente (RF-20).

---

## Phase 7: User Story 5 — Oposición de ausentes con la regla «totalidad» (Priority: P3)

**Goal**: con la regla `totalidad`, un punto aprobado solo por los presentes queda provisorio; los ausentes tienen 15 días para oponerse, y después la decisión queda firme o cae.

**Independent Test**: con la regla `totalidad`, cerrar un punto aprobado solo por los presentes y verificar que queda provisorio y llegan los avisos; con oposiciones suficientes cae, y sin oposiciones queda firme a los 15 días.

- [ ] T036 [P] [US5] Tests de dominio en `pruebas/dominio/asambleas/provisoria.spec.ts`. `estadoDecision` da:
  - `firme` si `provisorio: false`;
  - `provisoria` antes del vencimiento;
  - `firme` al vencer sin oposiciones (los ausentes suman como positivos);
  - `caida` al vencer con oposiciones que impiden el umbral en unidades o en coeficientes.

  Cubrir los tres umbrales.
- [ ] T037 [P] [US5] Implementar `src/dominio/asambleas/provisoria.ts` hasta que T036 pase.
- [ ] T038 [P] [US5] Test de integración en `pruebas/integracion/asambleas-oposicion.spec.ts`. Cubre:
  - `cerrarPunto` con la regla `totalidad` fija `provisorio` y `vencePlazoOposicion = cierre + 15 días`, y avisa `decision_provisoria` a los ausentes con usuario más `correo_directo` a los que no tienen cuenta;
  - `oponerme` solo lo hace el propietario de una unidad ausente y con voto (`NoEraAusente`) y dentro del plazo (`FueraDePlazo`, con el reloj fijo);
  - `registrarOposicionEnPapel`;
  - `verAsamblea` devuelve el estado derivado;
  - con la regla `presentes` y en opción múltiple, la decisión nunca queda provisoria.
- [ ] T039 [US5] Implementar `src/aplicacion/asambleas/oposicion.ts` (`oponerme`, `registrarOposicionEnPapel`). Sumar a `cerrarPunto` en `conducir.ts` el aviso a los ausentes y el plazo, y a `verAsamblea` en `ver.ts` el `estadoDecision` de cada punto.
- [ ] T040 [US5] Mostrar el estado (firme, provisoria hasta tal fecha, o caída) en los resultados de `asambleas/[asamblea]/page.tsx`, con el botón «Oponerme» para el ausente habilitado. Incluir el estado en `ActaParaDocumento`.

**Checkpoint**: la regla del CCyC art. 2060 funciona de punta a punta.

---

## Phase 8: User Story 6 — Configurar las reglas de asamblea (Priority: P3)

**Goal**: la administración ajusta las cuatro reglas del consorcio, y cada asamblea conserva las que tenía al convocarse.

**Independent Test**: con el tope en 2, un tercer poder se rechaza; con la regla `totalidad`, la asamblea siguiente la usa y la ya convocada no.

- [ ] T041 [P] [US6] Test de integración en `pruebas/integracion/asambleas-configuracion.spec.ts`. Cubre:
  - los defaults;
  - guardar valores válidos, y rechazar los que quedan fuera de rango con `ConfiguracionInvalida`;
  - el consejo y el consorcista no pueden;
  - una asamblea ya convocada conserva su copia de la configuración;
  - otro consorcio no ve la configuración.
- [ ] T042 [US6] Implementar `verConfiguracion` y `guardarConfiguracion` en `src/aplicacion/asambleas/configuracion.ts`, con rol `administrador`, validación Zod de los rangos de `data-model.md` y auditoría por disparador.
- [ ] T043 [US6] Pantalla `src/app/(panel)/consorcios/[consorcio]/asambleas/configuracion/page.tsx`, con su formulario y acción, enlazada desde la lista solo para la administración.

**Checkpoint**: todas las historias completas.

---

## Phase 9: Polish & Cross-Cutting

- [ ] T044 [P] Prueba e2e `pruebas/e2e/asambleas.spec.ts` en el proyecto de teléfono 390×844, con el recorrido de `quickstart.md` § 3:
  1. convocar;
  2. poder;
  3. abrir y acreditar;
  4. constituir;
  5. el inquilino vota en otra sesión, y en la sesión de quien dirige aparece en ≤ 5 s (SC-001);
  6. voto manual;
  7. cerrar y finalizar;
  8. resúmenes y cuatro firmas;
  9. el acta en Documentación.
- [ ] T045 [P] Sumar la vista en vivo y la pantalla de firma a las páginas que recorre `npm run test:a11y`, sin violaciones A/AA.
- [ ] T046 [P] Documentar el cambio de alcance en `docs/entrega-1/04-alternativas-solucion.md`:
  - sumar RF-29 a RF-33 a la tabla, con objetivo y actor;
  - sacar la fila de exclusión «Asambleas, votaciones y actas con validez legal» y dejar una justificación de la firma electrónica (Ley 25.506, art. 5);
  - sumar el módulo a la tabla de módulos.

  Sin nombres de producto (regla de `docs/entrega-1..3`).
- [ ] T047 [P] Sumar las RN nuevas a `docs/entrega-3/07-analisis-de-datos.md` § 7.2: voto por unidad con doble cómputo, voto inmutable, orden del día fijo, mora sin voto, tope de poderes y decisión provisoria. Agregar las entidades nuevas al modelo de datos, con el diagrama en Mermaid sin acentos en los nodos.
- [ ] T048 [P] En `docs/entrega-3/12-diseno.md`, sumar a § 4 los CU nuevos (convocar asamblea, otorgar poder, conducir y votar, firmar acta, oponerse), más la matriz de trazabilidad RF↔CU y la tabla de notificaciones (§ 12.7), con los seis tipos nuevos.
- [ ] T049 [P] Agregar la sección «Asambleas» al manual de usuario `docs/entrega-final/16-manual-usuario.md`: la convocatoria, los poderes, cómo votar desde el teléfono, el acta y la firma. Actualizar el estado en `docs/README.md` y `README.md` si cambia.
- [ ] T050 [P] Sumar a `scripts/semilla.mjs` (la semilla demo de `npm run semilla`) una asamblea finalizada con su acta firmada y una convocada a futuro en uno de los edificios demo, usando los casos de uso reales.
- [ ] T051 Antes del PR, correr `npx prettier --write .`, `npm run verificar`, `npm run test:a11y`, `npm run docs:versiones`, `npm audit --omit=dev --audit-level=high` y gitleaks según `CLAUDE.md`. Revisar las ocho condiciones de la definición de terminado (§ 8.3.4).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → **Foundational (2)**: T002 → T003 → T004. T005 → T006. T007 y T008 son independientes.
- **US1 (3)** depende de la fase 2. Es el MVP de la convocatoria.
- **US2 (4)** depende de la fase 2 y de **US1**, porque necesita una asamblea convocada (`convocar.ts`) y `ver.ts`.
- **US3 (5)** depende de US1, porque el poder se otorga sobre una asamblea convocada. Se integra con US2 por `acreditarme`, que ya busca poderes vigentes.
- **US4 (6)** depende de US2, porque necesita una asamblea finalizada.
- **US5 (7)** depende de US2, porque extiende `cerrarPunto`. Es independiente de US3 y US4, salvo el estado de cada decisión en el acta (T040 toca `ActaParaDocumento` de T030).
- **US6 (8)** depende solo de la fase 2: los defaults viven en la base, así que se puede hacer en cualquier momento.
- **Polish (9)** va después de las historias que se entreguen.

### Within Each User Story

- Los tests de dominio se escriben y se ven **fallar** antes de implementar (TDD).
- El orden es: dominio → caso de uso → pantalla. El test de integración se escribe junto al caso de uso.

### Parallel Opportunities

- Fase 2: T005, T007 y T008 en paralelo, mientras corre T002/T003.
- US1: T009, T010 y T011 en paralelo (T010 sigue a T009 en TDD, pero va en otro archivo que T011).
- US2: T017, T018 y T020 en paralelo; después T019, y luego T021 y T022.
- Después de US2: US3, US4, US5 y US6 en paralelo entre los dos integrantes (ver abajo).
- Polish: T044 a T050 en paralelo.

## Parallel Example: después del MVP

```text
Integrante A: US4 (T030–T035) — acta y firma
Integrante B: US3 (T025–T029) → US5 (T036–T040) → US6 (T041–T043)
```

## Implementation Strategy

### MVP First

1. Fases 1 y 2: el esquema con la inmutabilidad en la base.
2. US1, convocatoria: es demostrable sola, porque la convocatoria con el calendario ya sirve.
3. US2, votación en vivo: es el **MVP útil**, con una asamblea real de punta a punta sin acta.
4. Validar con `quickstart.md` § 1–3 y desplegar a la demo.

### Incremental Delivery

US1 → US2 (MVP) → US4 (acta oficial, lo que le da validez) → US3 (poderes) → US5 (CCyC 2060) →
US6 (configuración). Cada incremento va en su propio PR con revisión del otro integrante, según
la constitución. Los documentos de la fase 9 (T046 a T049) acompañan al primer PR que se integre a
`main`, porque el cambio de alcance tiene que estar documentado antes de que el código llegue a la
rama principal.

## Notes

- Toda consulta nueva sobre `prisma.unidad` para el padrón vigente filtra `bajaDesde: null` (nota 23).
- Ninguna consulta escribe `consorcio_id` a mano: no se toca la lista blanca de `pruebas/dominio/filtro-unico.spec.ts`.
- La deuda para «sin voto» sale de `saldoImpagoPorUnidad` y no se recalcula (memoria: saldo por período des-arrastrado).
- Los coeficientes viajan a la interfaz como cadena.
