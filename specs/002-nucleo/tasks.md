# Tasks: 002-nucleo

**Input**: Design documents from `/specs/002-nucleo/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Prerequisites**: `001-andamiaje` integrada. Esta etapa **usa** la verificación única, la extensión de aislamiento, `fn_auditar()` y el despliegue automático; no los construye.

**Tests**: Se incluyen tareas de prueba porque la especificación las exige como criterios de éxito (SC-001 a SC-014) y porque la constitución hace **obligatorio el desarrollo guiado por pruebas en coeficientes** (reglas RN-01 y RN-02, núcleo económico). En esas tareas la prueba se escribe **antes** y así está marcado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)

---

## Phase 1: Setup

**Purpose**: dependencias nuevas y su registro documental

- [X] T001 [P] Instalar `@vercel/blob` 2.8.0 y `resend` 6.26.0 con `--save-exact` en `package.json` (research R-05, R-09)
- [X] T002 [P] Agregar las dependencias nuevas a la tabla de `docs/entrega-final/14-codificacion.md` § 14.1 con licencia y justificación; `npm run docs:versiones` debe pasar (FR-023 de `001`)
- [X] T003 [P] Agregar `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, `ADMIN_SEMILLA_CORREO` y `ADMIN_SEMILLA_CLAVE` a `.env.example` con nombres y sin valores (FR-005, FR-008 de `001`)
- [ ] T004 **Requiere acción del equipo.** Cargar los secretos de correo y almacenamiento en el proveedor de despliegue y en los secretos del repositorio; ninguno versionado (§ 18.7)
- [X] T005 [P] Crear `scripts/semilla.mjs` y `scripts/semilla-volumen.mjs` con sus guiones en `package.json` (FR-028, SC-006) — se hace junto con T017, cuando existan las tablas que la semilla llena: un guion vacío que dice cargar datos y no carga nada es peor que no tenerlo

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: lo que toda historia necesita. **BLOQUEA todas las historias**

- [X] T006 Declarar los puertos del dominio en `src/dominio/contratos/`: `reloj.ts`, `almacen-objetos.ts`, `notificador.ts`, `derivador-contrasenas.ts`, según `contracts/puertos-dominio.md` (Principio III, FR-019)
- [X] T007 [P] Implementar `src/infraestructura/reloj.ts` (reloj real) y `pruebas/dominio/reloj-fijo.ts` (reloj de prueba con fecha fija)
- [X] T008 Definir `Consorcio` en `prisma/schema.prisma` con `id` UUID por `gen_random_uuid()`, `nombre`, `direccion`, `localidad` obligatorios y `cuit` único, más `creado_en`/`actualizado_en` en `timestamptz(6)` (data-model § 2)
- [X] T009 Definir `TrabajoPendiente` en `prisma/schema.prisma`: `tipo` (`invitacion`, `confirmacion_subida`), `carga` JSONB, `estado` (`pendiente`, `despachado`, `agotado`), `intentos`, `proximo_intento`, `ultimo_error` nulo, con índice `(estado, proximo_intento)` (FR-006b)
- [X] T010 Crear la migración de la base de esta etapa en `prisma/migrations/` con `Consorcio` y `TrabajoPendiente`; verificar `npm run db:drift` sin diferencias (FR-026)
- [X] T011 Implementar `src/aplicacion/autorizacion.ts`: resuelve la habilitación vigente por par (rol, consorcio) contra la base y abre `enConsorcio(...)`; es el único lugar que autoriza (FR-002, FR-003, `contracts/puertos-dominio.md` § Regla de invocación)
- [X] T012 Implementar `src/aplicacion/pendientes/encolar.ts` y `drenar.ts`: el drenaje toma un lote con bloqueo de fila salteando lo bloqueado, aplica espera creciente y marca `agotado` al límite de intentos (FR-006b, research R-06)
- [X] T013 Enganchar el drenaje con `after()` de `next/server` en el grupo `src/app/(panel)/layout.tsx`, de modo que corra después de responder y no sume latencia (research R-06)
- [X] T014 [P] Crear el armazón de interfaz en `src/app/(panel)/layout.tsx` y `src/app/globals.css` con los tokens de `docs/guia-estilos-ejemplo.html`: barra, lateral, menú de teléfono, foco visible y objetivos táctiles de 44 px (§ 3 de `docs/guia-estilos.md`)
- [X] T015 [P] Crear `src/compartido/formato.ts`: importe a cadena con dos decimales y coeficiente con ocho, ambos desde `Prisma.Decimal`; ninguna función acepta el tipo numérico nativo (FR-013, SC-010)
- [X] T016 [P] Crear `src/compartido/errores.ts` con los errores de aplicación y su mensaje para el usuario final, sin detalle técnico (RNF-10, § 14.4)
- [X] T017 [P] **Bloqueada por US1 y US2** (necesita `Unidad`, `Persona` y `Habilitacion`). Crear `pruebas/fixtures/juego-13-4.ts` con la semilla determinística de los dos consorcios de § 13.4 (12 y 96 unidades) reutilizable por integración y extremo a extremo (FR-028)
- [X] T018 **Bloqueada por T020** (necesita la tabla `Habilitacion`). Escribir la prueba de integración `pruebas/integracion/autorizacion.spec.ts` que fija el contrato de T011: sin habilitación vigente, cero filas; con habilitación de otro consorcio, cero filas (SC-002)

