# Implementation Plan: 003-liquidacion

**Branch**: `003-liquidacion` | **Date**: 2026-09-10 | **Spec**: [`spec.md`](spec.md)

**Input**: Feature specification from `/specs/003-liquidacion/spec.md` (38 FR, 19 SC, 8
clarificaciones de la sesión 2026-09-10)

## Summary

La etapa de mayor riesgo del proyecto: el motor que reparte el dinero. Períodos con su máquina de
estados completa, liquidación con prorrateo e intereses, documento por unidad, pagos con imputación
por antigüedad. `RF-07`, `RF-08` y `RF-09`; casos de uso `CU-03`, `CU-04` y `CU-06`.

El enfoque es el que el Principio III vuelve posible: **el cálculo entero vive en el dominio y se
prueba sin base de datos**, y la capa de aplicación se limita a autorizar, transaccionar y persistir.
Encima de eso, tres cosas que la base impone y el código no puede olvidar: el candado de la emisión
doble como índice único parcial, la auditoría por disparador sobre las cinco tablas económicas, y la
suma de coeficientes verificada antes de calcular nada.

Lo que esta etapa **no** hace: despachar notificaciones —`004-servicios` construye el despachador
sobre las filas que acá se crean— ni repartir gastos por grupo de unidades, que la clarificación
descartó explícitamente (`FR-006b`, hueco H-11).

## Technical Context

**Language/Version**: TypeScript 5 sobre Next.js 15.5.25, Node.js 22.21.0

**Primary Dependencies**: las de `002`, más `@react-pdf/renderer` 4.1.3 para el documento por unidad.
**Ninguna dependencia nueva**: la aritmética de fechas del interés se resuelve con las primitivas del
lenguaje (research R-05)

**Storage**: PostgreSQL 18.6 en Neon `sa-east-1`. Índice único **parcial** para el candado de la
emisión (research R-03); documentos como objetos en el mismo almacén que los comprobantes, con una
operación nueva del puerto para bytes producidos por el servidor (research R-01)

**Testing**: Vitest (proyectos `dominio` sin base e `integracion`), Playwright. **TDD obligatorio**
en prorrateo, intereses e imputación (§ 8.3.3), y el paquete 4.2 se hace **en pares** (§ 10).
Cobertura del **100 % de ramas** en el paquete de dominio (SC-014): es el único del sistema con ese
umbral

**Target Platform**: Vercel + Neon; navegadores actuales de escritorio y teléfono

**Project Type**: Aplicación web Next.js App Router en despliegue único, con capas por carpeta

**Performance Goals**: liquidación de 100 unidades en menos de 30 s (RNF-07, SC-006), sin contar
documentos; los 96 documentos en menos de 10 minutos con progreso, reintento y alerta observables
(SC-007)

**Constraints**: cuadratura con **tolerancia cero** (SC-001); cero punto flotante en dinero; una
diferencia mayor a un centavo por unidad **aborta** (SC-003); cero liquidaciones a medias (SC-010);
cero documentos de otra unidad accesibles (SC-008); cero nombres de deudores para el consorcista
(SC-015); coincidencia **al centavo** contra las tres planillas del cliente (SC-005)

**Scale/Scope**: 6 entidades nuevas, 3 casos de uso, 3 planillas de validación, 194 h en 6 semanas

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principio | Veredicto | Cómo se cumple en este plan |
| --- | --- | --- |
| I Aislamiento (NO NEGOCIABLE) | PASS | `Liquidacion` y `Pago` declaran `consorcio_id` y quedan alcanzadas por la extensión de `001`: ninguna consulta escribe el filtro. `DetalleLiquidacion`, `InteresLiquidado` y `PagoImputacion` cuelgan de ellas. La nómina nominada y la agregada son **dos consultas distintas**, no un filtro de pantalla (`FR-029`). SC-008 y SC-015 |
| II Exactitud del dinero (NO NEGOCIABLE) | PASS | El cálculo entero en el dominio con `decimal.js` (research R-04); redondeo sólo al final; el ajuste en campo propio; aborto por encima de un centavo por unidad; coeficiente y tasa copiados al detalle; el interés **desglosado** en su propia tabla para que se pueda rehacer meses después (research R-07). TDD obligatorio y 100 % de ramas |
| III Dominio↔infraestructura | PASS | `src/dominio/liquidacion` no importa infraestructura ni el entorno web; el contrato de puertos se extiende con `guardar` en `AlmacenObjetos`. Las pruebas del motor corren con `DATABASE_URL` sin definir (SC-002) |
| IV La asistencia no decide | PASS | Sin funciones asistidas en esta etapa |
| V Auditoría inviolable | PASS | Las cinco tablas económicas enganchadas a `fn_auditar()`; la aplicación sigue sin permisos sobre la bitácora. SC-012 |

