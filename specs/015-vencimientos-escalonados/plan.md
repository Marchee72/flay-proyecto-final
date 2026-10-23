# Implementation Plan: Vencimientos escalonados con recargo en las expensas

**Branch**: `015-vencimientos-escalonados` | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/015-vencimientos-escalonados/spec.md`

## Summary

Agregar, por consorcio, una regla de hasta 3 vencimientos escalonados, cada uno con su recargo porcentual. Dentro del mes, el monto a pagar de una expensa crece por tramo según la fecha. Si no se paga para el último vencimiento, la expensa vence en firme: arrastra su importe **base** al período siguiente, donde la mora-interés existente (RN-08) toma el relevo. Recargo y mora **conviven** sin pisarse (recargo dentro del mes, mora después), con la validación de que la mora mensual supere al último recargo.

**Enfoque técnico clave**: el `Liquidacion.vencimiento` actual (único) pasa a representar el **último** vencimiento (el que vence en firme), de modo que la mora existente sigue funcionando sin cambios. Los tramos anteriores y sus recargos se **congelan** en una tabla hija de la liquidación al emitir. El recargo es un importe **derivado** (no se persiste en `totalUnidad`), así que el arrastre del base ya es el comportamiento natural del modelo de saldo des-arrastrado.

## Technical Context

**Language/Version**: TypeScript sobre Next.js (App Router), Node.

**Primary Dependencies**: Prisma (ORM), Zod (validación), `@react-pdf/renderer` (PDF de la expensa), Recharts (sin uso aquí).

**Storage**: PostgreSQL (migraciones versionadas; sin cambios manuales). Cliente aislado por consorcio (`src/infraestructura/cliente-aislado.ts`).

**Testing**: Vitest de dominio (sin base; TDD **obligatorio** para el cálculo de recargo por ser dinero), Vitest de integración (contra base local), Playwright e2e/a11y.

**Target Platform**: aplicación web en despliegue único (Vercel), con panel de administración y vista del consorcista; debe verse en teléfono (RNF-01).

**Project Type**: aplicación web en capas (Presentación → Aplicación → Dominio; Infraestructura al costado).

**Performance Goals**: consultas < 2 s p95 (RNF-06); el cálculo del monto exigible por fecha es en memoria sobre datos ya cargados, sin consultas extra por unidad.

**Constraints**: aritmética decimal (punto flotante prohibido para dinero); redondeo solo al final del importe unitario; diferencia a la unidad de mayor coeficiente (RN-07); aislamiento por consorcio en un solo punto (Principio I); auditoría por disparadores (RN-15).

**Scale/Scope**: consorcios de hasta ~100 unidades (RNF-07); regla de 1 a 3 tramos por consorcio.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Aislamiento por consorcio (NO NEGOCIABLE)**: la tabla de configuración lleva `consorcio_id` → queda aislada automáticamente por la extensión (se escribe/lee en contexto de consorcio). El snapshot por liquidación **no** lleva `consorcio_id`: cuelga de `Liquidacion` (que sí lo lleva) y se lee entrando por la liquidación, igual que `DetalleLiquidacion` (CLAUDE.md nota 10). Ninguna consulta nueva escribe el filtro a mano → no entra a la lista blanca de `filtro-unico.spec.ts`. ✅ Cumple.
- **II. Exactitud del dinero (NO NEGOCIABLE)**: el recargo se calcula en `Decimal`, con redondeo solo al final del importe unitario; el recargo no se persiste en `totalUnidad` (es derivado), así que el arrastre del base es exacto por construcción. La nueva lógica de cálculo se desarrolla con **pruebas primero**. ✅ Cumple.
- **III. El dominio no conoce la infraestructura**: el cálculo del tramo vigente, el monto exigible y la validación mora>recargo viven en un módulo de dominio puro (`src/dominio/liquidacion/vencimientos.ts`); la aplicación orquesta y la infraestructura persiste. ✅ Cumple.
- **IV. La asistencia automática no decide**: no interviene IA. ✅ No aplica.
- **V. Auditoría completa e inviolable**: la configuración de vencimientos condiciona importes económicos → la tabla de configuración se cubre con el disparador `fn_auditar` en la migración, igual que el resto de las tablas económicas (RN-15). ✅ Cumple.

Sin violaciones; no se requiere *Complexity Tracking*.

## Project Structure

### Documentation (this feature)

```text
specs/015-vencimientos-escalonados/
├── plan.md              # Este archivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/           # Fase 1 (contratos de dominio y casos de uso)
└── tasks.md             # Fase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                         # + TramoVencimiento, + VencimientoLiquidacion
└── migrations/<nueva>/migration.sql      # tablas + disparador de auditoría

src/
├── dominio/liquidacion/
│   ├── vencimientos.ts                    # NUEVO: tramo vigente, monto exigible, validación mora>recargo (puro)
│   ├── saldo.ts                           # saldo des-arrastrado (base de #4; sin cambio o mínimo)
│   └── interes.ts                         # mora RN-08 (sin cambio: usa el último vencimiento)
├── aplicacion/
│   ├── consorcios/regla-vencimientos.ts   # NUEVO: ver/guardar la regla (autoriza, aísla, audita)
│   ├── liquidacion/
│   │   ├── liquidar.ts                     # congela los tramos al emitir
│   │   └── ver-expensa.ts                  # monto exigible/estado según fecha
│   └── pagos/
│       ├── estado-de-cuenta.ts             # refleja el monto exigible por fecha
│       └── registrar.ts                    # imputa contra el exigible con recargo vigente
└── app/(panel)/consorcios/[consorcio]/
    ├── (configuración)/...                 # ABM de la regla de vencimientos
    └── expensas/...                        # muestra los tramos y el monto por fecha

pruebas/
├── dominio/liquidacion/vencimientos.spec.ts   # NUEVO (TDD)
└── integracion/vencimientos-escalonados.spec.ts  # NUEVO
```

**Structure Decision**: aplicación web en capas ya existente; el cálculo nuevo entra como módulo de dominio puro, la orquestación en aplicación y la persistencia con una migración versionada. Se reutiliza el modelo de saldo des-arrastrado de la nota #4.

## Complexity Tracking

Sin violaciones de la constitución; sección no aplica.
