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

Next 15.5.25 / Node 22.21.0 / npm 11.12.1 · PG 18.6 + pgvector 0.8.6 · Prisma 6.7.0 · Zod 3.24.2 ·
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

### 2.2 Base de trabajo provisoria (2026-09-09)

La estacion de trabajo no puede descargar imagenes de contenedor: la conexion a la red de entrega
de Docker se reinicia desde el propio host, fuera de Docker, mientras otras descargas grandes andan
normalmente. Bloqueo de red del proveedor de internet o de la proteccion local, no configuracion.

Para no detener la etapa, `001-andamiaje` se construyo contra una base **Neon**. Dos desviaciones
respecto de §1; la de region se corrigio el mismo dia:

| Punto | Ratificado | En uso | Estado |
|---|---|---|---|
| Region | `aws-sa-east-1` (San Pablo) | `sa-east-1` (San Pablo) | **Cerrado** el 2026-09-09: proyecto recreado en San Pablo, conforme a §5.5.4 |
| Version del motor | PostgreSQL 17.4 | PostgreSQL 18.6 | **Cerrado** el 2026-09-09: §14.1 pasa a 18.6 e imagen `pgvector/pgvector:0.8.6-pg18` |

Sobre el motor: se adopta 18.6 en vez de recrear el proyecto en 17. Nada de lo que §14.1 le pide a
la base cambia entre una version y otra —`NUMERIC` de precision arbitraria, restricciones de
exclusion, disparadores e indice vectorial estan en las dos—, y la extension `pgvector` es la 0.8.6
en ambas. Adoptar 18.6 mantiene una sola version entre desarrollo local, verificacion y
demostracion, que es lo que importa: la imagen `pgvector/pgvector:0.8.6-pg18` fija exactamente el
mismo par motor+extension que corre la base administrada.

La base local con esa imagen sigue siendo el entorno de desarrollo comprometido (FR-007); el flujo
de verificacion la usa como servicio y no depende de la base administrada.

### 2.3 Visibilidad del repositorio (2026-09-09)

El repositorio pasa a **publico**, conforme a §1. La proteccion de la rama principal —condicion 1 de
§8.3.4 y FR-020— no esta disponible en repositorios privados sin plan pago, y `gitleaks` (FR-021)
tampoco corre sin licencia sobre repositorios privados. Antes del cambio se verifico que ningun
archivo de entorno estuvo versionado, que el historial no contiene credenciales y que
`datos-cliente/` es ficticio por construccion (§13.4).

Queda configurado sobre `main`: sin envio directo, incorporacion por solicitud con **una revision
aprobada** del otro integrante, `verificar` como comprobacion requerida en modo estricto, alcance a
administradores, sin reescritura ni borrado de la rama.

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
