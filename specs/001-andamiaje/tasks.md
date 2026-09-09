# Tasks: 001-andamiaje

**Input**: Design documents from `/specs/001-andamiaje/` (spec.md, plan.md, research.md, data-model.md, contracts/salud.md, quickstart.md)

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Acta Paso 0 + proyecto base + dependencias pinnadas

- [x] T001 Ratificar plataforma y versiones en acta Paso 0 (FR-001, I-12): Vercel gru1, Neon sa-east-1, Blob, Resend, Actions + tabla §14.1 + cláusulas Ley 25.326
- [x] T002 [P] Fijar runtime Node 22.21.0 + npm 11.12.1 en `package.json` (engines), `.nvmrc` y flujo `setup-node` en `.github/workflows/verificacion.yml` (FR-003, M-06)
- [x] T003 Generar proyecto con `create-next-app@15.3.4` en `tmp-flay` y trasladar a raíz + `npm install` con versiones §14.1 (FR-004, FR-005, I-03)
- [x] T004 [P] Instalar dependencias exactas + Playwright chromium + `@axe-core/playwright` 4.9.0 (FR-005, I-09)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Estructura, DB, env, lint, tests y scripts — BLOQUEA todas las historias

- [x] T005 Crear carpetas por capa `src/app, src/aplicacion, src/dominio, src/dominio/contratos, src/infraestructura, src/compartido, prisma/migrations, pruebas/dominio, pruebas/integracion, pruebas/e2e, pruebas/fixtures-negativas, reglas-eslint` (FR-006)
- [ ] T006 Levantar DB local idempotente `flay-db` (`pgvector/pgvector:pg17`) con guarda de existencia (FR-007, M-06) — BLOQUEADA por red: la CDN de Docker se resetea desde el host (ver acta §2.2). La etapa corre contra Neon; CI usa la imagen como servicio
- [x] T007 Crear `.gitignore` idempotente + `.env.example` (con `SHADOW_DATABASE_URL`, I-01) + `.env` solo si no existe + `npx auth secret` nunca versionado (FR-008, M-06)
- [x] T008 Definir `prisma/schema.prisma` + migración `inicial`: `vector`, `btree_gist`, `pgcrypto`, `BitacoraAuditoria` + `fn_auditar()` `SECURITY DEFINER` + `REVOKE ... FROM flay_app` con roles `flay_owner`/`flay_app` (FR-009, FR-010, I-02) — aplicada sobre Neon; `db:drift` sin diferencias
- [x] T009 [P] Configurar ESLint: zonas por capa + zona anti-proveedor en dominio + `flay/sin-aritmetica-monetaria` con tipos + `no-restricted-imports` cliente crudo (FR-012, I-04)
- [x] T010 [P] Configurar Prettier + `eslint-config-prettier` + `.editorconfig` (`end_of_line = lf`) (FR-013)
- [x] T011 [P] Configurar Vitest con proyectos `dominio` (sin DB) e `integracion` (FR-014)
- [x] T012 [P] Configurar Playwright (escritorio + teléfono 390×844) + guion `test:a11y` axe 0 A/AA (FR-015, I-09)
- [x] T013 Definir guiones `package.json` incluida puerta `verificar` + `medir:p95` (`scripts/medir-p95.mjs`, I-07) + `test:a11y` (FR-016)
- [x] T014 Crear extensión `src/infraestructura/cliente-aislado.ts` que inyecta filtro por consorcio y falla sin contexto (FR-011)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Entorno corriendo (Priority: P1) — MVP

**Goal**: Clon → app + esquema + `verificar` verde <30 min, `/api/salud` 200

**Independent Test**: FR-003→FR-017 en máquina limpia + `http://localhost:3000/api/salud` 200 + `test:dominio` sin `DATABASE_URL` + 0 secretos en historial (SC-001, SC-002, SC-005)

- [x] T015 [P] [US1] Crear ruta `src/app/api/salud/route.ts` (`estado`, `version`, `migracion`) según `contracts/salud.md` (FR-017)
- [x] T016 [US1] Prueba e2e `/api/salud` 200 en escritorio + teléfono sin scroll horizontal en `pruebas/e2e/salud.spec.ts` (SC-011) 
- [x] T017 [US1] Validar SC-002/SC-005: dominio sin DB y `db:deploy` sobre vacía + `db:drift` 0 — SC-001 (clon→verde <30 min en máquina limpia) queda pendiente: necesita una máquina limpia

**Checkpoint**: US1 funcional y testeable — clon corre solo

---

## Phase 4: User Story 2 - Verificación rechaza (Priority: P1)

**Goal**: Lint/typecheck/CI rechazan capa cruzada, `number` como dinero y aritmética sobre `Decimal` + proveedor directo

