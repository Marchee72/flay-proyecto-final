# Research — 001-andamiaje (Phase 0)

Todas las decisiones estaban abiertas en H-01 a H-04/H-10 y se cerraron con FR-001 a FR-025 + fixes.
Cero NEEDS CLARIFICATION al 2026-09-09.

## R-01 Plataforma (H-01, I-12)
- Decision: Vercel `gru1` Hobby (app) + Neon `aws-sa-east-1` Free PG+pgvector (DB) + Vercel Blob (objetos) + Resend Free (correo) + GitHub Actions (CI).
- Rationale: primera clase Next.js (C4 §14.1), región más próxima a Rosario con capa gratuita (§5.5.4), único motor con NUMERIC+exclusión+triggers+vectorial, correo ya necesario en 002 (H-06), verificación en cada envío (§8.3.5).
- Alternatives: otro hosting Node (portable por §14.1, único acople real es objetos tras interfaz); otra región (más latencia, peores cláusulas Ley 25.326).
- Ratificación: Paso 0 en reunión de arranque, acta con cláusulas Ley 25.326; por defecto rige la propuesta.

## R-02 Versiones (H-02, I-03, M-06)
- Decision: tabla §14.1 fijada 2026-09-09 (Next 15.3.4, Prisma 6.7.0, Zod 3.24.2, Auth 5.0.0, Argon2id 2.0.2, decimal.js 10.4.3, react-pdf 4.1.3, Recharts 2.15.0, Vitest 3.0.5, Playwright 1.50.1, axe 4.9.0, ESLint 9.20.0, Prettier 3.4.2) + Node 22.21.0/npm 11.12.1 + generador `create-next-app@15.3.4` pinnado.
- Rationale: reproducibilidad + inventario licencias §5.3.4; FR-023 verifica contra `package-lock`, no descubre.
- Alternatives: `latest` (rechazado: dos ejecutores divergen).

## R-03 Base y roles (I-01, I-02)
- Decision: imagen `pgvector/pgvector:pg17`; extensiones `vector`, `btree_gist`, `pgcrypto` idempotentes; roles `flay_owner` (DDL/migraciones) y `flay_app` (DML); app siempre como `flay_app`; `SHADOW_DATABASE_URL` en `.env.example/.env.local` + servicio sombra en CI para `db:drift`.
- Rationale: RNF-12 + SC-006 + SC-005 (deploy sobre vacía + drift 0) + re-ejecutabilidad M-06.

## R-04 Frontera de capas (I-04)
- Decision: `no-restricted-imports` por zonas (FR-006) + zona que prohíbe en `src/dominio` `@prisma/client`, SDKs y `next/*`; puertos (repositorios, reloj) en `src/dominio/contratos`; 4ª fixture negativa.
- Rationale: Principio III exigible en cada envío, no solo contra la forma canónica de violarlo.

## R-05 Verificación y arneses (I-07, I-09)
- Decision: `verificar` = format→lint→typecheck→test:dominio→db:deploy→db:drift→test:integracion→build→test:e2e; `test:a11y` (axe, 0 A/AA) y `medir:p95` (`scripts/medir-p95.mjs`, entorno+semilla fijados) como guiones propios.
- Rationale: el defecto más probable falla en el 1er minuto; RNF-01/RNF-06/RNF-11 medibles desde el día 1.

## R-06 Despliegue (M-09) y protección (SC-012/013)
- Decision: deploy demo automático solo con verde + `db:deploy` antes de servir; secretos desde secretos del proveedor; migración fallida = deploy bloqueado + alerta, sin rollback manual; main protegida (sin push directo, PR + revisión del otro + verde).
- Rationale: condición 6 e condición 1 de §8.3.4 por construcción.
