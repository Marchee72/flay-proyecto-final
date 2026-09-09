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

Next 15.3.4 / Node 22.21.0 / npm 11.12.1 · PG 17.4 + pgvector 0.8.0 · Prisma 6.7.0 · Zod 3.24.2 ·
Auth.js 5.0.0 · Argon2id 2.0.2 · decimal.js 10.4.3 · react-pdf 4.1.3 · Recharts 2.15.0 ·
Vitest 3.0.5 · Playwright 1.50.1 + axe 4.9.0 · ESLint 9.20.0 + Prettier 3.4.2 ·
Lucide 0.525.0 · Generador `create-next-app@15.3.4`. Verificación contra `package-lock` (FR-023).

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
