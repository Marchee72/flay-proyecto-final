# Tasks: 004-servicios

**Input**: Documentos de diseño de `/specs/004-servicios/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Tests**: la prueba acompaña al código en toda la etapa (§ 8.3.3: TDD opcional fuera de la
liquidación). Excepción: la máquina de estados de reclamo se escribe **primero**, como
`periodos/estado.ts` en `002`. Cada SC de la spec tiene una prueba nombrada acá; la implementación
del proveedor real **no** se ejercita en la puerta automática, sólo la determinista y la nula.

**Organización**: por historia de usuario, para que cada una se pueda construir y probar sola.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: a qué historia pertenece (US1 a US6)

---

## Phase 1: Setup

**Purpose**: dependencias y guiones antes de tocar el esquema

- [X] T001 Instalar `@google/genai` y `unpdf` con versión exacta en `package.json` (research R-01, R-05) y fijarlas en la tabla de `docs/entrega-final/14-codificacion.md` § 14.1; `npm run docs:versiones` debe pasar
- [X] T002 [P] Agregar a `package.json` los guiones `indicadores:refrescar`, `validar:indicadores` y `exportar:verificar`, apuntando a `scripts/refrescar-vistas.mjs`, `scripts/validar-indicadores.mjs` y `scripts/exportar-verificar.mjs`, que se completan en T060, T061 y T104
- [X] T003 [P] Agregar a `.env.example` `GEMINI_API_KEY`, `FLAY_ASISTENCIA` (vacío, `determinista`) y `CRON_SECRET`, con el comentario de research R-02 sobre cómo se elige la implementación; en `pruebas/integracion/entorno.ts` y en `playwright.config.ts` fijar `FLAY_ASISTENCIA=determinista`
- [X] T004 [P] Ratificar § 14.2 en `docs/entrega-final/14-codificacion.md` con Recharts 2.15.0 ya instalado, en una tabla de una fila contra el criterio de la sección, y actualizar la fila 14 de `docs/README.md` (`FR-024`, research R-12)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: esquema, disparadores, puertos y el mecanismo de avisos que **todas** las historias usan

**⚠️ CRÍTICO**: ninguna historia puede empezar hasta que esta fase esté terminada

### Esquema

- [X] T005 Definir `Reclamo` en `prisma/schema.prisma` con `consorcio_id NN`, `unidad_id` nulo, `creado_por`, `titulo VARCHAR(140)`, `descripcion TEXT`, `alcance` enum `individual`/`general`, `rubro_id` nulo, `urgencia` enum `baja`/`media`/`alta`/`critica` con omisión `media`, `estado` enum `abierto`/`asignado`/`en_curso`/`resuelto`/`cerrado`/`rechazado`, `responsable_id` nulo, `proveedor_id` nulo, `gasto_id` nulo, `fecha_apertura`, `fecha_resolucion` nulo, e índice `(consorcio_id, estado, fecha_apertura)` (`data-model.md`)
- [X] T006 [P] Definir `ReclamoHistorial` en `prisma/schema.prisma` con `reclamo_id NN`, `estado_anterior` nulo, `estado_nuevo NN`, `comentario` nulo, `usuario_id NN`, `ocurrido_en`; **sin** `consorcio_id`: se alcanza por `Reclamo` (decisión 10 de `CLAUDE.md`)
- [X] T007 [P] Definir `SugerenciaReclamo` en `prisma/schema.prisma` con `reclamo_id` **único**, `rubro_sugerido_id`, `urgencia_sugerida`, `proveedor_sugerido_id`, `horas_estimadas INTEGER`, `confianza NUMERIC(4,3)`, `aceptada BOOLEAN` nulo, `procesado_en`
- [X] T008 [P] Definir `EspacioComun` en `prisma/schema.prisma` con `consorcio_id`, `nombre VARCHAR(80)` único por consorcio, `capacidad_maxima` nulo, `anticipacion_minima_horas` omisión 48, `anticipacion_maxima_dias` omisión 60, `duracion_maxima_horas` omisión 8, `reservas_max_mes_unidad` omisión 2, `requiere_deposito` omisión `false`, `importe_deposito NUMERIC(14,2)` nulo, `activo`
- [X] T009 [P] Definir `Reserva` en `prisma/schema.prisma` con `consorcio_id`, `espacio_id`, `unidad_id`, `solicitada_por`, `desde`, `hasta`, `cantidad_personas` nulo, `estado` enum `pendiente`/`confirmada`/`cancelada`/`cumplida`/`rechazada`, `motivo_rechazo` nulo, `observaciones` nulo
- [X] T010 [P] Definir `Novedad` (`consorcio_id`, `titulo VARCHAR(140)`, `cuerpo TEXT`, `publicada_por`, `publicada_en`, `fijada`) y `DocumentoConsorcio` (`consorcio_id`, `tipo` enum `reglamento_copropiedad`/`reglamento_interno`/`acta`/`contrato`/`poliza`/`otro`, `titulo VARCHAR(200)`, `clave_almacenamiento VARCHAR(400)`, `tipo_contenido`, `hash_sha256 CHAR(64)` nulo, `fecha_documento DATE` nulo, `visible_consorcistas`, `estado_indexacion` enum `pendiente`/`procesando`/`indexado`/`error`, `error_indexacion` nulo, `cargado_por`) en `prisma/schema.prisma`
- [X] T011 [P] Definir `FragmentoDocumento` en `prisma/schema.prisma` con `documento_id` en cascada, `numero_fragmento` único por documento, `pagina` nulo, `contenido TEXT` y `vector Unsupported("vector(768)")`; y `ConsultaDocumental` con `consorcio_id`, `usuario_id`, `pregunta`, `respuesta` nulo, `fragmentos_citados JSONB`, `sin_respaldo BOOLEAN`, `util` nulo, `consultado_en`
- [X] T012 [P] Definir `ExtraccionComprobante` en `prisma/schema.prisma` con `consorcio_id`, `clave_objeto`, `tipo_contenido`, `comprobante_id` **nulo**, `proveedor_detectado VARCHAR(160)`, `cuit_detectado VARCHAR(13)`, `fecha_detectada DATE`, `importe_detectado NUMERIC(14,2)`, `rubro_sugerido_id`, `confianza NUMERIC(4,3)`, `confianza_por_campo JSONB`, `estado` enum `pendiente`/`propuesta`/`confirmada`/`corregida`/`descartada`/`no_disponible`, `confirmada_por` nulo, `campos_corregidos JSONB` nulo, `gasto_id` nulo, `cargado_por`, `procesado_en` nulo (research R-04)
- [X] T013 Agregar `notificacion`, `extraccion_comprobante`, `triage_reclamo` e `indexar_documento` a `TipoTrabajo`, y `reserva_rechazada` a `TipoNotificacion`, en `prisma/schema.prisma`
- [X] T014 Crear la migración de esquema con las diez tablas y, **a mano**: `CHECK (estado = 'abierto' OR responsable_id IS NOT NULL)` en `Reclamo` (RN-11, SC-004); `CHECK (desde < hasta)` y `EXCLUDE USING gist (espacio_id WITH =, tstzrange(desde, hasta) WITH &&) WHERE (estado = 'confirmada')` en `Reserva` (RN-10, SC-005, research R-08); índice `HNSW (vector vector_cosine_ops)` en `FragmentoDocumento` (research R-05)
- [X] T015 Enganchar `fn_auditar()` a `ExtraccionComprobante`, `Reclamo` y `Reserva` en la misma migración (regla RN-15 § 7.2, SC-021); las demás quedan afuera por no ser económicas
- [X] T016 Crear las cinco vistas materializadas de `data-model.md` en una migración propia, en `NUMERIC` de punta a punta: `v_morosidad_consorcio` (deuda vencida / masa liquidada, `ROUND(…, 2)` una vez), `v_gasto_rubro_periodo` (ventana de doce filas anteriores por consorcio y rubro, `promedio_movil_12` **nulo con menos de doce**, `desvio_porcentual` `ROUND(…, 1)` al final), `v_desempeno_proveedor`, `v_resolucion_reclamos` (`percentile_cont(0.5)` y `percentile_cont(0.9)` sobre horas), `v_precision_asistencia`; cada una con su **índice único** para `REFRESH … CONCURRENTLY` (`FR-017`, `FR-019`, `FR-020`, research R-11)
- [X] T017 Crear la **migración de datos** que inserta un `TrabajoPendiente` de tipo `notificacion` por cada `Notificacion` en `pendiente` sin trabajo: es lo que SC-007 verifica como cero avisos perdidos entre etapas (research R-07)
- [X] T018 Correr `npm run db:deploy` y `npm run db:drift` en verde, y agregar a `pruebas/integracion/ayudas.ts` la limpieza de las tablas nuevas en el orden de las claves foráneas

### Puertos y avisos

- [X] T019 [P] Declarar las cuatro interfaces en `src/dominio/contratos/asistencia.ts` exactamente como `contracts/asistencia.md`: `Resultado<T>`, `ExtractorDocumental`, `ClasificadorTexto`, `GeneradorVectores` (`dimensiones: 768`), `GeneradorRespuesta`, y los tipos de entrada y salida, sin `number` para dinero
- [X] T020 [P] Extender `Notificador` en `src/dominio/contratos/notificador.ts` con `enviarNotificacion({ destino, titulo, cuerpo })` e implementarlo en `src/infraestructura/correo/resend.ts`
- [X] T021 Escribir `notificar` en `src/aplicacion/comunicacion/notificar.ts`: recibe la transacción, crea la `Notificacion` y su `TrabajoPendiente` `{ notificacionId }` **en esa transacción** (research R-07); y el manejador `notificacion` en `src/aplicacion/pendientes/manejadores.ts` que busca la fila, envía por el puerto y marca `enviada_en` y `estado_envio`
- [X] T022 Reemplazar en `src/aplicacion/liquidacion/liquidar.ts` la creación directa de `Notificacion` por `notificar`, sin cambiar el contrato de `003`
- [X] T023 Escribir `pruebas/integracion/despachador.spec.ts`: las notificaciones en `pendiente` sin trabajo quedan encoladas tras la migración y salen al drenar (SC-007); con un `Notificador` que lanza, la notificación queda `pendiente` con reintento y **la operación de negocio que la creó no falla** (SC-008, `FR-014`)
- [X] T024 [P] Extender `pruebas/fixtures/juego-13-4.ts` y `scripts/semilla.mjs` con dos espacios comunes por consorcio (SUM de 40 personas y quincho de 25, reglas por omisión), los reclamos de `datos-cliente/juego-ficticio-13-4/reclamos.csv` con su historial, y el reglamento de `datos-cliente/reglamento/reglamento-copropiedad.md` como `DocumentoConsorcio` del consorcio de 12 unidades (el PDF se genera con el renderizador de `003`); determinística como siempre

**Checkpoint**: el esquema soporta la etapa entera, la auditoría registra, y cualquier alta de aviso ya sale por correo

---

## Phase 3: User Story 1 — Las pruebas de concepto deciden qué se construye (P1) ✅ HECHA

**Goal**: medir antes de construir. **Ejecutada antes de este plan**: `poc/`, `datos-cliente/`,
`poc/resultados/`, § 14.3 decidido.

- [X] T025 [US1] PoC de extracción sobre 30 comprobantes: **149/150 campos = 99,3 %** contra el umbral del 80 % (`poc/resultados/extraccion-gemini-consolidado.json`, `FR-001`, SC-001)
- [X] T026 [US1] PoC de búsqueda semántica sobre 72 artículos y 20 preguntas: **20/20 = 100 %** contra el 85 %, con línea de base léxica de 16/20 (`poc/resultados/busqueda-gemini.json`)
- [X] T027 [US1] § 14.3 escrito con tabla comparativa, decisión y justificación; PI-01 y PI-06 en § 15.2.3; detonantes RT-02 y RT-03 verificados en § 11.6 (`FR-003`, SC-002)
- [ ] T028 [US1] Descartar el código de la PoC al cerrar la etapa (`FR-004`, escenario 5): mover `poc/resultados/` a `datos-cliente/poc-resultados/`, borrar `poc/` y su entrada en `eslint.config.mjs`, `.prettierignore` y `.gitignore`; los archivos de `datos-cliente/comprobantes/archivos/` quedan, porque son datos y no código

---

## Phase 4: User Story 2 — El consorcista abre un reclamo y lo sigue hasta el cierre (P1) 🎯 MVP

**Goal**: `CU-07` y `CU-08` completos con historial, aviso en cada transición y RN-11 impuesta por la base.

**Independent Test**: abrir un reclamo, recorrer todas las transiciones, verificar que el historial las contiene todas y que otro consorcio responde «no encontrado».

### Tests for User Story 2 ⚠️ la máquina de estados se escribe primero

- [X] T029 [P] [US2] Escribir `pruebas/dominio/reclamos/estado.spec.ts` sin base: cada transición válida de la tabla de `data-model.md` pasa y cada una ausente es rechazada con mensaje; `rechazado` no tiene salida; `cerrado → abierto` es la reapertura
- [X] T030 [P] [US2] Escribir `pruebas/integracion/reclamos.spec.ts`: recorrer `abierto → asignado → en_curso → resuelto → cerrado → abierto` y contar **un asiento por transición más el de creación** (SC-003); un `UPDATE` directo con `prismaBase` a `asignado` sin responsable es rechazado **por la base** (SC-004); un usuario de otro consorcio obtiene «No encontramos lo que buscabas» por identificador (RN-12); cada transición deja notificaciones al autor y al responsable; la reapertura resuelta de nuevo sobrescribe `fecha_resolucion`

### Implementation for User Story 2

- [X] T031 [US2] Implementar `src/dominio/reclamos/estado.ts`: tabla de transiciones pura y `transicionValida(desde, hacia)`, sin importar nada (research R-09)
- [X] T032 [US2] Implementar `registrarReclamo` en `src/aplicacion/reclamos/registrar.ts`: autoriza consorcista sobre unidad ocupada o área común, crea en `abierto` sin responsable, escribe el asiento `null → abierto` y encola `triage_reclamo` (el manejador llega en US6; hasta entonces el trabajo queda pendiente sin manejador, como permite `drenar`)
- [X] T033 [US2] Implementar `transicionar` en `src/aplicacion/reclamos/transicionar.ts`: valida con el dominio, exige responsable fuera de `abierto`, escribe estado, `fecha_resolucion` e historial en **una** transacción, y llama a `notificar` para autor y responsable con tipo `cambio_estado_reclamo` (`contracts/casos-de-uso.md`); es el **único** camino que cambia `estado`
- [X] T034 [US2] Implementar `asignar` y `vincularGasto` en `src/aplicacion/reclamos/asignar.ts` (`FR-008`); `asignar` pasa por `transicionar` cuando el reclamo está `abierto`
- [X] T035 [US2] Implementar `listarReclamos` y `verReclamo` en `src/aplicacion/reclamos/consultar.ts` según rol: administrador y consejo todo el consorcio; consorcista los propios y los de alcance `general`; `verReclamo` incluye historial ordenado y sugerencia si existe
- [X] T036 [US2] Pantalla de bandeja en `src/app/(panel)/reclamos/page.tsx` con filtro por estado y urgencia, cards a 390 px como las de consorcios, y acción de alta en modal `src/app/(panel)/reclamos/modal-reclamo.tsx` (`FR-005`)
- [X] T037 [US2] Pantalla de detalle en `src/app/(panel)/reclamos/[id]/page.tsx` con historial, acciones de transición según rol y estado (`src/app/(panel)/reclamos/[id]/acciones.tsx`), asignación de responsable, proveedor y rubro, y vínculo a gasto; mensajes de RNF-10 cuando la base rechaza
- [X] T038 [US2] Escribir `pruebas/e2e/reclamos.spec.ts`: un consorcista abre un reclamo desde el teléfono, el administrador lo asigna y lo mueve hasta cerrado, el consorcista ve el historial completo; y agregar reclamo a `pruebas/e2e/a11y.spec.ts` a 390 px sin desplazamiento horizontal (SC-020)

**Checkpoint**: reclamos completos; I-4 ya tiene datos que medir

---

## Phase 5: User Story 3 — El administrador ve el panel de indicadores y decide (P1)

**Goal**: los seis indicadores sobre vistas materializadas, con alertas, bajo 2 s, sin herramienta externa. Requisito obligatorio de la cátedra: **no se recorta**.

**Independent Test**: con § 13.4 y doce períodos liquidados, cada indicador coincide con el cálculo manual (`npm run validar:indicadores`).

### Tests for User Story 3

- [X] T039 [P] [US3] Escribir `pruebas/integracion/indicadores.spec.ts`: con dos consorcios y datos conocidos, `v_morosidad_consorcio` y `v_gasto_rubro_periodo` devuelven los valores calculados a mano en la prueba, **en `Decimal` con tolerancia cero** (SC-022); con once períodos el promedio móvil es `NULL`; `v_resolucion_reclamos` da mediana y p90 sobre tres reclamos con tiempos conocidos (`FR-020`); un usuario sin habilitación sobre un consorcio no ve sus filas (RN-12, `FR-021`)
- [X] T040 [P] [US3] Extender esa prueba: la lectura del repositorio de indicadores **sin consorcio activo** lanza en vez de devolver todo (research R-11), y el consorcista no accede al panel (SC-011, escenario 5)

### Implementation for User Story 3

- [X] T041 [US3] Implementar `src/infraestructura/repositorios/indicadores.ts`: una función por vista con SQL parametrizado que exige `consorcioActivo()` o recibe la lista explícita de consorcios habilitados para I-6; `refrescarVistas()` con `REFRESH MATERIALIZED VIEW CONCURRENTLY` de las cinco y registro de la hora; todo importe sale como cadena
- [X] T042 [US3] Implementar los casos de uso en `src/aplicacion/indicadores/`: `verPanel` (I-6, sobre las habilitaciones vigentes del usuario), `verMorosidad` (I-1, con alertas > 15 % y +3 puntos en dos meses), `verGastoPorRubro` (I-2, desvíos > 30 % destacados, «historia insuficiente» con promedio nulo, rubros recurrentes sin gasto), `verProveedores` (I-3), `verResolucionReclamos` (I-4, meta 72 h), `verCargaAdministrativa` (I-5, línea de base 38 h), `refrescarVistas` (`FR-023`, `contracts/casos-de-uso.md`)
- [X] T043 [US3] Componentes de gráfico en `src/app/(panel)/indicadores/graficos.tsx` como componentes de cliente con Recharts: serie de tiempo con línea de referencia, barras apiladas, dispersión, barras con meta; cada uno con su **tabla accesible** debajo con los mismos datos como cadena (research R-12, RNF-11)
- [X] T044 [US3] Pantallas: panel `src/app/(panel)/indicadores/page.tsx` (I-6 con hora del último refresco y botón «actualizar ahora») y una página por indicador en `src/app/(panel)/indicadores/{morosidad,gastos,proveedores,reclamos,carga}/page.tsx`; el detalle de I-1 enlaza a la morosidad de `003`, que ya aplica RN-13
- [X] T045 [US3] Ruta de la tarea programada en `src/app/api/tareas/refrescar-vistas/route.ts` protegida por `CRON_SECRET`, y `vercel.json` con la corrida diaria a las 04:00 (`FR-018`, research R-11); `scripts/refrescar-vistas.mjs` para correrla a mano
- [X] T046 [US3] Escribir `scripts/validar-indicadores.mjs` (SC-009): sobre § 13.4 con doce períodos liquidados —`semilla:volumen`—, recalcula los seis indicadores en JavaScript con `decimal.js` a partir de las tablas base y los compara con las vistas, con tolerancia cero; imprime cada diferencia
- [X] T047 [US3] Medir `npm run medir:p95 /indicadores` sobre el volumen de `semilla:volumen` (SC-010, RNF-06): 100 cargas, percentil 95 bajo 2 s; registrar el resultado en `docs/entrega-final/15-pruebas.md` `PR-0n` y declarar que estado de cuenta, reclamos y reservas quedan fuera del presupuesto verificado (I-07)
- [X] T048 [US3] Escribir `pruebas/e2e/indicadores.spec.ts`: el administrador ve el panel con las alertas de la semilla; un consorcista que navega a `/indicadores` es redirigido; agregar el panel a `pruebas/e2e/a11y.spec.ts`

**Checkpoint**: el requisito obligatorio de la cátedra está cumplido y medido

---

## Phase 6: User Story 4 — El consorcista reserva un espacio común (P2)

**Goal**: `CU-09`: espacios con reglas, reservas sin superposición **por la base**, sin deuda vencida.

**Independent Test**: dos reservas superpuestas del mismo espacio, la segunda rechazada por la base; una reserva con deuda vencida rechazada con causa.

### Tests for User Story 4

- [X] T049 [P] [US4] Escribir `pruebas/integracion/reservas.spec.ts`: dos `INSERT` **concurrentes** con `prismaBase` —saltando la aplicación— sobre el mismo espacio y rango dejan exactamente una `confirmada` y el otro falla con `23P01` (SC-005); una unidad con deuda vencida del juego de `003` recibe «la unidad tiene deuda vencida» y no se inserta nada (SC-006); una reserva `cancelada` no bloquea el rango; cada cambio de estado deja `Notificacion` al solicitante; otro consorcio no ve la reserva (RN-12); la reserva deja asiento de auditoría (SC-021)

### Implementation for User Story 4

- [X] T050 [US4] Exportar `saldoImpagoPorUnidad` desde `src/aplicacion/pagos/estado-de-cuenta.ts` sin cambiar su comportamiento, para que reservas lo consuma (`FR-011`)
- [X] T051 [US4] Implementar `administrarEspacio` en `src/aplicacion/reservas/espacios.ts`: alta y modificación con las reglas de `data-model.md`; la baja lógica pone `activo = false`, cancela las reservas futuras y las notifica (caso límite de la spec)
- [X] T052 [US4] Implementar `reservar`, `cancelarReserva` y `listarReservas` en `src/aplicacion/reservas/reservar.ts`: verifica deuda vencida, anticipación mínima y máxima, duración máxima, tope mensual por unidad y capacidad; inserta en `confirmada`; traduce `23P01` a «ese horario ya está reservado» (RNF-10); `notificar` con `reserva_confirmada` o `reserva_rechazada` (`contracts/casos-de-uso.md`)
- [X] T053 [US4] Pantallas: `src/app/(panel)/espacios/page.tsx` con modal de alta y edición para el administrador; `src/app/(panel)/reservas/page.tsx` con vista por espacio y día, reservas existentes sin nombre para el consorcista (sólo unidad), alta en modal `modal-reserva.tsx` con `<input type="datetime-local">`, y cancelación
- [X] T054 [US4] Extender la semilla de T024 si hace falta con dos reservas confirmadas en el consorcio de 12 para la demostración, y escribir `pruebas/e2e/reservas.spec.ts` desde el teléfono: reservar, ver el rechazo por superposición con el mensaje legible, cancelar; agregar reserva a `pruebas/e2e/a11y.spec.ts` (SC-020)

**Checkpoint**: reservas completas

---

## Phase 7: User Story 5 — Avisos, novedades y documentación (P2)

**Goal**: `CU-12` y `CU-15`: el despachador tiene su pantalla, se publican novedades y se carga documentación con visibilidad e indexación diferida (la indexación con vectores se completa en US6; acá el documento se sube, se lista y se descarga).

**Independent Test**: publicar una novedad y ver el aviso encolado y despachado; cargar un documento no visible y comprobar que el consorcista no lo ve.

### Tests for User Story 5

- [X] T055 [P] [US5] Escribir `pruebas/integracion/comunicacion.spec.ts`: publicar una novedad crea una `Notificacion` con trabajo por cada usuario habilitado del consorcio y ninguna para otro consorcio; un documento con `visible_consorcistas = false` no aparece en `listarDocumentos` del consorcista y sí en la del administrador y el consejo (escenario 4); el documento nace en `pendiente` con su trabajo `indexar_documento`

### Implementation for User Story 5

- [X] T056 [US5] Implementar `despacharNotificaciones` en `src/aplicacion/comunicacion/despachar.ts` acotado a 20 s como los documentos de `003`, y la pantalla `src/app/(panel)/pendientes/page.tsx` con el estado de la cola (pendientes, agotados, último error) y el botón «enviar avisos ahora» (`FR-012`)
- [X] T057 [US5] Implementar `publicarNovedad` y `listarNovedades` en `src/aplicacion/comunicacion/novedades.ts` (`FR-015`), y la pantalla `src/app/(panel)/novedades/page.tsx` con modal de publicación para el administrador y listado con fijadas primero
- [X] T058 [US5] Generalizar `pedirPermisoDeSubida` de `src/aplicacion/gastos/comprobantes.ts` a un prefijo por uso (`comprobantes/`, `documentos/`, `extracciones/`) sin cambiar el contrato de `002`, y ampliar la ruta `src/app/api/comprobantes/permiso/route.ts` o crear `src/app/api/objetos/permiso/route.ts` para los otros dos prefijos, con la misma validación de tipo (`application/pdf`) y tamaño
- [X] T059 [US5] Implementar `cargarDocumento`, `listarDocumentos` y `verDocumento` en `src/aplicacion/comunicacion/documentos.ts` (`FR-016`): al confirmar la subida crea `DocumentoConsorcio` en `pendiente` y encola `indexar_documento`; lectura por enlace firmado; el consorcista sólo ve `visible_consorcistas`
- [X] T060 [US5] Pantalla `src/app/(panel)/documentos/page.tsx`: listado por tipo con estado de indexación legible («indexando», «listo», «no se pudo indexar: motivo»), carga con subida directa y marca de visibilidad, descarga
- [X] T061 [US5] Escribir `pruebas/e2e/comunicacion.spec.ts`: el administrador publica una novedad y el consorcista la ve; carga un documento no visible y el consorcista no lo ve; el botón de avisos despacha lo pendiente

**Checkpoint**: todo lo que el consorcio le dice al consorcista, dicho

---

## Phase 8: User Story 6 — Las funciones asistidas ayudan y nunca deciden (P3)

**Goal**: `CU-13`, `CU-14`, `CU-10` sobre las cuatro interfaces con sus tres implementaciones. Primera candidata a recorte si el plazo se comprime (§ 11): se construye **después** del panel.

**Independent Test**: con el servicio deshabilitado las tres funciones degradan sin bloquear nada; con preguntas sin respuesta en la documentación, el sistema no inventa.

### Tests for User Story 6

- [X] T062 [P] [US6] Escribir `pruebas/integracion/asistencia-implementaciones.spec.ts`: lista `src/infraestructura/asistencia/` y afirma **exactamente tres** archivos, cada uno exportando las cuatro interfaces (SC-012); la nula devuelve `disponible: false` en los cuatro métodos sin lanzar; la determinista es idempotente (mismo texto, mismo vector)
- [X] T063 [P] [US6] Escribir `pruebas/dominio/documentos/fragmentar.spec.ts` sin base: un texto con «Art. 1.» a «Art. 5.» da cinco fragmentos con su número de página; un texto sin artículos se agrupa por párrafos de hasta ~1.000 caracteres con el último párrafo repetido; un documento vacío da cero fragmentos sin error
- [X] T064 [P] [US6] Escribir `pruebas/integracion/extraccion.spec.ts` con la determinista: una extracción `propuesta` sobre un PDF de `datos-cliente/comprobantes/archivos/` precarga los cinco campos como cadena; `confirmarExtraccion` crea `Gasto` y `Comprobante` en una transacción y marca `corregida` con `campos_corregidos = ["importe"]` cuando la persona cambió el importe; **cero** filas de `Gasto` con `ExtraccionComprobante` sin `confirmada_por` (SC-017); con la nula la extracción queda `no_disponible` y el formulario vacío (SC-013); una salida fuera de esquema equivale a no disponible (PI-04)
- [X] T065 [P] [US6] Escribir `pruebas/integracion/consulta-documental.spec.ts` con la determinista y el reglamento de la semilla: una pregunta con respuesta devuelve citas `{ documento, pagina, fragmento }` (SC-014); **diez** preguntas sin respuesta en el reglamento dan `sin_respaldo = true` y respuesta nula (SC-015); una pregunta del consorcista sobre un documento no visible o de otro consorcio da `sin_respaldo` y la prueba afirma, con un `GeneradorRespuesta` espía, que **ningún fragmento ajeno llegó al generador** (SC-016, `FR-029`); con la nula, `consultarDocumentacion` devuelve la lista de documentos para descargar (SC-013)
- [X] T066 [P] [US6] Escribir `pruebas/integracion/triage.spec.ts`: el trabajo `triage_reclamo` crea una `SugerenciaReclamo` con proveedor **dentro** de los del consorcio o nulo; `aplicarSugerencia` copia rubro, urgencia y proveedor y marca `aceptada = true` **sin cambiar el estado** (`FR-027`); `descartarSugerencia` marca `false`; con la nula el reclamo se crea sin sugerencia (PI-09)

### Implementation for User Story 6

- [X] T067 [US6] Implementar `src/infraestructura/asistencia/nula.ts`: las cuatro interfaces devolviendo `{ disponible: false, motivo }` con motivos legibles (RNF-10, RNF-14)
- [X] T068 [P] [US6] Implementar `src/infraestructura/asistencia/determinista.ts` según la tabla de `contracts/asistencia.md`: regex de CUIT, fecha e importe tras «total»; rubro y urgencia por palabras clave; bolsa de palabras proyectada a 768 por hash; respuesta que cita el fragmento con más palabras en común si comparte al menos dos
- [X] T069 [P] [US6] Implementar `src/infraestructura/asistencia/gemini.ts` con `@google/genai`: `extraer` y `clasificar` con salida estructurada por esquema JSON y `temperature 0`; `vectorizar` con `gemini-embedding-001`, `outputDimensionality 768`, `taskType` según tipo, lotes de 20; `responder` con fragmentos numerados y salida `{ respuesta, citas, sinRespaldo }`; modelos por `GEMINI_MODELO*`; un reintento ante 429/503 y después `disponible: false`; validación Zod de cada salida (research R-01, PI-04)
- [X] T070 [US6] Elegir la implementación en `src/aplicacion/dependencias.ts` (`ASISTENCIA`): `FLAY_ASISTENCIA=determinista` → determinista; `GEMINI_API_KEY` → proveedor; si no → nula (research R-02)
- [X] T071 [US6] Implementar `src/dominio/documentos/fragmentar.ts` puro (por artículos si los hay, si no por párrafos con solapamiento) y `src/infraestructura/documentos/texto-pdf.ts` con `unpdf` devolviendo `{ pagina, texto }[]` (research R-05)
- [X] T072 [US6] Implementar `src/infraestructura/repositorios/fragmentos.ts`: `guardarFragmentos(documentoId, fragmentos, vectores)` con `createMany` más `UPDATE … SET vector = $1::vector` por fila, y `buscar(pregunta: number[], { visiblesParaConsorcistas })` como **la única** consulta vectorial, con `consorcio_id` de `consorcioActivo()` y la visibilidad en el `WHERE` antes del `ORDER BY vector <=> $1`, piso 0,55, límite 6; lanza sin consorcio activo (research R-06, `FR-029`)
- [X] T073 [US6] Implementar el manejador `indexar_documento` en `src/aplicacion/pendientes/manejadores.ts`: baja el objeto, calcula `hash_sha256`, extrae texto, fragmenta, vectoriza en lotes, guarda; `estado_indexacion` `procesando → indexado`, o `error` con `error_indexacion` legible cuando el generador de vectores no está disponible (`FR-030`); reintento por la cola
- [X] T074 [US6] Implementar `consultarDocumentacion` en `src/aplicacion/comunicacion/consultar.ts` según `contracts/casos-de-uso.md`: vectoriza, recupera con el rol, responde, persiste `ConsultaDocumental` con `sin_respaldo` cuando no hay fragmentos, no hay citas o el servicio no respondió; degradación a listado y descarga (`FR-028`, SC-014, SC-015)
- [X] T075 [US6] Pantalla de consulta en `src/app/(panel)/documentos/consultar/page.tsx`: pregunta, respuesta con citas enlazadas al documento y página, «no lo encontramos en la documentación cargada» como respuesta legítima, valoración `util`, y el modo degradado dicho con sus palabras
- [X] T076 [US6] Implementar `iniciarCargaAsistida`, `verExtraccion`, `confirmarExtraccion` y `descartarExtraccion` en `src/aplicacion/gastos/extraccion.ts` (`FR-026`, research R-03, R-04): la confirmación crea `Gasto` con los valores enviados por la persona y `Comprobante` con `clave_objeto`, en una transacción, y calcula `campos_corregidos` por diferencia con lo propuesto
- [X] T077 [US6] Implementar el manejador `extraccion_comprobante` en `src/aplicacion/pendientes/manejadores.ts`: baja el objeto, llama al extractor con la lista de rubros, valida, escribe `propuesta` o `no_disponible` con `procesado_en`
- [X] T078 [US6] Pantalla `src/app/(panel)/gastos/asistida/page.tsx`: subida directa del comprobante suelto, estado «extrayendo…» con recarga, y al estar `propuesta` abre el formulario de `002` (`src/app/(panel)/gastos/nuevo/formulario.tsx`) con `precargado` y la etiqueta «Precargado: revisar antes de confirmar» que ya existe; confirmar llama a `confirmarExtraccion`; el comprobante se muestra al lado del formulario (PI-05)
- [X] T079 [US6] Implementar el manejador `triage_reclamo` y `aplicarSugerencia` / `descartarSugerencia` en `src/aplicacion/reclamos/sugerencia.ts` (research R-10), y mostrar la sugerencia aparte en `src/app/(panel)/reclamos/[id]/page.tsx` con «aplicar» y «descartar»
- [X] T080 [US6] Escribir `pruebas/e2e/asistencia.spec.ts` con la determinista: carga asistida hasta el gasto confirmado, pregunta con cita, pregunta sin respaldo, sugerencia aplicada; y con `FLAY_ASISTENCIA` vacío en un proyecto de Playwright aparte, las tres degradaciones con sus mensajes (SC-013)
- [X] T081 [US6] Verificación manual contra el proveedor real según la última tabla de `quickstart.md`, con el resultado (incluida latencia observada) registrado en `docs/entrega-final/15-pruebas.md` `PI-02`, `PI-03`, `PI-07`, `PI-08`

**Checkpoint**: las tres funciones asistidas ayudan y ninguna decide

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: exportación abierta, cierre documental de los puntos 13 a 18 y la puerta completa

- [X] T082 [P] Implementar `src/compartido/csv.ts` (BOM, separador `;`, escape de comillas) y la ruta `src/app/api/exportar/[consorcio]/[tabla]/route.ts` para `gastos`, `liquidaciones` y `pagos` con sesión, habilitación vigente y 404 para otro consorcio; importes como cadena; botón «exportar» en cada listado (`FR-032b`, research R-13)
- [X] T083 [P] Escribir `pruebas/integracion/exportar.spec.ts`: el CSV de un consorcio suma lo mismo que su liquidación en `Decimal`; otro consorcio da 404; sin sesión da 401
- [X] T084 Escribir `scripts/exportar-verificar.mjs` (SC-018): baja los tres CSV del consorcio de 12 contra el entorno desplegado y cuadra el total con la liquidación vigente
- [X] T085 Escribir `pruebas/integracion/auditoria-servicios.spec.ts`: alta y cambio de `Reclamo`, `Reserva` y `ExtraccionComprobante` dejan exactamente un asiento con anterior y posterior (SC-021, `FR-032`)
- [ ] T086 Registrar las tres condiciones de § 5.5.4 como verificadas en `docs/entrega-final/15-pruebas.md`: degradación ante terceros (SC-013 y SC-008), exportación abierta (SC-018), PoC de `RF-20` (US1) (`FR-033`)
- [ ] T087 [P] Completar `docs/entrega-final/15-pruebas.md` con el resultado real de `PA-01` a `PA-07`, `PI-01` a `PI-09`, `PR-01` a `PR-09` y `PN-01` a `PN-06`, nombrando la prueba automática o el guion que lo verifica (`FR-034`)
- [ ] T088 [P] Actualizar `docs/entrega-final/13-prototipo.md` § 13.3 (estado por módulo al cierre), § 13.5 (accesos) y § 13.7 (limitaciones: depósitos, baja de documentos, HEIC/TIFF, sólo PDF indexable), y § 13.4 con el hash de la semilla (SC-019, `FR-035`)
- [ ] T089 [P] Actualizar `docs/entrega-final/14-codificacion.md` § 14.5 con el esfuerzo real contra las 243 h y § 14.3 «Verificación de la reemplazabilidad» apuntando a `src/infraestructura/asistencia/` y a la prueba de SC-012
- [ ] T090 [P] Escribir `docs/entrega-final/16-manual-usuario.md` por rol (administrador, consejo, consorcista) sobre las pantallas reales, con capturas del entorno de demostración y la semilla ficticia
- [ ] T091 [P] Completar `docs/entrega-final/17-cronograma-capacitacion.md` con fechas y evaluación, y `docs/entrega-final/18-seguridad.md` con lo que quedó «a verificar»: gestión de secretos efectiva (`GEMINI_API_KEY`, `CRON_SECRET`), revisión de dependencias, y la auditoría externa como puerta de producción
- [ ] T092 [P] Registrar en `CLAUDE.md` lo que un recién llegado no puede adivinar de esta etapa: el comprobante suelto vive en la extracción, las dos consultas SQL fuera de la extensión de aislamiento, la abstención la decide el generador y no el umbral, y la cola absorbe cuatro tipos de trabajo
- [ ] T093 Actualizar las tablas de estado de `docs/README.md` y `README.md`: puntos 13 a 18 completos
- [ ] T094 Correr `npm run verificar` completo, local y remoto, y confirmar que sigue bajo los diez minutos con las pruebas nuevas
- [ ] T095 Ensayar el guion de demostración de § 13.1 (8 pasos, `CU-07` a `CU-15`) sobre el entorno desplegado con la semilla ficticia y `GEMINI_API_KEY` de producción, sin ningún paso desde una máquina de desarrollo (SC-019)
- [ ] T096 Ejecutar T028 (descartar `poc/`), abrir el pull request con revisión cruzada y etiquetar el cierre de la iteración 3 con versión semántica (§ 8.3.5)

---

## Dependencies & Execution Order

- Setup (T001-T004) → Foundational (T005-T024) **bloquea todo** → US2 (T029-T038) → US3 (T039-T048) → US4 (T049-T054) → US5 (T055-T061) → US6 (T062-T081) → Polish (T082-T096)
- **US1 está hecha** (T025-T027); T028 se ejecuta al final porque los guiones de `poc/` sirven hasta la verificación manual de T081.
- **US3 depende de US2** sólo para tener datos en I-3 e I-4: las vistas se pueden crear antes, la validación de SC-009 necesita los reclamos de la semilla.
- **US4 y US5 son independientes entre sí y de US3**: con dos personas, una toma US3 y la otra US4 + US5.
- **US6 depende de US2** (triage sobre reclamos) **y de US5** (consulta sobre documentos cargados y el permiso de subida generalizado en T058).
- La exportación (T082-T084) no depende de ninguna historia: puede hacerse en cualquier hueco.

### Orden de recorte (§ 11)

Si el plazo se comprime, se recorta **US6 entera** (paquetes 5.6 a 5.8, 59 h) y después las partes
no obligatorias de US5 (novedades). **Nunca** US3. Las interfaces y la implementación nula (T019,
T067, T070) se construyen igual: son lo que permite que el sistema funcione sin proveedor.

### Paralelismo dentro de cada historia

- Foundational: T005-T012 son ocho bloques de `schema.prisma` que se escriben a la vez y se migran juntos en T014; T019, T020 y T024 en paralelo con lo anterior.
- US6: las cinco pruebas T062-T066 y las tres implementaciones T067-T069 son archivos distintos; T069 (proveedor) puede quedar para el final porque nada de la puerta automática lo necesita.

## Implementation Strategy

### MVP

Setup + Foundational + US2 + US3. Con eso el sistema tiene reclamos con historial y el **panel de
indicadores**, que es el requisito obligatorio de la cátedra, sobre el ciclo económico que `003`
cerró. Parar ahí y medir SC-009 y SC-010 antes de seguir.

### Entrega incremental

1. Setup + Foundational → el esquema aguanta la etapa y los avisos de `003` salen
2. US2 → reclamos completos; I-4 tiene datos
3. US3 → **el requisito obligatorio, medido**: parar acá y mirar los seis indicadores contra el cálculo manual
4. US4 + US5 → reservas y comunicación, en paralelo con dos personas
5. US6 → las funciones asistidas, con la implementación nula ya operando desde Foundational
6. Polish → exportación, puntos 13 a 18, demostración sobre el desplegado, etiqueta
