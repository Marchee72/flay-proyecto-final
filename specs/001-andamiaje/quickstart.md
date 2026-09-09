# Quickstart — 001-andamiaje

Secuencia real, verificada el 2026-09-09. Los pasos 1 a 3 quedan hechos en el repositorio: quien
clona arranca en el 4.

1. Prerrequisitos: `node --version` (v22.21.0), `npm --version` (11.x), `git --version`,
   `docker --version`.
2. Acta Paso 0: ratificar plataforma + versiones §14.1 + cláusulas Ley 25.326.
3. `npx --yes create-next-app@15.3.4 tmp-flay ... --no-turbopack` → mover a la raíz sin pisar
   `README.md` ni `.gitignore` → dependencias exactas con `--save-exact`.
4. `npm ci` y `npx playwright install chromium`.
5. Base local, idempotente:
   `docker run -d --name flay-db -p 5432:5432 -e POSTGRES_PASSWORD=flay_local -e POSTGRES_DB=flay pgvector/pgvector:0.8.6-pg18`.
6. Copiar `.env.example` a `.env` y completar. `DATABASE_URL` es la cadena de `flay_app`,
   `DIRECT_DATABASE_URL` la de `flay_owner` (migraciones), `ADMIN_DATABASE_URL` la administradora
   (solo para el paso 7) y `SHADOW_DATABASE_URL` la sombra, también administradora.
   `AUTH_SECRET` se genera con `npx --yes auth secret` y nunca se versiona.
7. `npm run db:preparar`: crea `flay_owner` y `flay_app`, las tres extensiones y la base sombra.
   Es el único paso que usa la cadena administradora.
8. `npm run verificar` en verde: `format:check` → `lint` → `typecheck` → `test:dominio` →
   `db:deploy` → `db:drift` → `test:integracion` → `build` → `test:e2e`. Si el puerto 3000 está
   ocupado, `PUERTO=3100 npm run verificar`.
9. `npm run test:a11y` (axe, 0 infracciones A/AA) y `npm run docs:versiones` (§14.1 contra
   `package-lock`).
10. Integrar a `main` por solicitud con revisión: `main` rechaza el envío directo. Con la
    verificación en verde y `DESPLIEGUE_DEMO=true`, el demo se actualiza solo.

Lo que verifica cada paso: SC-002 (`test:dominio` sin `DATABASE_URL`), SC-003 (las 4 fixtures
fallan), SC-005 (`db:deploy` sobre vacía + `db:drift` 0), SC-006 (bitácora, 3× permiso denegado),
SC-011 (`/api/salud` 200 en escritorio y en 390 px), SC-013 (aislamiento sin contexto).
