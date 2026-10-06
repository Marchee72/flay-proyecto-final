# Implementation Plan: Asistente conversacional (RF-27)

**Branch**: `005-asistente-conversacional` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-asistente-conversacional/spec.md`

## Summary

Asistente conversacional dentro del panel de un consorcio que entiende pedidos en lenguaje
natural y los **enruta a los casos de uso existentes**, respondiendo solo con lo que el usuario
ya puede ver y operar según su rol, ocupación y consorcio. Las lecturas se ejecutan y responden
con datos reales (minimizados hacia el proveedor de IA); las escrituras se **proponen** y solo se
ejecutan tras una confirmación humana idempotente. Técnicamente se suma una **quinta interfaz al
contrato de asistencia del dominio** (`AgenteConversacional`, con llamado a herramientas) con sus
tres implementaciones (proveedor, determinista, nula), un **registro de herramientas** que mapea
intenciones a casos de uso ya existentes, un orquestador en la capa de aplicación, dos tablas de
persistencia y un widget de UI con sus server actions.

## Technical Context

**Language/Version**: TypeScript 5.x sobre Next.js 15.5 (App Router), React 19, Node ≥22.21.

**Primary Dependencies**: Prisma 6.7 (+ extensión de aislamiento propia), Auth.js v5, Zod 3.24,
`@google/genai` 2.22 (único importador del SDK: `src/infraestructura/asistencia/gemini.ts`),
`lucide-react`. Sin librerías nuevas (ni de chat, ni de markdown, ni de estado).

**Storage**: PostgreSQL 18 con `pgvector`. Dos tablas nuevas (`ConversacionAsistente`,
`MensajeAsistente`) vía migración versionada. La búsqueda vectorial para reglamentos se reutiliza
de RF-20 sin cambios.

**Testing**: Vitest (dominio sin base, integración contra base local) y Playwright (e2e escritorio
+ teléfono 390×844, a11y axe). Las pruebas de IA corren con `FLAY_ASISTENCIA=determinista`
(ya fijado en `pruebas/integracion/entorno.ts` y `playwright.config.ts`).

**Target Platform**: Web responsiva; despliegue único (Vercel + Postgres administrado).

**Project Type**: Aplicación web en capas (Presentación → Aplicación → Dominio; Infraestructura al
costado). No microservicios (Principio III).

**Performance Goals**: respuesta de lectura del asistente dentro del presupuesto general de
consulta (RNF-06, p95 < 2 s) **excluyendo** la latencia propia del proveedor de IA, que se maneja
con el estado de "pensando" y la degradación.

**Constraints**: datos minimizados al proveedor (RNF-13, Ley 25.326); el modelo nunca decide una
escritura (Principio IV); aislamiento por consorcio en un solo lugar (Principio I); mensajes de
error para el usuario final (RNF-10); degradación sin bloquear el panel (RNF-14).

**Scale/Scope**: v1 con ~13 herramientas de lectura/escritura sobre casos de uso existentes; una
conversación por usuario y consorcio activa a la vez; historial acotado a los últimos turnos.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Cómo lo cumple este diseño | Verificación |
|---|---|---|
| **I. Aislamiento por consorcio (NN)** | El asistente no toca Prisma: cada herramienta llama un caso de uso que ya corre dentro de `conAutorizacion`. El registro solo filtra qué se *ofrece* por rol (UX), nunca autoriza. No se agregan filtros `consorcioId` a mano → respeta `filtro-unico.spec.ts`. | Pruebas SC-001/SC-002: consorcista no obtiene datos ajenos ni nómina nominada. |
| **II. Exactitud del dinero (NN)** | El asistente no calcula dinero; muestra lo que devuelve el caso de uso. Importes como cadena (contrato de asistencia ya lo exige). | El modelo nunca redacta una cifra (FR-010, SC-004). |
| **III. El dominio no conoce la infraestructura** | La capacidad conversacional se declara como interfaz del dominio (`AgenteConversacional`) e se implementa en infraestructura. El orquestador (aplicación) recibe la asistencia por parámetro (punto de composición `dependencias.ts`). | Compila sin que dominio importe infraestructura; reutiliza el patrón de RF-20. |
| **IV. La asistencia automática no decide** | Escrituras solo por tarjeta de confirmación; la propuesta se persiste y se ejecuta por id, una sola vez. Reglamentos siempre con cita (reusa RF-20). Degradación elegante con las tres implementaciones. | SC-003/SC-005/SC-007 + prueba con servicio deshabilitado. |
| **V. Auditoría completa e inviolable** | Las escrituras se ejecutan por los mismos casos de uso ya auditados por disparadores; el asistente no abre un camino paralelo. Las tablas nuevas no son datos económicos. | FR-009; la bitácora se puebla igual que desde la UI. |

**Resultado**: PASA. Sin violaciones; sección de Complejidad vacía.

Notas de disciplina (del Flujo de desarrollo): rama propia ya creada; commits citan `RF-27`;
TDD **no** es obligatorio aquí (no es núcleo económico) pero se escriben pruebas de aislamiento,
gating de escritura y minimización; la definición de terminado exige verificar aislamiento (cond.
3), teléfono (cond. 4), errores comprensibles (cond. 5) y documentación (cond. 8).

## Project Structure

### Documentation (this feature)

```text
specs/005-asistente-conversacional/
├── plan.md              # Este archivo
├── research.md          # Decisiones de diseño y alternativas
├── data-model.md        # Entidades nuevas y estados
├── quickstart.md        # Validación end-to-end
├── contracts/           # Contrato del dominio + firmas de casos de uso + registro de herramientas
└── checklists/requirements.md
```

### Source Code (repository root)

```text
src/
├── dominio/contratos/
│   └── asistencia.ts                  # (+) AgenteConversacional y tipos; se suma a Asistencia
├── infraestructura/asistencia/
│   ├── gemini.ts                      # (+) agente con function calling
│   ├── determinista.ts                # (+) agente por palabra clave (pruebas)
│   └── nula.ts                        # (+) agente noDisponible (degradación)
├── aplicacion/
│   ├── dependencias.ts                # (~) cablea ASISTENCIA.agente
│   └── asistente/                     # (NUEVO)
│       ├── herramientas.ts            # registro: intención → caso de uso (lectura/escritura)
│       ├── minimizar.ts               # quita nombre/correo/tel/documento antes de ir al modelo
│       ├── conversar.ts               # orquestador (loop acotado, persiste, arma tarjetas)
│       └── confirmar.ts               # ejecuta/descarta una propuesta por id (idempotente)
└── app/(panel)/consorcios/[consorcio]/asistente/   # (NUEVO)
    ├── acciones.ts                    # 'use server': enviar, confirmar, descartar
    └── asistente.tsx                  # 'use client': widget, tarjetas, citas

prisma/
├── schema.prisma                      # (~) ConversacionAsistente, MensajeAsistente
└── migrations/<ts>_asistente/…        # (NUEVO) migración versionada

pruebas/
├── integracion/asistente.spec.ts      # (NUEVO) alcance, minimización, gating, idempotencia
└── e2e/asistente.spec.ts              # (NUEVO) reserva por chat, admin asigna, degradación, teléfono+axe
```

**Structure Decision**: aplicación web en capas existente. El widget se monta en el marco del
consorcio (`src/app/(panel)/consorcios/[consorcio]/layout.tsx` o `marco.tsx`), nunca fuera de una
ruta de consorcio. Todo el acceso a IA sigue entrando por `src/infraestructura/asistencia/` (único
lugar que conoce el proveedor), y toda lectura/escritura por casos de uso ya existentes.

## Complexity Tracking

Sin violaciones de la constitución. No aplica.