**Checkpoint**: la autorización y el aislamiento funcionan antes de que exista una sola pantalla de negocio

---

## Phase 3: User Story 1 — El administrador entra y ve sólo lo suyo (Priority: P1) — MVP

**Goal**: identidad, invitación por correo y habilitación por consorcio. Es la historia de la que cuelga todo lo demás.

**Independent Test**: dos usuarios habilitados sobre consorcios distintos consultan el mismo listado y cada uno obtiene exclusivamente sus datos; un usuario sin habilitación vigente obtiene cero filas.

- [X] T019 [US1] Definir `Persona`, `Usuario`, `IntentoInicioSesion` y `Habilitacion` en `prisma/schema.prisma`: `Usuario.correo` único, `estado` (`invitado`, `activo`, `suspendido`), `bloqueado_hasta` nulo; `Habilitacion.rol` (`administrador`, `consejo`, `consorcista`) con `vigencia_desde` obligatoria y `vigencia_hasta` nula = sin vencimiento (data-model § 1)
- [X] T020 [US1] Crear la migración con esas cuatro tablas más el índice `(usuario_id, consorcio_id)` de `Habilitacion` y el índice `(correo_probado, momento)` de `IntentoInicioSesion` (FR-026)
- [X] T021 [P] [US1] Implementar `src/infraestructura/contrasenas/argon2.ts` sobre el puerto `DerivadorDeContrasenas`, con Argon2id a 19 MiB, dos iteraciones y paralelismo 1 (FR-001, research R-07)
- [X] T022 [P] [US1] Implementar `src/infraestructura/correo/resend.ts` sobre el puerto `Notificador`; el dominio no lo nombra (FR-019, research R-09)
- [X] T023 [US1] Configurar Auth.js en `src/app/api/auth/[...nextauth]/route.ts` y `src/aplicacion/identidad/sesion.ts`: la sesión transporta **sólo la identidad**; el rol y el consorcio se leen de la base en cada operación (FR-002, research R-01)
- [X] T024 [US1] Implementar `src/aplicacion/identidad/iniciar-sesion.ts` con el bloqueo de FR-001b: cinco fallos consecutivos bloquean quince minutos, cada intento se registra con momento y origen, y el mensaje es idéntico exista o no la cuenta y esté o no bloqueada (FR-001c)
- [X] T025 [US1] Implementar `src/aplicacion/identidad/invitar-persona.ts`: crea `Persona`, `Usuario` en `invitado` y `Habilitacion`, y encola el correo como `TrabajoPendiente`; la falla del correo **no** hace fallar el alta (FR-006)
- [X] T026 [P] [US1] Implementar `src/aplicacion/identidad/fijar-contrasena.ts`: valida la credencial de invitación, la marca usada y pasa el usuario a `activo`; el administrador nunca conoce la contraseña (FR-006)
- [X] T027 [P] [US1] Implementar `src/aplicacion/identidad/otorgar-habilitacion.ts`, `revocar-habilitacion.ts` y `desbloquear-usuario.ts`, todas restringidas a rol administrador (FR-007, FR-001c)
- [X] T028 [US1] Crear `scripts/semilla-arranque.mjs` y su guion: crea un único administrador con la contraseña tomada de variable de entorno, nunca versionada, e idempotente (FR-005, cierra el hueco H-08)
- [X] T028b [US1] Modelar los tres niveles de rol (FR-007, FR-007b, FR-007c): `Administradora`, `Consorcio.administradora_id`, `HabilitacionPlataforma`, `HabilitacionAdministradora`, clave única `(usuario, consorcio, rol)`, resolución del rol efectivo en `accesoVigente`, altas de administradora y de consorcio, con `pruebas/integracion/plataforma.spec.ts` y `autorizacion.spec.ts` (SC-002c, SC-002d, SC-002e)
- [X] T029 [P] [US1] Construir las pantallas `src/app/(sesion)/ingresar/page.tsx` e `invitacion/[credencial]/page.tsx` con etiqueta visible, ayuda y error debajo (§ 3.4 de la guía de estilos)
- [X] T030 [P] [US1] Construir `src/app/(panel)/usuarios/page.tsx` y `usuarios/invitar/page.tsx` con la acción de reenviar invitación y el estado del pendiente a la vista (FR-006b)
- [X] T031 [US1] Escribir `pruebas/integracion/identidad.spec.ts`: el sexto intento falla **aunque la contraseña sea correcta** y vuelve a funcionar a los quince minutos o al desbloquear (SC-006d); el mensaje es idéntico en los tres casos (FR-001c)
- [X] T032 [US1] Escribir `pruebas/integracion/aislamiento-rol.spec.ts`: un consorcista es denegado en el 100 % de las escrituras de la etapa, y una habilitación vencida ayer da cero filas (SC-002b, FR-004)

