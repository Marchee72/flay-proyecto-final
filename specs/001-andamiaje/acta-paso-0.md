# Acta Paso 0 — Ratificación de plataforma y versiones (001-andamiaje)

**Fecha:** 2026-09-09 · **Presentes:** Lautaro Marchetti, Franco Ferrero
**Referencia:** FR-001 (I-12), hueco H-01, §5.5.4, §14.1

## 1. Plataforma ratificada

| Pieza | Proveedor | Región | Capa |
|---|---|---|---|
| Alojamiento app | Vercel | `gru1` (San Pablo) | Hobby |
| Base de datos | Neon PostgreSQL + `pgvector` | `aws-sa-east-1` | Free |
| Objetos | Vercel Blob | Misma cuenta | Hobby |
| Correo | Resend | — | Free |
| CI/CD | GitHub Actions | — | Público |

Cambios sobre la propuesta: ninguno. Regla aplicada: la propuesta rige ante ausencia de objeción.

## 2. Versiones fijadas (§14.1)

Next 15.5.25 / Node 22.21.0 / npm 11.12.1 · PG 17.4 + pgvector 0.8.0 · Prisma 6.7.0 · Zod 3.24.2 ·
Auth.js 5.0.0-beta.32 · Argon2id 2.0.2 · decimal.js 10.4.3 · react-pdf 4.1.3 · Recharts 2.15.0 ·
Vitest 3.2.7 + coverage-v8 3.2.7 · Playwright 1.63.0 + axe 4.9.0 · ESLint 9.20.0 + Prettier 3.4.2 ·
Lucide 0.525.0 · Generador `create-next-app@15.3.4`. Verificación contra `package-lock` (FR-023).

### 2.1 Correcciones asentadas al instalar (2026-09-09)

Cuatro versiones de la propuesta no sobrevivieron a la instalación. Se corrigen aquí, no en el código:

| Pieza | Propuesta | Fijada | Motivo |
|---|---|---|---|
| Next.js | 15.3.4 | 15.5.25 | 15.3.4 deprecada por CVE-2025-66478; arrastra `postcss` y `sharp` con avisos altos |
| Auth.js | 5.0.0 | 5.0.0-beta.32 | La 5.0.0 estable no existe; el canal estable sigue en 4.24.15, con la API previa al App Router |
| Playwright | 1.50.1 | 1.63.0 | Next 15.5.25 exige el par `^1.51.1` y el aviso alto alcanza a `<1.55.1` |
| Vitest + coverage | 3.0.5 | 3.2.7 | Aviso crítico sobre `<=3.2.5`; se mantiene dentro de la misma versión mayor |

Las transitivas `postcss` 8.5.28 y `sharp` 0.35.4 se fuerzan con `overrides` en `package.json`.
Con esas cuatro correcciones y los dos `overrides`, `npm audit --audit-level=high` cierra en cero
(SC-008). El generador se mantiene en `create-next-app@15.3.4`: es el andamio ya trasladado.

## 3. Ley 25.326 (§5.5.4)

Datos personales bajo Ley 25.326. Región San Pablo (próxima a Rosario); tratamiento por
encargado con cláusulas en contratos de proveedores; sin decisiones automatizadas (RN-14);
indicadores dentro del sistema, sin BI externo.

## 4. Roles de base (I-02)

`flay_owner` (DDL, migraciones) y `flay_app` (DML). La aplicación siempre conecta como
`flay_app`; `SHADOW_DATABASE_URL` con default local para `db:drift`.

## 5. Resolución

Se da por cerrado H-01 y habilitado el Bloque B de `001-andamiaje`.

**Firmas:** ______________________ (Marchetti) · ______________________ (Ferrero)