**Independent Test**: 4 fixtures en `pruebas/fixtures-negativas/` fallan cada una con su mensaje (SC-003)

- [x] T018 [P] [US2] Crear fixture 1 capa cruzada + fixture 4 proveedor directo (`@prisma/client` en dominio) en `pruebas/fixtures-negativas/` (FR-022, I-04)
- [x] T019 [P] [US2] Crear fixture 2 `number` como dinero + fixture 3 aritmética `Decimal` en `pruebas/fixtures-negativas/` (FR-022)
- [x] T020 [US2] Prueba que ejecuta el verificador sobre las 4 fixtures y afirma fallo con mensaje esperado (SC-003)
- [x] T021 [US2] Verificar escenarios US-2 1-3: `lint` capa, `typecheck` dinero, `lint` aritmética — el 4 (CI en rojo bloquea PR) queda con T024

**Checkpoint**: US1+US2 en verde; la constitución es exigible por construcción

---

## Phase 5: User Story 3 - Deploy automático (Priority: P1)

**Goal**: Main verde → demo actualizado <10 min; en rojo 0 deploys; migraciones con `migrate deploy`

**Independent Test**: Cambiar `version` de `/api/salud`, integrar y verlo en demo sin acción manual (SC-007)

- [x] T022 [US3] Crear `.github/workflows/verificacion.yml` (servicio pgvector + `SHADOW_DATABASE_URL`, `npm ci` + `verificar` <10 min) (FR-018, I-01) — incluye `setup-node` con `.nvmrc` (cierra T002), `db:preparar`, `test:a11y`, gitleaks y `npm audit`; sin ejecutar hasta el primer envio
- [ ] T023 [US3] Crear flujo despliegue: verde → `db:deploy` demo + publicar; secretos desde proveedor; migrar-antes-de-servir; migración fallida bloquea + alerta (FR-019, M-09)
- [ ] T024 [US3] Proteger `main`: sin push directo, PR + revisión del otro + verde (FR-020, SC-012)

**Checkpoint**: US3 desplegando solo; condición 6 de §8.3.4 garantizada

---

## Phase 6: User Story 4 - Bitácora inviolable (Priority: P2)

**Goal**: Tabla + trigger + `REVOKE`; tablas futuras nacen auditadas

**Independent Test**: `INSERT/UPDATE/DELETE` como `flay_app` → 3× `permission denied`; operación sobre tabla de prueba deja 1 asiento con anterior+posterior (SC-006)

- [x] T025 [US4] Prueba integración bitácora en `pruebas/integracion/bitacora.spec.ts`: trigger sobre tabla de prueba + 3 denegados a `flay_app` (FR-010, SC-006)

**Checkpoint**: Mecanismo transversal listo antes del primer dato económico

---

## Phase 7: User Story 5 - Cierre documental (Priority: P2)

**Goal**: H-01 a H-04/H-10 cerrados + §13.2 verificado

**Independent Test**: 0 `A fijar` en §14.1 (coincide con `package-lock`), 5 estándares §14.4, 0 `a definir` §18.7 (SC-009, SC-010)

- [ ] T026 [P] [US5] Completar §14.1 desde `package-lock.json` + agregar `gitleaks` + `npm audit --audit-level=high` al flujo (FR-021, FR-023)
- [ ] T027 [P] [US5] Escribir §14.4 (5 estándares) y §18.7 (secretos + dependencias) (FR-024, FR-025)
- [ ] T028 [US5] Registrar comandos en `CLAUDE.md` + verificar hitos 2.5/5.1/demo-04-09 en §13.2 (FR-026, FR-027)

**Checkpoint**: US5 cierra H-01–H-04/H-10; etapa documentada

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Puerta única y evidencias finales

- [x] T029 Correr `npm run verificar` local 3× (57 s, 58 s, 58 s; límite 10 min) — SC-004 local registrado; falta la corrida remota (T022 sin ejecutar)
- [ ] T030 [P] `gitleaks detect` historial completo 0 hallazgos + `npm audit` 0 altas (SC-008)
- [ ] T031 Run `quickstart.md` validation de punta a punta

---

## Dependencies & Execution Order

- Setup (T001-T004) → Foundational (T005-T014) BLOQUEA todo → US1 (T015-T017, MVP) → US2 (T018-T021) → US3 (T022-T024) → US4 (T025) → US5 (T026-T028) → Polish (T029-T031)
- US2/US3 dependen de Fundational, no entre sí salvo CI verde para deploy
- Paralelo: T002+T004, T009+T010+T011+T012, T015+T018+T019, T026+T027

## Implementation Strategy

MVP = Setup + Foundational + US1 (clon corre). Luego US2 (exigibilidad), US3 (deploy), US4 (auditoría), US5 (docs). Cada historia testeable por su Independent Test sin romper la anterior.
