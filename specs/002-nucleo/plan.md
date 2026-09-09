# Implementation Plan: 002-nucleo

**Branch**: `002-nucleo` | **Date**: 2026-09-09 | **Spec**: [`spec.md`](spec.md)

**Input**: Feature specification from `/specs/002-nucleo/spec.md` (36 FR, 19 SC, clarificaciones de
la sesión 2026-09-09)

## Summary

Primera funcionalidad del sistema: identidad y habilitaciones por consorcio, consorcios con
unidades y coeficientes exactos, gastos con comprobantes, proveedores, períodos mínimos y auditoría
enganchada. `RF-01` a `RF-05`, `RF-10`, `RF-17` y `RF-26`; casos de uso `CU-01`, `CU-02` y `CU-05`.

El enfoque técnico se apoya entero en lo que `001-andamiaje` dejó construido —extensión de
aislamiento, `fn_auditar()`, puerta única de verificación, despliegue automático— y agrega tres
mecanismos nuevos: la habilitación como tabla que materializa el Principio I, dos invariantes
impuestos por la base (suma de coeficientes y superposición de ocupaciones) y una tabla de trabajos
pendientes que absorbe la falla de los servicios externos sin voltear la operación del usuario.

## Technical Context

**Language/Version**: TypeScript 5 sobre Next.js 15.5.25, Node.js 22.21.0 (`.nvmrc` + `setup-node`)

**Primary Dependencies**: Prisma 6.7.0, Zod 3.24.2, Auth.js 5.0.0-beta.32 (`next-auth`),
`@node-rs/argon2` 2.0.2, `decimal.js` 10.4.3 vía `Prisma.Decimal`, `lucide-react` 0.525.0,
Vercel Blob (subida directa), Resend (correo)

**Storage**: PostgreSQL 18.6 + `pgvector` 0.8.6 (Neon `sa-east-1`); `btree_gist` para la restricción
de exclusión de `Ocupacion`; migraciones versionadas con SQL escrito a mano donde Prisma no alcanza

**Testing**: Vitest 3.2.7 (proyectos `dominio` sin base e `integracion`), Playwright 1.63.0
(escritorio, teléfono 390×844, `a11y` con axe). TDD **obligatorio** en coeficientes (reglas RN-01 y
RN-02): son núcleo económico

**Target Platform**: Vercel `gru1` (demostración) + Neon `sa-east-1`; navegadores actuales de
escritorio y teléfono

**Project Type**: Aplicación web Next.js App Router en despliegue único, con capas por carpeta

**Performance Goals**: listado de `RF-10` bajo 2 s en el percentil 95 con 10.800 gastos, medido en
caliente (SC-006); arranque en frío medido e informado aparte (SC-006b)

**Constraints**: cero filas ajenas por consorcio (SC-002) y por rol (SC-002b); suma de coeficientes
exacta `100.00000000` impuesta por la base (SC-004b); cero punto flotante en dinero (SC-009);
importes serializados como cadena (SC-010); comprobantes de hasta 25 MB sin atravesar el servidor
(SC-006c); WCAG 2.1 AA y 390 px en las pantallas del consorcista (SC-011)

**Scale/Scope**: 13 entidades nuevas, 2 consorcios de demostración (12 y 96 unidades), 10.800 gastos
de volumen anual, 3 casos de uso, 187 h en 6 semanas

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Veredicto | Cómo se cumple en este plan |
|---|---|---|
| I Aislamiento (NO NEGOCIABLE) | PASS | `Habilitacion` es la tabla que lo materializa. El filtro sigue viviendo en la extensión de `001` (FR-003): ninguna consulta de negocio lo repite. La autorización se evalúa por par (rol, consorcio) en cada operación de aplicación, no al iniciar sesión (FR-002, FR-004). SC-002, SC-002b y SC-003 lo verifican |
| II Exactitud del dinero (NO NEGOCIABLE) | PASS | Coeficientes e importes en `NUMERIC`; ocho decimales; ninguna firma pública del dominio acepta el tipo numérico nativo (FR-013). El invariante de la suma lo impone un disparador diferido en la base (FR-011b), no la aplicación. TDD obligatorio en coeficientes. SC-004, SC-004b, SC-009, SC-010 |
| III Dominio↔infraestructura | PASS | Puertos en `src/dominio/contratos`: repositorios, reloj, almacén de objetos (FR-019), notificador y derivador de contraseñas. La zona de análisis estático de `001` prohíbe en el dominio el cliente de datos, el proveedor de correo, el de objetos y `next/*` |
| IV La asistencia no decide | PASS | Sin funciones asistidas en esta etapa. FR-020 deja la costura: el formulario de gasto acepta valores precargados y exige confirmación humana explícita, de modo que `RF-06` se enchufe en `004` sin rediseñarlo |
| V Auditoría inviolable | PASS | FR-025 engancha las cinco tablas económicas a `fn_auditar()`. La aplicación sigue sin permiso de escritura sobre la bitácora. SC-007 y SC-008 |

