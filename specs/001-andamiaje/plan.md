# Implementation Plan: 001-andamiaje

**Branch**: `001-andamiaje` | **Date**: 2026-09-09 | **Spec**: `specs/001-andamiaje/spec.md`

**Input**: Feature specification from `/specs/001-andamiaje/spec.md` (27 FR + SC-001 a SC-013, con fixes I-01 a I-04, I-07, I-09, I-12, M-01, M-06, M-09, M-10)

## Summary

Cimientos ejecutables: de repo solo-docs a aplicación desplegada sin negocio. Secuencia PowerShell
idempotente (FR-003 a FR-017), verificación única `npm run verificar`, CI <10 min, deploy automático a
demo, bitácora inviolable, aislamiento en un punto, 4 fixtures negativas, arneses `medir:p95` y
`test:a11y`, plataforma ratificada en Paso 0 y versiones §14.1 fijadas el 2026-09-09.

## Technical Context

**Language/Version**: TypeScript 5.6 sobre Next.js 15.3.4, Node.js 22.21.0 LTS + npm 11.12.1 (`engines` + `.nvmrc` + `setup-node`)

**Primary Dependencies**: Prisma 6.7.0, Zod 3.24.2, Auth.js 5.0.0 (`next-auth`), `@node-rs/argon2` 2.0.2, `decimal.js` 10.4.3 (vía `Prisma.Decimal`), `@react-pdf/renderer` 4.1.3, Recharts 2.15.0

**Storage**: PostgreSQL 17.4 + pgvector 0.8.0 (`pgvector/pgvector:pg17` local y Neon `aws-sa-east-1` demo); Prisma migraciones versionadas; `SHADOW_DATABASE_URL` para `db:drift`; objetos tras interfaz de dominio (Vercel Blob); correo Resend

**Testing**: Vitest 3.0.5 (proyectos `dominio` sin `DATABASE_URL` y `integracion`), Playwright 1.50.1 (escritorio + 390×844 + `test:a11y` con `@axe-core/playwright` 4.9.0), ESLint 9.20.0 + Prettier 3.4.2 + `flay/sin-aritmetica-monetaria`, `gitleaks` + `npm audit --audit-level=high`

**Target Platform**: Windows PowerShell local (Docker para DB) + GitHub Actions Linux (CI) + Vercel `gru1` demo; producción desde etiqueta con aprobación

**Project Type**: Web application Next.js App Router (`src-dir`, `@/*`), despliegue único (no microservicios)

**Performance Goals**: `verificar` <10 min (3 corridas); `test:dominio` falla en el 1er minuto sin DB; liquidación futura <30 s (no mide esta etapa); lecturas futuras <2 s p95 con `medir:p95`

**Constraints**: <30 min clon→verde en máquina limpia (SC-001); 0 secretos en repo; 0 hallazgos gitleaks; 0 vulns altas; 0 infracciones axe A/AA; `eol=lf`; roles `flay_owner`/`flay_app`

**Scale/Scope**: Etapa 0, 34 h, 1 entidad (`BitacoraAuditoria` + `fn_auditar`), 0 `RF-nn` funcional; habilita 26 RF posteriores

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Veredicto | Cómo se cumple en este plan |
|---|---|---|
| I Aislamiento (NO NEGOCIABLE) | PASS | FR-011 extensión Prisma en un solo punto + SC-013 (falla sin contexto) + `no-restricted-imports` cliente crudo; 0 consultas de negocio en esta etapa |
| II Dinero exacto (NO NEGOCIABLE) | PASS | Sin importes en esta etapa; regla `flay/sin-aritmetica-monetaria` + 4 fixtures (incluye proveedor directo en dominio) + SC-003; §14.4 fija Decimal/cadena |
| III Dominio↔infra | PASS | Zona ESLint prohíbe `prisma/client`/SDKs/web en `src/dominio`; puertos en `src/dominio/contratos`; `test:dominio` sin `DATABASE_URL` (SC-002) |
| IV Asistencia no decide | PASS | N/A en esta etapa (sin IA); costura dejada: pantalla futura acepta precarga + confirmación (se verifica en 002 FR-020) |
| V Auditoría inviolable | PASS | `fn_auditar()` `SECURITY DEFINER` + `REVOKE` a `flay_app` + SC-006 (3× `permission denied`) + prueba sobre tabla de prueba |

Sin violaciones: tabla Complexity Tracking vacía. Post-Phase 1: sin cambios (esta etapa no agrega lógica de negocio).

## Project Structure

### Documentation (this feature)

```text
specs/001-andamiaje/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── salud.md         # GET /api/salud
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
src/
├── app/api/salud/route.ts
├── aplicacion/
├── dominio/contratos/
├── infraestructura/cliente-aislado.ts
└── compartido/
prisma/
├── schema.prisma
└── migrations/0001_inicial/
reglas-eslint/sin-aritmetica-monetaria.mjs
pruebas/
├── dominio/
├── integracion/
├── e2e/
└── fixtures-negativas/ (4 fixtures)
scripts/medir-p95.mjs
.github/workflows/verificacion.yml (+ despliegue)
```

**Structure Decision**: Web application de un solo proyecto Next.js con carpetas por capa (FR-006, §14.4).
Vitest con 2 proyectos + Playwright con 3 (escritorio, teléfono, a11y). La extensión Prisma es el
único punto del filtro por consorcio.

## Complexity Tracking

> Vacía: ningún gate requiere justificación.