**Checkpoint**: la condición 3 de la definición de terminado ya se puede verificar sobre algo real

---

## Phase 4: User Story 2 — Consorcio, unidades y coeficientes (Priority: P1)

**Goal**: el alta no cierra hasta que la suma dé exactamente `100.00000000`, y el invariante lo impone la base.

**Independent Test**: cargar el consorcio de 96 unidades de § 13.4 y comprobar que la suma da exacto y que una suma distinta es rechazada con el detalle de la diferencia.

- [X] T033 [US2] **Prueba primero** (TDD obligatorio, núcleo económico): escribir `pruebas/dominio/coeficientes.spec.ts` con la suma exacta, la diferencia de `0.00000001`, el consorcio de una sola unidad al `100.00000000` y el de 96 unidades de § 13.4 (regla RN-01, SC-001, SC-004)
- [X] T034 [US2] Implementar `src/dominio/coeficientes/suma.ts` hasta que T033 pase: opera con `Prisma.Decimal`, jamás con el tipo numérico nativo, y devuelve la diferencia y las unidades involucradas (FR-011, FR-013)
- [X] T035 [US2] **Prueba primero**: escribir `pruebas/dominio/vigencia-coeficiente.spec.ts` con el reloj fijo: una vigencia retroactiva se rechaza y una futura cierra la anterior (regla RN-02, FR-012)
- [X] T036 [US2] Implementar `src/dominio/coeficientes/vigencia.ts` hasta que T035 pase
- [X] T037 [US2] Definir `Unidad` (`coeficiente NUMERIC(11,8)`, `designacion` única por consorcio), `CoeficienteHistorico` y `Ocupacion` con la vigencia como **rango de fechas** en `prisma/schema.prisma`; la columna de rango va como tipo no soportado por el mapeador (data-model § 2, research R-04)
- [X] T038 [US2] Escribir a mano en la migración el disparador de restricción `DEFERRABLE INITIALLY DEFERRED` que verifica, al confirmar la transacción, que la suma de coeficientes vigentes de cada consorcio tocado dé exactamente `100.00000000`, **sin evaluar consorcios sin unidades** (FR-011b, FR-011c, research R-03)
- [X] T039 [US2] Escribir a mano en la misma migración la restricción `EXCLUDE USING gist (unidad_id WITH =, tipo WITH =, vigencia WITH &&)` de `Ocupacion` sobre `btree_gist` (regla RN-09, FR-008)
- [X] T040 [US2] Enganchar `fn_auditar()` a `Unidad` y `CoeficienteHistorico` en la misma migración (FR-025, condición 7 de § 8.3.4)
- [X] T041 [US2] Implementar `src/aplicacion/consorcios/alta-consorcio.ts`, `agregar-unidad.ts` y `cambiar-coeficiente.ts`, cada uno en **una sola transacción**, según `contracts/consorcios.md`
- [X] T042 [P] [US2] Implementar `src/aplicacion/consorcios/registrar-ocupacion.ts`, con el repositorio de `Ocupacion` en `src/infraestructura/repositorios/ocupaciones.ts` usando consulta cruda para la columna de rango (research R-04)
- [X] T043 [P] [US2] Construir `src/app/(panel)/consorcios/page.tsx`, `[id]/page.tsx` y `[id]/unidades/page.tsx`, con la suma corriente a la vista mientras se cargan las unidades y el rechazo nombrando la diferencia exacta (RNF-10, `contracts/consorcios.md`)
- [X] T044 [US2] Escribir `pruebas/integracion/invariantes-base.spec.ts`: dos transacciones simultáneas no pueden dejar la suma fuera de `100.00000000` y una segunda ocupación superpuesta es rechazada, **ambas salteándose la capa de aplicación** (SC-004b, SC-005)