**Restricciones técnicas**: migraciones versionadas y ningún cambio manual (FR-026) · integridad en
la base y no solo en el código: exclusión para RN-09 y disparador diferido para RN-01 · identificadores
universalmente únicos · Ley 25.326 sobre `Persona` · 390 px y WCAG 2.1 AA (FR-023) · mensajes para el
usuario final (FR-011, FR-018) · presupuesto de 2 s (SC-006).

### Cumplimiento diferido, declarado

| Cláusula | Qué dice | Qué hace esta etapa | Cómo se cierra |
|---|---|---|---|
| Notificaciones | «se persiste la notificación en estado pendiente y **una tarea programada** la despacha con reintentos» | Persiste en `TrabajoPendiente` con reintentos y espera creciente, pero **el despacho es oportunista**: lo dispara el siguiente pedido, más una acción explícita de reenvío (FR-006b) | `004-servicios` construye el despachador de `RF-14` y ahí entra la tarea programada, sobre esta misma tabla |

Lo que la cláusula protege —que el envío sea asincrónico, que se persista, que se reintente y que
una falla del correo no voltee la operación— **se cumple entero**. Lo que se difiere es el
ejecutor: la capa gratuita admite una sola corrida diaria, que para una invitación de usuario es
peor que reintentar en el siguiente pedido. Si el equipo prefiere cumplimiento literal desde ahora,
las dos salidas son agregar la corrida diaria en esta etapa o enmendar la cláusula, y la enmienda
exige acuerdo explícito de los dos integrantes.

## Project Structure

### Documentation (this feature)

```text
specs/002-nucleo/
├── plan.md              # Este archivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/           # Fase 1
│   ├── puertos-dominio.md
│   ├── identidad.md
│   ├── consorcios.md
│   └── gastos.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (sesion)/                  # inicio de sesión, invitación, fijar contraseña
│   ├── (panel)/
│   │   ├── consorcios/            # alta y edición, unidades y coeficientes  (CU-01)
│   │   ├── gastos/                # alta con comprobante, listado filtrable   (CU-02, CU-05)
│   │   ├── proveedores/
│   │   ├── periodos/
│   │   └── usuarios/              # invitación y habilitaciones
│   └── api/
│       ├── salud/                 # ya existe
│       ├── auth/[...nextauth]/
│       └── comprobantes/permiso/  # emite el permiso de subida directa
├── aplicacion/                    # casos de uso: autorizan, transaccionan, auditan
│   ├── identidad/
│   ├── consorcios/
│   ├── gastos/
│   └── pendientes/                # drenaje oportunista de TrabajoPendiente
├── dominio/
│   ├── coeficientes/              # TDD obligatorio: reglas RN-01 y RN-02
│   ├── gastos/
│   ├── periodos/                  # contrato mínimo del estado (FR-017, M-04)
│   └── contratos/                 # puertos: repositorios, reloj, objetos, correo, contraseñas
├── infraestructura/
│   ├── cliente-aislado.ts         # ya existe: único punto del filtro
│   ├── repositorios/
│   ├── objetos/                   # Vercel Blob tras el puerto
│   ├── correo/                    # Resend tras el puerto
│   └── contrasenas/               # Argon2id tras el puerto
└── compartido/
    ├── dinero.ts                  # ya existe
    └── version.ts                 # ya existe

prisma/migrations/                 # una migración por bloque, SQL a mano donde haga falta
pruebas/
├── dominio/                       # coeficientes, estado de período
├── integracion/                   # aislamiento, invariantes de base, auditoría, pendientes
├── e2e/                           # CU-01, CU-02, CU-05 + a11y
└── fixtures/                      # juego de datos § 13.4 (FR-028)
```

**Structure Decision**: se conserva la estructura por capas de `001-andamiaje` sin agregar
proyectos ni paquetes. Las rutas de `src/app` se agrupan por sesión y panel para que el diseño
adaptable y la autorización se resuelvan en un solo lugar por grupo. El único agregado a la forma
de `001` es `src/aplicacion/pendientes`, que es donde vive el drenaje oportunista.

## Complexity Tracking

| Violación | Por qué se necesita | Alternativa más simple, y por qué se rechaza |
|---|---|---|
| Despacho oportunista en vez de tarea programada | La capa gratuita admite una corrida diaria; una invitación que espera hasta 24 h es inaceptable, y contratar un ejecutor externo agrega un proveedor a la etapa más cargada | La tarea programada diaria: cumple la letra de la cláusula y empeora el resultado. Se difiere a `004`, donde `RF-14` la justifica por volumen |
| Columna de rango con SQL a mano en `Ocupacion` | La restricción de exclusión de la regla RN-09 exige un tipo de rango, que el mapeador no modela | Dos columnas de fecha y verificación en la aplicación: es exactamente lo que la constitución prohíbe cuando la base puede imponerlo |
