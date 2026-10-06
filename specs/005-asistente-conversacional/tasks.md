---
description: "Task list — Asistente conversacional (RF-27)"
---

# Tasks: Asistente conversacional (RF-27 / CU-16)

**Input**: Design documents from `/specs/005-asistente-conversacional/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/contratos.md, quickstart.md

**Tests**: incluidos. La spec define criterios verificables (SC-001…SC-007) y el plan compromete
pruebas de integración y e2e. TDD no es obligatorio aquí (no es núcleo económico), pero las
pruebas de aislamiento, minimización, gating e idempotencia son condición de terminado.

**Organization**: por historia de usuario. US1 es el MVP (asistente de solo lectura, scopeado).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede ir en paralelo (archivo distinto, sin dependencias pendientes)
- **[Story]**: US1..US4 (ver spec.md)

---

## Phase 1: Setup

- [ ] T001 [P] Agregar a `.env.example` la variable opcional `GEMINI_MODELO_AGENTE` (modelo de texto para el agente) con un comentario; no tocar el resto.
- [ ] T002 Crear la carpeta `src/aplicacion/asistente/` y `src/app/(panel)/consorcios/[consorcio]/asistente/` (vacías, se llenan en fases siguientes).

---

## Phase 2: Foundational (bloquea todas las historias)

**⚠️ Ninguna historia puede empezar hasta terminar esta fase.**

### Contrato del dominio y las tres implementaciones (Principio IV)

- [ ] T003 Ampliar `src/dominio/contratos/asistencia.ts`: agregar `HerramientaDisponible`, `TurnoConversacion`, `AccionDelAgente`, `interface AgenteConversacional` y sumar `agente: AgenteConversacional` a `interface Asistencia` (firmas exactas en `contracts/contratos.md §1`).
- [ ] T004 [P] Implementar `agente` en `src/infraestructura/asistencia/determinista.ts`: ruteo por palabra clave a una `AccionDelAgente` fija (mapa en `contracts/contratos.md §Contrato de pruebas`); sin red. Es la que corren las pruebas.
- [ ] T005 [P] Implementar `agente` en `src/infraestructura/asistencia/nula.ts`: siempre `noDisponible(...)` con mensaje legible (degradación).
- [ ] T006 [P] Implementar `agente` en `src/infraestructura/asistencia/gemini.ts`: function calling con `@google/genai`, `temperature: 0`, `conReintento`, modelo `GEMINI_MODELO_AGENTE` (por defecto el de texto). Único archivo que importa el SDK.
- [ ] T007 Cablear `ASISTENCIA.agente` en `src/aplicacion/dependencias.ts` dentro de `resolverAsistencia()` (determinista / gemini / nula), igual que las otras capacidades.

### Persistencia (data-model.md)

- [ ] T008 Agregar a `prisma/schema.prisma` los modelos `ConversacionAsistente` (campos `id`, `consorcioId` FK, `usuarioId` FK, `creadaEn @default(now())`, `actualizadaEn @updatedAt`, relación `mensajes`, `@@index([consorcioId, usuarioId, actualizadaEn])`) y `MensajeAsistente` (`id`, `conversacionId` FK `onDelete: Cascade` **sin** `consorcioId`, `rol RolMensaje`, `contenido`, `herramienta Json?`, `propuesta Json?`, `estadoPropuesta EstadoPropuesta?`, `creadoEn @default(now())`, `@@index([conversacionId, creadoEn])`) y los enums `RolMensaje (usuario|asistente|herramienta)` y `EstadoPropuesta (pendiente|confirmada|descartada)`.
- [ ] T009 Generar la migración versionada (`npm run db:deploy` genera `prisma/migrations/<ts>_asistente/…`); verificar que `flay_app` queda con lectura/escritura por los `DEFAULT PRIVILEGES` ya existentes y que **no** toca `BitacoraAuditoria`.

### Núcleo de aplicación compartido

- [ ] T010 [P] Crear `src/aplicacion/asistente/minimizar.ts`: función que recorta nombre, correo, teléfono y documento de cualquier resultado antes de ir al modelo (RNF-13, R-04). Deja unidades, montos (cadena), fechas y estados.
- [ ] T011 Crear `src/aplicacion/asistente/herramientas.ts` con los tipos `ContextoHerramienta`, `ResultadoHerramienta`, `Herramienta`, el arreglo `HERRAMIENTAS` (vacío al inicio) y `herramientasPara(roles)` (firmas en `contracts/contratos.md §2`). Cada herramienta derivará su JSON Schema desde su `z.ZodTypeAny`.
- [ ] T012 Crear `src/aplicacion/asistente/conversar.ts` con `conversar(...)` dentro de `conAutorizacion`: resuelve/crea la conversación del usuario, persiste el turno del usuario, carga historial reciente, llama `agente.conversar`, maneja el loop de lectura (tope 4 saltos — R-09), arma la propuesta para escrituras y la respuesta/degradación (contrato §3). Depende de T003, T008, T010, T011.
- [ ] T013 Crear `src/aplicacion/asistente/confirmar.ts` con `confirmarPropuesta(...)` (idempotente: solo `pendiente` ejecuta; re-valida args con Zod; ejecuta `herramienta.confirmar` y marca `confirmada` en la misma transacción; dueño del hilo) y `descartarPropuesta(...)` (contrato §4). Depende de T008, T011.

### Presentación compartida

- [ ] T014 Crear `src/app/(panel)/consorcios/[consorcio]/asistente/acciones.ts` (`'use server'`): `accionEnviar` (`useActionState`, sin redirigir), `accionConfirmar` y `accionDescartar` (`redirect` con `?hecho=`/`?error=`), reusando `usuarioDeLaSesion()`, `HABILITACIONES`, `RELOJ`, `ASISTENCIA` y `ErrorDeAplicacion → mensajeParaUsuario` (contrato §5). Depende de T012, T013.
- [ ] T015 Crear `src/app/(panel)/consorcios/[consorcio]/asistente/asistente.tsx` (`'use client'`): el widget (lanzador + panel), lista de turnos, estado "pensando", y el armazón para tarjetas y citas. Montarlo en `src/app/(panel)/consorcios/[consorcio]/marco.tsx` (o el layout del consorcio) pasando el `consorcioId` activo. Usable en 390×844 y accesible (RNF-01). Depende de T014.

**Checkpoint**: el asistente responde (aunque sin herramientas) y degrada; la base y el contrato están listos.

---

## Phase 3: User Story 1 — El consorcista pregunta por lo suyo (P1) 🎯 MVP

**Goal**: asistente de **solo lectura** que responde con lo que el usuario ya ve, scopeado.

**Independent Test**: ver `quickstart.md §2` pasos 1-3, 6-7; pruebas SC-001, SC-002, SC-004, SC-005, SC-006.

### Herramientas de lectura (cada una llama su caso de uso; nada de Prisma directo)

- [ ] T016 [P] [US1] Registrar `ver_espacios` (`listarEspacios`) y `ver_reservas` (`listarReservas`, por unidad, sin nombres) en `herramientas.ts`, con `paraModelo` minimizado.
- [ ] T017 [P] [US1] Registrar `ver_mis_unidades` (`unidadesParaReservar`) y `ver_resumen` (`verResumenConsorcio`).
- [ ] T018 [P] [US1] Registrar `ver_expensas` (`misExpensas`) y `ver_estado_cuenta` (`verEstadoDeCuenta`).
- [ ] T019 [P] [US1] Registrar `ver_morosidad` (`verMorosidad`): el resultado nominado (admin/consejo) se usa para `paraUI` pero **nunca** va en `paraModelo` (minimizado siempre agregado).
- [ ] T020 [P] [US1] Registrar `ver_gastos` (`listarGastos`) y `ver_novedades` (`listarNovedades`).
- [ ] T021 [P] [US1] Registrar `ver_reclamos` (`listarReclamos`) y detalle (`verReclamo`).
- [ ] T022 [US1] Registrar `consultar_reglamentos` (`consultarDocumentacion`, RF-20): mapear sus citas al formato de respuesta del asistente; respeta abstención (`sin_respaldo`).
- [ ] T023 [US1] En `conversar.ts`, inyectar la instrucción de sistema acotada a Flay + `hoy` (America/Argentina/Buenos_Aires desde `RELOJ`) y la negativa fija para pedidos fuera de dominio (R-07, FR-003).
- [ ] T024 [US1] En `asistente.tsx`, renderizar respuestas de lectura y las **Fuentes** (citas) reusando el patrón de `documentos/consultar/formulario.tsx`.

### Tests US1

- [ ] T025 [P] [US1] `pruebas/integracion/asistente.spec.ts`: SC-001 (consorcista no obtiene datos de unidad ajena ni de otro consorcio), SC-002 (morosidad agregada vs nominada por rol), SC-006 (pedido fuera de dominio → negativa fija).
- [ ] T026 [P] [US1] En el mismo spec: SC-004 (lo que queda en `MensajeAsistente.herramienta` / lo enviado al modelo no contiene nombre/correo/teléfono/documento) y SC-005 (respuesta de reglamento con cita; sin respaldo → lo declara).

**Checkpoint**: MVP — un consorcista consulta todo lo suyo por chat, sin fugas. Demostrable.

---

## Phase 4: User Story 2 — Crear una operación con confirmación (P2)

**Goal**: escrituras del consorcista (reserva, reclamo) solo por tarjeta de confirmación idempotente.

**Independent Test**: `quickstart.md §2` pasos 4-5; pruebas SC-003.

- [ ] T027 [P] [US2] Registrar `crear_reserva` (`reservar`) en `herramientas.ts` con `parametros` Zod, `resumir` (arma el texto desde la base: espacio, unidad, horario) y `confirmar`.
- [ ] T028 [P] [US2] Registrar `crear_reclamo` (`registrarReclamo`) con `parametros` Zod, `resumir` (título/descripción/unidad) y `confirmar`.
- [ ] T029 [US2] En `asistente.tsx`, renderizar la **tarjeta de propuesta** con `.tarjeta` + `.fila-acciones` + `.boton--primario`/`--fantasma` (Confirmar / Descartar) que disparan `accionConfirmar`/`accionDescartar`.
- [ ] T030 [US2] Agregar al diccionario `HECHO` de `src/app/avisos.tsx` las claves de éxito que falten (reutilizar `reserva-confirmada`, `reclamo-registrado` si ya existen).
- [ ] T031 [US2] En `conversar.ts`, si falta un dato para una escritura (fecha, espacio, unidad), que el asistente lo pida antes de proponer (edge case); no inventar valores.
- [ ] T032 [P] [US2] En `pruebas/integracion/asistente.spec.ts`: SC-003 — iniciar escritura no crea nada; `confirmarPropuesta` crea exactamente una vez; segundo confirmar no duplica (idempotencia); otro usuario no puede confirmar; `descartar` no ejecuta; deuda vencida → la confirmación la rechaza el caso de uso.
- [ ] T033 [P] [US2] `pruebas/e2e/asistente.spec.ts`: consorcista reserva por el chat (tarjeta → confirmar → aviso de éxito); verificar que antes de confirmar no existe la reserva.

**Checkpoint**: US1 + US2 funcionan; las escrituras del consorcista pasan solo por confirmación.

---

## Phase 5: User Story 3 — El administrador gestiona el edificio (P2)

**Goal**: lectura nominada + escrituras de admin (asignar, publicar) + alcance a otros consorcios.

**Independent Test**: `quickstart.md §2` pasos 8-11.

- [ ] T034 [P] [US3] Registrar `ver_responsables` (`posiblesResponsables` **dentro de** `conAutorizacion` admin — no autoriza solo) y `ver_destinatarios` (`destinatariosPosibles`), roles `administrador`.
- [ ] T035 [P] [US3] Registrar `asignar_reclamo` (`asignar`) con `resumir` (responsable resuelto por nombre) y `confirmar`, rol `administrador`.
- [ ] T036 [P] [US3] Registrar `publicar_novedad` (`publicarNovedad`) con `resumir` (título/cuerpo/destino/vigencia) y `confirmar`, rol `administrador`.
- [ ] T037 [US3] En `herramientas.ts` + `conversar.ts`, aceptar `consorcioId` opcional por herramienta validado contra `misConsorcios`; por defecto el de la ruta; cada consulta a otro consorcio re-autoriza (R-06, FR-011).
- [ ] T038 [P] [US3] En `pruebas/integracion/asistente.spec.ts`: admin recibe morosidad nominada; un no-admin que pide asignar/publicar es rechazado **por el caso de uso**; admin consulta otro consorcio propio (ok) y uno ajeno (sin datos).
- [ ] T039 [P] [US3] `pruebas/e2e/asistente.spec.ts`: admin asigna un reclamo por el chat (tarjeta → confirmar → estado "asignado").

**Checkpoint**: las tres historias operativas funcionan de forma independiente.

---

## Phase 6: User Story 4 — La conversación recuerda el hilo (P3)

**Goal**: contexto multi-turno y registro del hilo.

**Independent Test**: `quickstart.md §2` repregunta que depende del turno anterior.

- [ ] T040 [US4] En `conversar.ts`, pasar los últimos N turnos del hilo como `historial` al `agente` (ya persistidos por Foundational); acotar N.
- [ ] T041 [P] [US4] En `pruebas/integracion/asistente.spec.ts`: una repregunta encuentra el hilo del usuario; los mensajes quedan asociados a usuario+consorcio y se leen por la conversación (no `mensajeAsistente` directo).

**Checkpoint**: todas las historias completas.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T042 [P] Degradación e2e: proyecto Playwright `nula` → el asistente muestra el mensaje de "no disponible" y el panel sigue (SC-007).
- [ ] T043 [P] Verificar teléfono 390×844 y axe A/AA del widget en `pruebas/e2e` / `test:a11y` (FR-014, RNF-11).
- [ ] T044 [P] Docs: alta de **RF-27** en `docs/entrega-1/04-alternativas-solucion.md` (como capacidad, sin marcas) y de **CU-16** + fila de trazabilidad en `docs/entrega-3/12-diseno.md`.
- [ ] T045 [P] Docs: declarar la minimización del asistente en `docs/entrega-3/12-diseno.md §8.5` y `docs/entrega-final/18-seguridad.md` (hoy solo cubren el índice documental) — R-04.
- [ ] T046 [P] Actualizar las tablas de estado en `docs/README.md` y `README.md`.
- [ ] T047 Ejecutar `npm run verificar` completo y la validación manual de `quickstart.md §2`.

---

## Dependencies & Execution Order

- **Setup (T001-T002)**: inmediato.
- **Foundational (T003-T015)**: bloquea todo. Dentro: T003 antes de T004-T007; T008 antes de T009; T010/T011 antes de T012; T012/T013 antes de T014; T014 antes de T015. T004/T005/T006 en paralelo; T010 en paralelo.
- **US1 (T016-T026)**: tras Foundational. T016-T022 en paralelo (distintas entradas del registro, pero mismo archivo `herramientas.ts` → coordinar o secuenciar los edits al arreglo); T025/T026 tras las herramientas.
- **US2 (T027-T033)**, **US3 (T034-T039)**, **US4 (T040-T041)**: tras Foundational; idealmente tras US1 por compartir `herramientas.ts` y `asistente.tsx`.
- **Polish (T042-T047)**: al final.

> Nota de conflicto de archivo: T016-T022, T027-T028 y T034-T036 editan todas `herramientas.ts`; el `[P]` vale por independencia lógica, pero los edits al mismo archivo se aplican en serie.

## Implementation Strategy

- **MVP** = Setup + Foundational + US1 (asistente de lectura scopeado). Validar SC-001/002/004/005/006 y parar a demostrar.
- Luego US2 (escrituras con confirmación), US3 (admin + multi-edificio), US4 (memoria), y Polish.
- Commits citan `RF-27`. Rama `005-asistente-conversacional`. PR con revisión obligatoria (constitución, Flujo de desarrollo).

## Notes

- Ninguna tarea agrega filtros `consorcioId` a mano ni toca Prisma fuera de los casos de uso: eso mantiene verde `pruebas/dominio/filtro-unico.spec.ts` sin sumar archivos a su lista blanca.
- Verificar cada herramienta contra la firma real de su caso de uso antes de registrarla.

## Estado de implementación (2026-10-05)

**Hecho y verificado estáticamente** (typecheck, `npm run lint` 0 errores, `npm run format:check` limpio, `npm run test:dominio` 121/121 incluido `filtro-unico`):

- T001, T002 (setup; variable `GEMINI_MODELO_AGENTE` en `.env.example`).
- T003–T008, T010–T015 (Foundational completo: contrato `AgenteConversacional` + 3 implementaciones + wiring; modelos Prisma + cliente regenerado; `minimizar`, `herramientas`, `conversar`, `confirmar`; server actions y widget montado en `Marco`).
- T016–T024 (US1: todas las herramientas de lectura + instrucción de dominio/fecha + render de datos y citas).
- T027–T031 (US2: `crear_reserva`, `crear_reclamo`, tarjeta de confirmación idempotente, claves `HECHO` reutilizadas).
- T034–T037 (US3: `ver_responsables`, `ver_destinatarios`, `asignar_reclamo`, `publicar_novedad`, `consorcioId` opcional por herramienta).
- T040 (US4: `conversar` carga los últimos 20 turnos del hilo como contexto).

**Pendiente (bloqueado por Docker/BD apagada o es cierre documental)**:

- T009 — la migración `20261005000000_asistente` está escrita; falta aplicarla y verificarla: `npm run db:deploy && npm run db:drift` con la base levantada (si Prisma la regenera distinto, reemplazar el SQL por el generado).
- T025, T026, T032, T033, T038, T039, T041 — pruebas de integración y e2e (necesitan base sembrada y Playwright). Escribir según `quickstart.md` y correr con `FLAY_ASISTENCIA=determinista`.
- T042, T043 — degradación e2e + teléfono/axe.
- T044–T046 — docs: RF-27 en `04-alternativas-solucion.md`, CU-16 y trazabilidad en `12-diseno.md`, minimización del asistente en `12-diseno.md §8.5` y `18-seguridad.md`, tablas de `README`/`docs/README`.
- T047 — `npm run verificar` completo + validación manual de `quickstart.md`.