**Checkpoint**: la precondición aritmética de la etapa 3 queda cerrada y probada

---

## Phase 5: User Story 3 — Registrar un gasto con su comprobante (Priority: P1)

**Goal**: la entrada de datos que alimenta la liquidación y los indicadores, con el comprobante subido directo al almacenamiento.

**Independent Test**: cargar 30 gastos con comprobante sobre un período abierto y comprobar que cada uno queda clasificado, imputado y con su archivo recuperable.

- [X] T045 [US3] Definir `RubroGasto` (catálogo global, **sin** `consorcio_id`), `Proveedor` (`cuit` único por consorcio), `Periodo` (`anio`+`mes` único por consorcio, `estado` con los cuatro valores), `Gasto` (`importe NUMERIC(14,2)`) y `Comprobante` en `prisma/schema.prisma` (data-model § 3)
- [X] T046 [US3] Crear la migración con esas cinco tablas, los índices `(consorcio_id, periodo_id, rubro_id)` y `(consorcio_id, fecha)` de `Gasto`, y `fn_auditar()` enganchado a `Periodo`, `Gasto` y `Comprobante` (FR-025, SC-006)
- [X] T047 [P] [US3] Cargar la lista semilla de `RubroGasto` acordada con el cliente, con su clasificación ordinario/extraordinario, en `prisma/semilla-rubros.ts` (FR-014, cierra el hueco H-07)
- [X] T048 [US3] Declarar en `src/dominio/periodos/estado.ts` el **contrato mínimo del estado**: los cuatro valores y las transiciones válidas que `003-liquidacion` comparte; esta etapa sólo produce `abierto` (FR-017, FR-024, M-04)
- [X] T049 [P] [US3] Escribir `pruebas/dominio/estado-periodo.spec.ts` sobre ese contrato, sin base de datos (Principio III)
- [X] T050 [US3] Implementar `src/aplicacion/periodos/abrir-periodo.ts` y `listar-periodos.ts`: un solo período por consorcio y mes; **sin** cierre, liquidación ni anulación (FR-024)
- [X] T051 [US3] Implementar `src/aplicacion/gastos/registrar-gasto.ts`: rechaza si el período no está `abierto`, congela la clasificación del rubro en el gasto y guarda el importe en decimal de precisión fija (reglas RN-03 y RN-04, FR-016)
- [X] T052 [P] [US3] Implementar `src/infraestructura/objetos/blob.ts` sobre el puerto `AlmacenObjetos`: emite permiso de subida y resuelve lectura autorizada; **no** recibe bytes (FR-018b, FR-019, research R-05)
- [X] T053 [US3] Implementar `src/app/api/comprobantes/permiso/route.ts`: verifica habilitación, tipo de contenido entre PDF, JPEG, PNG, WebP, HEIC y TIFF, y tamaño de hasta 26.214.400 bytes **antes** de emitir el permiso (FR-018)
- [X] T054 [US3] Implementar `src/aplicacion/gastos/confirmar-comprobante.ts`: pasa el comprobante de `pendiente` a `disponible`; si la confirmación no llega, queda como `TrabajoPendiente` de tipo `confirmacion_subida` (FR-006b, data-model § 3)
- [X] T055 [P] [US3] Implementar `src/aplicacion/proveedores/alta-proveedor.ts` y `editar-proveedor.ts`; sin baja, que está diferida (FR-015, § 9.11)
- [X] T056 [US3] Construir `src/app/(panel)/gastos/nuevo/page.tsx` **admitiendo valores precargados por parámetro**, marcando cada campo precargado y exigiendo confirmación humana explícita, para que `RF-06` se enchufe en `004` sin rediseñar la pantalla (FR-020, regla RN-14, Principio IV)
- [X] T057 [P] [US3] Construir `src/app/(panel)/proveedores/page.tsx` y `src/app/(panel)/periodos/page.tsx`
- [X] T058 [US3] Escribir `pruebas/integracion/comprobantes.spec.ts`: 25 MB sube y se recupera, 26 MB se rechaza **antes** de transferir un byte, HEIC se recupera por descarga con la razón dicha, y el archivo nunca atraviesa el servidor (SC-006c, FR-018c)
- [X] T059 [US3] Escribir `pruebas/integracion/periodo-liquidado.spec.ts`: un período marcado como liquidado rechaza el alta y la modificación de gastos en el 100 % de los intentos (SC-012, regla RN-03)
- [X] T060 [US3] Escribir `pruebas/e2e/importe-cadena.spec.ts`: un importe de más de quince dígitos significativos llega a la interfaz **como cadena**, sin pérdida (SC-010)