**Restricciones técnicas**: migraciones versionadas · integridad impuesta por la base donde puede
imponerla —índice único parcial para la regla RN-06, disparador para la auditoría— · importes
serializados como cadena · 390 px y WCAG 2.1 AA en la descarga de la expensa (SC-016) · mensajes que
un administrador pueda leer cuando el motor aborta (RNF-10).

### Cumplimiento diferido, declarado

| Cláusula | Qué dice | Qué hace esta etapa | Cómo se cierra |
| --- | --- | --- | --- |
| Notificaciones (`RF-14`) | El sistema avisa al consorcista | Crea las `Notificacion` en estado `pendiente`, con destinatario y contenido | `004-servicios` construye el despachador sobre esas mismas filas (`FR-015`, hallazgo 2) |

Lo que la cláusula protege —que el aviso no se pierda aunque el correo no exista todavía— se cumple
entero. Lo que se difiere es el envío.

## Project Structure

### Documentation (this feature)

```text
specs/003-liquidacion/
├── plan.md              # Este archivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/           # Fase 1
│   ├── motor-liquidacion.md
│   └── liquidacion-y-pagos.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── app/(panel)/
│   ├── periodos/                  # cerrar, liquidar, anular            (CU-03)
│   ├── liquidaciones/             # emisión, detalle, documentos
│   ├── expensas/                  # descarga del consorcista            (CU-06)
│   ├── pagos/                     # alta e imputación                   (CU-04)
│   └── morosidad/                 # nómina y agregado, por rol
├── aplicacion/
│   ├── liquidacion/               # cerrar, liquidar, anular, documentos
│   └── pagos/                     # registrar, imputar, estado de cuenta
├── dominio/
│   ├── liquidacion/               # TDD: prorrateo, interés, imputación
│   └── periodos/estado.ts         # ya existe, NO se toca (M-04)
├── infraestructura/
│   ├── documentos/                # @react-pdf/renderer tras un puerto
│   └── objetos/                   # se extiende con `guardar`
└── compartido/dinero.ts           # ya existe

prisma/migrations/                 # una por bloque; índice parcial y disparadores a mano
pruebas/
├── dominio/liquidacion/           # el grueso: 100 % de ramas
├── integracion/                   # transacción, candado, reversión, auditoría
├── e2e/                           # CU-03, CU-04, CU-06 + a11y
└── planillas/                     # validación contra las tres reales (paquete 4.6)
scripts/
├── validar-planillas.mjs          # SC-005
└── medir-liquidacion.mjs          # SC-006
```

**Structure Decision**: se conserva la estructura por capas, sin proyectos ni paquetes nuevos. El
único agregado a la forma de `002` es `pruebas/planillas/`, que existe porque la validación contra
los datos del cliente no es una prueba de integración más: es la condición de aceptación del
entregable (§ 6.4.1) y tiene que poder correrse sola.

## Complexity Tracking

| Violación | Por qué se necesita | Alternativa más simple, y por qué se rechaza |
| --- | --- | --- |
| `InteresLiquidado`, una tabla sólo para el desglose | El interés de una unidad es la suma de un cálculo por cada liquidación impaga; un pago posterior cambia qué estaba impago, así que el total no se puede rehacer después | Guardar sólo el total y la tasa en el detalle: alcanza el día de la emisión y deja de alcanzar apenas alguien paga. La promesa de explicarle el importe a un propietario (RNF-10) se cae a los treinta días |
| Índice único **parcial** en vez de único a secas | Anular y reemitir tiene que ser posible, y `UNIQUE (periodo_id)` lo prohíbe para siempre | El único a secas que declara el punto 7: es lo que hay que corregir en el documento, no en el esquema |
| Disparo explícito de los documentos, además del drenaje oportunista | 96 documentos a cinco por pedido son veinte pedidos; SC-007 pide menos de diez minutos con progreso | Sólo el drenaje oportunista de `002`: depende de que alguien navegue. La tarea programada, otra vez, choca con la corrida diaria de la capa gratuita |
