# Tasks: 003-liquidacion

**Input**: Documentos de diseño de `/specs/003-liquidacion/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Tests**: **obligatorios y primero** en prorrateo, intereses e imputación (`FR-005`, § 8.3.3), con
cobertura del 100 % de ramas en ese paquete (SC-014). En el resto, la prueba acompaña al código.

**Organización**: por historia de usuario, para que cada una se pueda construir y probar sola.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: a qué historia pertenece (US1 a US4)

---

## Phase 1: Setup

**Purpose**: lo que hace falta antes de tocar el esquema

- [X] T001 Agregar a `package.json` los guiones `validar:planillas` y `medir:liquidacion`, apuntando a `scripts/validar-planillas.mjs` y `scripts/medir-liquidacion.mjs`, que se completan en T043 y T062
- [X] T002 [P] Confirmar que `npm run docs:versiones` pasa con `@react-pdf/renderer` 4.1.3, ya fijado en `docs/entrega-final/14-codificacion.md` § 14.1: esta etapa no agrega dependencias (plan, Technical Context)
- [X] T003 [P] Agregar el proyecto `dominio/liquidacion` a la configuración de cobertura de `vitest.config.ts` con umbral de **100 % de ramas** (SC-014); el resto del repositorio queda sin umbral

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: esquema, disparadores y puertos que **todas** las historias necesitan

**⚠️ CRÍTICO**: ninguna historia puede empezar hasta que esta fase esté terminada

- [X] T004 Agregar a `Consorcio` en `prisma/schema.prisma` los campos `dia_vencimiento SMALLINT` —**entre 1 y 28**, con `CHECK`, porque el 30 no existe en febrero— y `tasa_mora_mensual NUMERIC(6,4)` con omisión `0`, que es un consorcio que no cobra mora (`data-model.md`, `FR-002b`)
- [X] T005 Definir `Liquidacion` en `prisma/schema.prisma` con `consorcio_id`, `periodo_id`, los tres totales `NUMERIC(14,2)`, `vencimiento DATE`, `emitida_en`, `emitida_por`, `estado` enum `vigente`/`anulada` y `anula_a_id` nulo (`data-model.md`)
- [X] T006 Definir `DetalleLiquidacion` en `prisma/schema.prisma` con `coeficiente_aplicado NUMERIC(11,8)`, `importe_ordinario`, `importe_extraordinario`, `deuda_anterior`, `interes_mora`, `saldo_a_favor_aplicado`, `ajuste_redondeo` y `total_unidad` en `NUMERIC(14,2)`, `clave_documento` nulo, y `UNIQUE (liquidacion_id, unidad_id)`
- [X] T007 [P] Definir `InteresLiquidado` en `prisma/schema.prisma` con `detalle_id`, `liquidacion_origen_id`, `capital NUMERIC(14,2)`, `tasa_mensual NUMERIC(6,4)`, `meses SMALLINT` e `importe NUMERIC(14,2)` (research R-07)
- [X] T008 [P] Definir `Pago` en `prisma/schema.prisma` con `consorcio_id`, `unidad_id`, `fecha_pago DATE`, `importe`, `medio` enum `transferencia`/`efectivo`/`deposito`/`debito`, `referencia` nulo, `saldo_a_favor NUMERIC(14,2)` y `registrado_por` (`FR-026`, M-05)
- [X] T009 [P] Definir `PagoImputacion` en `prisma/schema.prisma` con `pago_id`, `detalle_liquidacion_id`, `importe_imputado NUMERIC(14,2)` y `revertida_en` nulo: la reversión **marca**, nunca borra (`FR-027`)
- [X] T010 [P] Definir `Notificacion` en `prisma/schema.prisma` con los campos del punto 7 —destinatario, tipo, título, cuerpo, entidad referida, `estado_envio` `pendiente`/`enviada`/`fallida`, marcas de envío y lectura— y **sin despachador** (`FR-015`, research R-08)
- [X] T011 Crear la migración con las seis tablas y el **índice único parcial** `CREATE UNIQUE INDEX ON "Liquidacion" (periodo_id) WHERE estado = 'vigente'`, escrito a mano: es el candado de la emisión doble (research R-03, SC-011)
- [X] T012 Enganchar `fn_auditar()` a `Liquidacion`, `DetalleLiquidacion`, `InteresLiquidado`, `Pago` y `PagoImputacion` en la misma migración; `Notificacion` queda afuera por no ser económica (regla RN-15 § 7.2, SC-012)
- [X] T013 Agregar `documento_expensa` al enum `TipoTrabajo` de `prisma/schema.prisma`, para que la cola de `002` transporte la generación diferida (research R-02)
- [X] T014 Extender el puerto `AlmacenObjetos` en `src/dominio/contratos/almacen-objetos.ts` con `guardar(clave, bytes, tipoContenido)`: el comprobante lo sube el navegador, pero el documento lo produce el servidor (research R-01)
- [X] T015 Implementar `guardar` en `src/infraestructura/objetos/blob.ts` contra el mismo almacén de los comprobantes
- [X] T016 [P] Extender `scripts/semilla.mjs` para que los dos consorcios de § 13.4 queden con `dia_vencimiento` y `tasa_mora_mensual`, y que la semilla siga siendo determinística

**Checkpoint**: el esquema soporta la etapa entera y la auditoría ya registra

---

## Phase 3: User Story 1 — El dominio calcula sin base de datos (P1) 🎯 MVP

**Goal**: prorrateo, interés e imputación como funciones puras, correctas y probadas al ras.

**Independent Test**: `npm run test:dominio` con `DATABASE_URL` sin definir ejercita padrones de 1,
12, 96 y 100 unidades y verifica la cuadratura con tolerancia cero (SC-002).

**Desvío deliberado**: la especificación ubica intereses en la historia 4, con los pagos. Acá van en
la 1 porque el interés se calcula **al emitir** (`FR-024b`), así que la historia 2 no puede existir
sin él. Es el mismo movimiento que `002` hizo con `Periodo`: cambia de historia, no de alcance.

### Tests for User Story 1 ⚠️ SE ESCRIBEN PRIMERO Y DEBEN FALLAR

- [ ] T017 [P] [US1] Escribir `pruebas/dominio/liquidacion/prorrateo.spec.ts`: padrones de 1, 12, 96 y 100 unidades; la suma de importes iguala el total con **tolerancia cero** (SC-001)
- [ ] T018 [P] [US1] Extender esa prueba: un padrón que suma `99.99999999` **aborta antes de calcular**, nombrando la diferencia exacta y las unidades (`FR-006`, SC-004)
- [ ] T019 [P] [US1] Extender esa prueba: la diferencia de redondeo va entera a la unidad de mayor coeficiente, en `ajusteRedondeo` y **no** sumada al importe; con coeficientes empatados gana el identificador menor (`FR-009`)
- [ ] T020 [P] [US1] Extender esa prueba: una diferencia **mayor a un centavo por unidad** aborta y deja incidente (`FR-010`, SC-003)
- [ ] T021 [P] [US1] Extender esa prueba: gastos ordinarios y extraordinarios producen **dos subtotales por unidad**, y el redondeo ocurre sólo al final de cada importe unitario (`FR-011`, `FR-008`)
- [ ] T022 [P] [US1] Escribir `pruebas/dominio/liquidacion/interes.spec.ts`: veintinueve días de atraso dan **cero**; sesenta dan dos meses **sobre el mismo capital**; tasa `0` da cero (`FR-024`, SC-014b)
- [ ] T023 [P] [US1] Extender esa prueba: con tres liquidaciones impagas el interés es la suma de **tres cálculos independientes** —tres, dos y un mes— y no dos meses sobre el total, y el desglose sale con capital, tasa y meses por fila (`FR-024`, `FR-025`)
- [ ] T024 [P] [US1] Extender esa prueba con el borde del calendario: de un vencimiento el 31 de enero, el 28 de febrero **no** completa el mes y el 1 de marzo sí (research R-05)
- [ ] T025 [P] [US1] Escribir `pruebas/dominio/liquidacion/imputacion.spec.ts`: un pago que cubre una liquidación y media se imputa **a la más antigua primero** y el remanente a la siguiente (regla RN-08 § 7.2, SC-009)
- [ ] T026 [P] [US1] Extender esa prueba: `suma(imputaciones) + sobrante = importe` con **tolerancia cero**, y un pago que excede la deuda deja todo el resto en `sobrante` (`FR-023`, `FR-026`)

### Implementation for User Story 1

- [ ] T027 [US1] Implementar `prorratear` en `src/dominio/liquidacion/prorrateo.ts` según `contracts/motor-liquidacion.md`, con `Importe` de `@/compartido/dinero` y **sin** importar nada de infraestructura (`FR-004`, research R-04)
- [ ] T028 [US1] Implementar `mesesCompletos` e `interesPorMora` en `src/dominio/liquidacion/interes.ts`, con aritmética de calendario nativa y sin dependencia nueva (research R-05)
- [ ] T029 [US1] Implementar `imputar` en `src/dominio/liquidacion/imputacion.ts` (research R-06)
- [ ] T030 [US1] Verificar que `npm run test:dominio` corre con `DATABASE_URL` sin definir y que la cobertura de `src/dominio/liquidacion` llega al **100 % de ramas** (SC-002, SC-014)
- [ ] T031 [P] [US1] Agregar a `pruebas/fixtures-negativas/` un caso que devuelva `number` desde una firma del motor, para que el verificador de tipos lo rechace y quede probado que lo rechaza (Principio II)

**Checkpoint**: el motor es correcto y se puede ejercitar mil veces sin base de datos

---

## Phase 4: User Story 2 — El administrador liquida y coincide con la planilla (P1)

**Goal**: la emisión completa, en una transacción, y la prueba de que el motor sirve.

**Independent Test**: cargar el padrón y los gastos de una de las tres planillas reales, ejecutar y
comparar importe por importe.

- [ ] T032 [US2] Implementar `cerrarPeriodo` en `src/aplicacion/liquidacion/periodos.ts`: `abierto → cerrado`, sólo `administrador`, y desde ahí ningún gasto se agrega ni se modifica (`FR-002`, regla RN-03 § 7.2)
- [ ] T033 [US2] Implementar `liquidarPeriodo` en `src/aplicacion/liquidacion/liquidar.ts` en **una sola transacción**, según `contracts/liquidacion-y-pagos.md`: verifica estado y coeficientes, llama al dominio, persiste por lote, pasa el período a `liquidado` (`FR-013`)
- [ ] T034 [US2] Aplicar en `liquidarPeriodo` el saldo a favor de la unidad **después** del interés, dejando rastro en `saldo_a_favor_aplicado` (`FR-026b`)
- [ ] T035 [US2] Encolar en `liquidarPeriodo` un `TrabajoPendiente` de tipo `documento_expensa` por unidad y crear las `Notificacion` en estado `pendiente`, sin despacharlas (`FR-015`)
- [ ] T036 [US2] Implementar `anularLiquidacion` en `src/aplicacion/liquidacion/anular.ts`: marca la liquidación, **no toca el período**, y revierte las imputaciones marcando `revertida_en` (`FR-003b`, `FR-027`)
- [ ] T037 [US2] Escribir `pruebas/integracion/liquidacion.spec.ts`: una falla inyectada en cualquier paso deja la base **exactamente como estaba** —cero liquidaciones a medias, cero períodos inconsistentes— (SC-010)
- [ ] T038 [US2] Extender esa prueba con la concurrencia de M-07: **dos ejecuciones en paralelo con barrera** contra el mismo período, exactamente una emite, y el rechazo lo produce el índice parcial y no el código (SC-011)
- [ ] T039 [US2] Extender esa prueba: después de anular, una reemisión **procede** aunque el período siga en `liquidado`, y las dos liquidaciones quedan registradas y vinculadas (`FR-003b`, regla RN-06 § 7.2)
- [ ] T040 [US2] Escribir `pruebas/integracion/auditoria-liquidacion.spec.ts`: cada operación sobre las **cinco** tablas económicas deja exactamente un asiento (SC-012)
- [ ] T041 [P] [US2] Construir `src/app/(panel)/periodos/[id]/page.tsx` con el cierre y la liquidación del período, y el rechazo diciendo **qué falta y cuánto** cuando los coeficientes no cierran (RNF-10, SC-004)
- [ ] T042 [P] [US2] Construir `src/app/(panel)/liquidaciones/[id]/page.tsx` con totales, vencimiento, detalle por unidad y la acción de anular
- [ ] T043 [US2] Escribir `scripts/validar-planillas.mjs`: carga `datos-cliente/liquidaciones-reales/padron-coeficientes.csv` y los `gastos-2026-NN.csv`, ejecuta la liquidación y compara **al centavo** contra los `planilla-2026-NN.csv`, incluido `ajuste_redondeo` (`FR-031`)
- [ ] T044 [US2] Correr `npm run validar:planillas` sobre los **tres** meses y explicar por escrito toda discrepancia: una discrepancia sin explicación es un defecto abierto, no una diferencia de criterio (`FR-032`, SC-005)

**Checkpoint**: el motor coincide con la planilla del cliente, que es la única evidencia que vale

---

## Phase 5: User Story 3 — El consorcista descarga su expensa (P2)

**Goal**: un documento por unidad, generado en diferido, accesible sólo por quien corresponde.

**Independent Test**: emitir sobre 96 unidades y verificar que aparecen 96 documentos, cada uno
alcanzable únicamente por los ocupantes de su unidad.

- [ ] T045 [US3] Definir el puerto `GeneradorDeDocumentos` en `src/dominio/contratos/documentos.ts`, con los datos del detalle como entrada y bytes como salida: el dominio no conoce el formato ni la biblioteca (Principio III)
- [ ] T046 [US3] Implementar `src/infraestructura/documentos/expensa.tsx` con `@react-pdf/renderer`, mostrando coeficiente aplicado, subtotal ordinario, subtotal extraordinario, **el desglose del interés**, ajuste de redondeo si lo hubo y total (`FR-017`)
- [ ] T047 [US3] Implementar el manejador del trabajo `documento_expensa` en `src/aplicacion/liquidacion/documentos.ts`: rendea, guarda con clave `expensas/<consorcio>/<liquidacion>/<unidad>.pdf` y escribe `clave_documento` (`FR-016`, research R-01)
- [ ] T048 [US3] Implementar `generarDocumentos` en el mismo archivo: disparo explícito acotado por tiempo, con progreso a la vista; una falla se reintenta y **no** invalida la liquidación emitida (`FR-019`, research R-02)
- [ ] T049 [US3] Implementar `verExpensa` en `src/aplicacion/liquidacion/ver-expensa.ts`: una unidad ajena responde **«no encontrado»**, nunca «prohibido» (`FR-018`, SC-008)
- [ ] T050 [P] [US3] Construir `src/app/(panel)/expensas/page.tsx` y `[unidad]/page.tsx` con la descarga, formateando los importes **a partir de las cadenas** que recibe y sin operar con ellos (`FR-020`)
- [ ] T051 [US3] Escribir `pruebas/integracion/documentos.spec.ts`: sobre 96 unidades aparecen **96** documentos y no falta ninguno; una falla inyectada en uno deja los otros 95 intactos y la liquidación válida (SC-007)
- [ ] T052 [P] [US3] Escribir `pruebas/e2e/expensa.spec.ts`: la descarga propia funciona a 390 px sin desplazamiento horizontal, y el identificador de otra unidad en la dirección devuelve «no encontrado» (SC-008, SC-016)
- [ ] T053 [P] [US3] Escribir `pruebas/e2e/expensa.a11y.spec.ts`: la pantalla de descarga sin infracciones de nivel A ni AA (SC-016, RNF-11)

**Checkpoint**: el consorcista tiene su expensa y no puede ver la del vecino

---

## Phase 6: User Story 4 — Pagos, imputación y morosidad (P2)

**Goal**: cerrar el ciclo económico con el pago imputado por antigüedad.

**Independent Test**: registrar un pago parcial que cubre una liquidación y media y verificar el
reparto y la suma con tolerancia cero.

- [ ] T054 [US4] Implementar `registrarPago` en `src/aplicacion/pagos/registrar.ts`: registra e imputa en la misma transacción, y el excedente queda en `Pago.saldo_a_favor` (`FR-021`, `FR-022`, `FR-026`)
- [ ] T055 [US4] Implementar `verEstadoDeCuenta` en `src/aplicacion/pagos/estado-de-cuenta.ts` con liquidaciones, pagos, imputaciones, **desglose de intereses** y saldo (`FR-028`)
- [ ] T056 [US4] Implementar `verMorosidad` en `src/aplicacion/pagos/morosidad.ts` como **dos consultas distintas**: la nominada para `administrador` y `consejo`, la agregada para `consorcista`, que no trae un solo nombre (`FR-029`, regla RN-13 § 7.2)
- [ ] T057 [P] [US4] Construir `src/app/(panel)/pagos/page.tsx` y `nuevo/page.tsx` con el alta y la imputación a la vista
- [ ] T058 [P] [US4] Construir `src/app/(panel)/morosidad/page.tsx`, que muestra lo que el rol permite y nada más
- [ ] T059 [US4] Escribir `pruebas/integracion/pagos.spec.ts`: la imputación por antigüedad, el excedente a favor, y la aplicación automática de ese saldo en la liquidación siguiente (`FR-026b`, SC-009, SC-014c)
- [ ] T060 [US4] Extender esa prueba: al anular una liquidación, sus imputaciones quedan **marcadas y no borradas**, y el pago vuelve a estar disponible (`FR-027`)
- [ ] T061 [P] [US4] Escribir `pruebas/e2e/morosidad.spec.ts`: un consorcista ve el dato agregado y **cero** nombres; un administrador ve la nómina (SC-015)

**Checkpoint**: el ciclo económico cierra y la nómina no se filtra

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T062 Escribir `scripts/medir-liquidacion.mjs` y correr `npm run medir:liquidacion` sobre el consorcio de **100 unidades**: cinco corridas, todas bajo **30 segundos**, sin contar documentos (SC-006, RNF-07)
- [ ] T063 [P] Medir la generación de los 96 documentos: menos de diez minutos, con progreso, reintento y alerta observables, y registrar el resultado (SC-007)
- [ ] T064 [P] Completar `docs/entrega-final/15-pruebas.md` con los casos `PL-01` a `PL-10` y su resultado real (`FR-033`)
- [ ] T065 [P] Actualizar `docs/entrega-final/13-prototipo.md` § 13.3 con el estado por módulo al cierre de la iteración 2, y § 13.5 si cambia el acceso
- [ ] T066 [P] Actualizar `docs/entrega-final/14-codificacion.md` § 14.5 con el esfuerzo real de la etapa contra las 194 h planificadas, con el mismo criterio declarado en la iteración 1
- [ ] T067 [P] Registrar en `CLAUDE.md` lo que un recién llegado no puede adivinar de esta etapa: el candado parcial, el desglose del interés y el disparo explícito de los documentos
- [ ] T068 Correr `npm run verificar` completo, local y remoto, y confirmar que sigue bajo los diez minutos con las pruebas nuevas
- [ ] T069 Ensayar el recorrido manual de `quickstart.md` sobre el entorno desplegado, sin ningún paso desde una máquina de desarrollo
- [ ] T070 Etiquetar el cierre de la iteración 2 con versión semántica, conforme a § 8.3.5

---

## Dependencies & Execution Order

- Setup (T001-T003) → Foundational (T004-T016) **bloquea todo** → US1 (T017-T031) → US2 (T032-T044) → US3 (T045-T053) → US4 (T054-T061) → Polish (T062-T070)
- **US2 depende de US1**: no se puede emitir sin motor. Es la única dependencia dura entre historias.
- **US3 y US4 dependen de US2**: el documento y la imputación necesitan detalles emitidos.
- **US3 y US4 son independientes entre sí** y se pueden hacer en paralelo con dos personas.

### Lo que se hace en pares

El paquete 4.2 —T027 a T030, el motor— se construye **en pares** (§ 10). Es el núcleo del negocio y
el único lugar del sistema con umbral de cobertura del 100 % de ramas.

### Paralelismo dentro de US1

Las diez pruebas T017 a T026 son de tres archivos distintos y no dependen entre sí: se pueden
escribir todas antes de implementar nada, que es exactamente lo que TDD pide.

## Implementation Strategy

### MVP

Setup + Foundational + US1 + US2. Con eso el sistema **liquida y coincide con la planilla del
cliente**, que es la condición de aceptación del entregable 2 (§ 6.4.1). Sin documento y sin pagos
todavía, pero con el riesgo RT-01 —el más grande del proyecto— ya retirado.

### Entrega incremental

1. Setup + Foundational → el esquema aguanta la etapa
2. US1 → el motor es correcto, probado mil veces sin base
3. US2 → **valida contra las tres planillas**: parar acá y mirar el resultado antes de seguir
4. US3 → el consorcista recibe su expensa
5. US4 → el ciclo económico cierra

### Dónde parar y mirar

Después de T044. Si el motor no coincide al centavo con las planillas, nada de lo que sigue importa:
lo que hay que hacer es entender la diferencia, no construir la pantalla siguiente.