**Checkpoint**: hay datos económicos reales, auditados, con el dinero exacto de punta a punta

---

## Phase 6: User Story 4 — El consorcista consulta gastos y comprobantes (Priority: P2)

**Goal**: la primera pantalla que ve un usuario final y la que hace demostrable la iteración.

**Independent Test**: con el juego de § 13.4 cargado, filtrar por período y rubro desde un teléfono y medir el tiempo de respuesta.

- [X] T061 [US4] Implementar `src/aplicacion/gastos/listar-gastos.ts` con filtro por consorcio, período y rubro, y paginado; el filtro por consorcio **no** se escribe: lo pone la extensión (FR-021, FR-003)
- [X] T062 [US4] Construir `src/app/(panel)/gastos/page.tsx`: filtros arriba, importes tabulares a la derecha, fila de totales, y la tabla desplazándose dentro de su propio contenedor, nunca la página (§ 3.4 de la guía de estilos, RNF-01)
- [X] T063 [P] [US4] Construir `src/app/(panel)/gastos/[id]/page.tsx` con la vista del comprobante, y descarga en lugar de vista incrustada para HEIC y TIFF, diciendo por qué (FR-018c)
- [X] T064 [US4] Implementar `src/aplicacion/gastos/ver-comprobante.ts`: un comprobante de otro consorcio devuelve «no encontrado», **nunca** «prohibido», para no revelar la existencia del recurso (SC-002, `contracts/gastos.md`)
- [X] T065 [P] [US4] Completar `scripts/semilla-volumen.mjs` para generar los 10.800 gastos del volumen anual con la misma semilla determinística (SC-006, research R-10)
- [X] T066 [US4] Medir con `npm run medir:p95 /gastos` **en caliente** contra el objetivo de 2 s y registrar el resultado; medir el arranque en frío y anotarlo por separado en § 14.5 (SC-006, SC-006b)
- [X] T067 [P] [US4] Escribir `pruebas/e2e/consorcista.spec.ts`: listado y detalle a 390 px sin desplazamiento horizontal, en los proyectos de escritorio y de teléfono (SC-011, RNF-01)
- [X] T068 [P] [US4] Escribir `pruebas/e2e/consorcista.a11y.spec.ts`: las **tres** pantallas del consorcista sin infracciones de nivel A ni AA (SC-011, RNF-11)

**Checkpoint**: la iteración es demostrable ante el cliente desde un teléfono

---

## Phase 7: User Story 5 — Auditoría completa y cierre (Priority: P2)

**Goal**: verificar que las cinco tablas económicas dejan asiento y que la aplicación no puede tocar la bitácora.

**Independent Test**: operar sobre cada tabla económica y verificar que todas dejan asiento con imagen anterior y posterior.

- [ ] T069 [US5] Escribir `pruebas/integracion/auditoria-etapa.spec.ts`: cada una de las **cinco** tablas económicas —`Unidad`, `CoeficienteHistorico`, `Periodo`, `Gasto`, `Comprobante`— deja exactamente un asiento por operación, con imagen anterior y posterior (SC-007)
- [ ] T070 [US5] Extender esa prueba con los tres denegados sobre la bitácora con el rol de la aplicación (SC-008, RNF-12)
- [ ] T071 [US5] Escribir `pruebas/integracion/pendientes.spec.ts`: con el correo caído el alta se completa igual, al volver el servicio el siguiente pedido lo despacha, y el reenvío del administrador lo despacha aunque no haya llegado el próximo intento (SC-013b)
- [ ] T072 [P] [US5] Solicitar formalmente al cliente las **tres liquidaciones reales** y registrar la fecha del pedido; sin ellas `003-liquidacion` no arranca (FR-027, riesgo RT-01, SC-013)
- [ ] T073 [P] [US5] Actualizar `docs/entrega-final/13-prototipo.md` § 13.3 con el estado por módulo al cierre de la etapa (FR-029, condición 8 de § 8.3.4)
- [ ] T074 [US5] Registrar en `CLAUDE.md` los guiones nuevos (`semilla`, `semilla:volumen`, `semilla:arranque`) y las decisiones que un recién llegado no puede adivinar

**Checkpoint**: las ocho condiciones de la definición de terminado se pueden verificar una por una

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T075 Verificar `SC-003` con una búsqueda del filtro por consorcio en todo el repositorio: **cero coincidencias** fuera de `src/infraestructura/cliente-aislado.ts` (Principio I, riesgo RT-04)
- [ ] T076 [P] Revisar que ninguna firma pública del dominio acepte ni devuelva el tipo numérico nativo para dinero o coeficientes, y que `npm run lint` no reporte la regla `flay/sin-aritmetica-monetaria` (SC-009)
- [ ] T077 Correr `npm run verificar` completo, local y remoto, y confirmar que sigue bajo los 10 minutos con las pruebas nuevas (FR-018 de `001`)
- [ ] T078 [P] Ensayar el recorrido de `quickstart.md` § Recorrido manual sobre el entorno desplegado, sin ningún paso desde una máquina de desarrollo (SC-014)
- [ ] T079 [P] Actualizar `docs/entrega-final/14-codificacion.md` § 14.5 con el esfuerzo real de la etapa contra las 187 h planificadas
- [ ] T080 Etiquetar el cierre de la iteración 1 con versión semántica, conforme a § 8.3.5

---

## Dependencies & Execution Order

- Setup (T001-T005) → Foundational (T006-T018) **bloquea todo** → US1 (T019-T032) → US2 (T033-T044) → US3 (T045-T060) → US4 (T061-T068) → US5 (T069-T074) → Polish (T075-T080)
- **US2 depende de US1** sólo por `Consorcio` y la autorización, que quedan en Foundational y en US1.
- **US3 depende de US2**: un gasto necesita un consorcio con unidades y un período abierto.
- **US4 depende de US3**: es sólo lectura sobre lo que US2 y US3 construyeron.
- **US5 verifica** lo que las anteriores engancharon: cada historia engancha `fn_auditar()` a sus propias tablas al crearlas (condición 7 de § 8.3.4), y US5 comprueba el conjunto.

### Desvío deliberado respecto de la especificación

La especificación ubica el mínimo de `Periodo` en la historia 5. Aquí va en la historia 3 (T048, T050): un gasto **no puede existir** sin período al cual imputarse, así que dejarlo en la historia 5 haría que la 3 no fuera independientemente probable. Es el mismo movimiento que el hallazgo 1 del análisis de insumos ya justificaba; sólo cambia de historia, no de alcance.

### Desvíos de la historia 2, ya construidos

- **T039**: la restricción de exclusión quedó como `EXCLUDE USING gist (unidad_id WITH =, vigencia
  WITH &&) WHERE (tipo = 'inquilino')`, y no con `tipo WITH =`. La tarea es anterior al commit que
  acotó la regla RN-09 a inquilinos: varios propietarios vigentes son el condominio, que es lo
  normal en propiedad horizontal (FR-008, `data-model.md` § 2).
- **T038**: el disparador sobre `CoeficienteHistorico` no repite la verificación de `Unidad` —ahí
  sería una comprobación que no puede fallar—: verifica la suma **en cada fecha** que la historia
  declara. Es lo que atrapa un cambio con vigencia futura que dejaría un conjunto sin cuadrar
  esperando a entrar en vigor. Una fecha en la que no todas las unidades tienen coeficiente vigente
  no se evalúa, por el mismo criterio de FR-011c.
- **T041**: se agregó `cargarPadron`, que la tarea no nombra. Sin él la pantalla de unidades no
  puede existir: unidad por unidad la suma nunca da 100 y cada alta sería un rechazo (FR-011c).
  `editarConsorcio`, que el contrato sí menciona, queda pendiente: ninguna tarea lo pide.
- **T043**: se agregó `consorcios/nuevo/page.tsx`, una cuarta pantalla. Las tres de la tarea son
  inalcanzables sin ella: no había forma de crear un consorcio desde la interfaz.

### Desvíos de la historia 3, ya construidos

- **T047**: `prisma/semilla-rubros.ts` se corre directo (`npm run semilla:rubros`) apoyándose en el
  despojado de tipos de Node 22. Para que no avise en cada corrida, `package.json` declara
  `"type": "module"`; no hay ningún archivo CommonJS en el repositorio.
- **T052 y T053**: los casos de uso de comprobante **reciben** el puerto `AlmacenObjetos` en vez de
  importar la implementación. Sin eso, el camino de rechazo no se puede probar: lo que hay que
  afirmar es que a 26 MB **no se llamó** al almacenamiento, y con el proveedor real eso es
  inobservable.
- **T058**: la parte de «25 MB sube y se recupera» se verifica contra un doble, no contra el
  proveedor. Lo que se prueba es el orden —tipo y tamaño antes de emitir el permiso— y la clave
  emitida. La subida real necesita `BLOB_READ_WRITE_TOKEN` y mediría la red de quien corre las
  pruebas, no la regla; queda para el ensayo manual de `quickstart.md` (SC-014).
- **Pantalla extra**: `gastos/[id]/page.tsx`, con el adjunto del comprobante. Ninguna tarea de esta
  historia la nombra, pero el permiso de subida necesita un gasto ya creado, así que sin ella
  `T052`-`T054` no se ejercitan desde la interfaz. `T063` (historia 4) la completa.
- **Pendiente conocido**: `/gastos` todavía no existe (es `T062`, historia 4), así que los enlaces
  del menú y de «volver a gastos» no resuelven hasta que esa tarea se construya.

### Desvíos de la historia 4, ya construidos

- **T066**: el arnés `medir:p95` no podía medir una pantalla del panel —sin sesión mide la
  redirección a `/ingresar`, que es rapidísima y no dice nada—. Ahora entra por el mismo formulario
  que una persona: pide la marca contra falsificación, manda las credenciales y guarda la galleta.
  Si la ruta responde con una redirección, falla en vez de informar un número falso.
- **Corrección de RNF-03 fuera de tarea**: `/periodos` y `/proveedores` le mostraban a un
  consorcista formularios que su rol no puede usar. Se agregó `rolesEn(...)`, que **no autoriza
  nada** —eso sigue en el caso de uso, contra la base— y sólo decide qué se dibuja. La prueba de
  extremo a extremo lo fija.
- **T005 y T017**, que estaban diferidas hasta que existieran las tablas: `pruebas/fixtures/juego-13-4.ts`
  con los dos consorcios de 12 y 96 unidades, `scripts/semilla.mjs` y `scripts/semilla-volumen.mjs`.
  Los coeficientes se reparten en decimal de precisión fija: con el tipo numérico nativo, noventa y
  seis sumas de 1,04166666 no dan 100 y la semilla no cargaría.
- **`limpiar()` de las pruebas** ahora vacía también las tablas de negocio. En una base compartida
  no hay forma de distinguir lo sembrado de lo que dejó una corrida anterior, así que el orden de
  `quickstart.md` es sembrar y medir, nunca al revés.

### Paralelo

- T001+T002+T003+T005 · T007+T014+T015+T016+T017 · T021+T022 · T026+T027 · T029+T030 · T042+T043 · T047 con T048 · T052+T055 · T057 con T056 · T063+T065 · T067+T068 · T072+T073

---

## Implementation Strategy

**MVP = Setup + Foundational + US1.** Con eso el sistema autentica, invita, habilita por consorcio y demuestra el Principio I sobre datos reales: es lo mínimo que se puede mostrar y defender.

Después, en orden: US2 cierra la precondición aritmética de la etapa 3, US3 pone datos económicos auditados, US4 hace demostrable la iteración desde un teléfono, US5 verifica el conjunto.

**TDD obligatorio** en T033-T036: son coeficientes, núcleo económico, y la constitución no lo deja opcional. En el resto es opcional, y las tareas de prueba que igual aparecen están porque son criterios de éxito de la especificación, no preferencia de estilo.
