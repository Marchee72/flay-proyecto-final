# Data Model — Asistente conversacional (RF-27)

Dos entidades nuevas. Ambas de negocio, aisladas por consorcio a través de la entidad raíz
(`ConversacionAsistente`), igual que `DetalleLiquidacion` cuelga de `Liquidacion` (decisión #10 del
proyecto). No son datos económicos: las escrituras reales las hacen los casos de uso existentes,
ya auditados por disparadores.

## ConversacionAsistente

Un hilo entre un usuario y el asistente en el contexto de un consorcio.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID | PK, no secuencial. |
| `consorcioId` | UUID | FK a `Consorcio`. **Hace que la extensión de aislamiento la filtre.** |
| `usuarioId` | UUID | FK a `Usuario`. Dueño del hilo. |
| `creadaEn` | timestamptz | `@default(now())`. |
| `actualizadaEn` | timestamptz | `@updatedAt`. |

- Relación: `mensajes MensajeAsistente[]`.
- Índice: `@@index([consorcioId, usuarioId, actualizadaEn])` para traer el hilo activo del usuario.
- Autorización: se crea/lee siempre dentro de `conAutorizacion` del `conversar`.

## MensajeAsistente

Cada turno del hilo, en orden. Un turno de la asistente puede portar una **propuesta de acción**.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID | PK. |
| `conversacionId` | UUID | FK a `ConversacionAsistente`, `onDelete: Cascade`. **No** lleva `consorcioId`: se alcanza por su padre aislado. |
| `rol` | enum `RolMensaje` | `usuario` \| `asistente` \| `herramienta`. |
| `contenido` | text | Texto del turno (o resumen de la tarjeta, para el turno con propuesta). |
| `herramienta` | jsonb? | Para `rol = herramienta`: nombre + resultado **minimizado** (lo que vio el modelo). Auditoría de qué consultó. |
| `propuesta` | jsonb? | Para una escritura propuesta: `{ herramienta, argumentos }` validados. Nunca datos del cliente. |
| `estadoPropuesta` | enum `EstadoPropuesta`? | `null` si no es propuesta; si lo es: `pendiente` \| `confirmada` \| `descartada`. |
| `creadoEn` | timestamptz | `@default(now())`. Orden del hilo. |

- Índice: `@@index([conversacionId, creadoEn])`.
- Lectura: siempre por `conversacion.findMany({ include: { mensajes } })`; **nunca**
  `prisma.mensajeAsistente.findMany(...)` directo (no está aislado).

### Estados de la propuesta (idempotencia — FR-008)

```
          crear (orquestador)
                 │
                 ▼
            pendiente ──── confirmar (confirmar.ts, 1 sola vez) ──▶ confirmada
                 │                                                   (ejecuta el caso de uso real
                 │                                                    en la misma transacción)
                 └──────── descartar ──▶ descartada
```

- Solo una propuesta `pendiente` puede ejecutarse. La transición `pendiente → confirmada` y la
  ejecución del caso de uso ocurren en **una** transacción; un segundo intento encuentra
  `confirmada`/`descartada` y no hace nada (devuelve el resultado ya conocido o un aviso).
- Solo el `usuarioId` dueño de la conversación puede confirmar o descartar (se valida en
  `conAutorizacion` + pertenencia del hilo).

## Permisos de base (RNF-12 / Principio V)

Las dos tablas son de lectura/escritura normal para `flay_app` (cubiertas por los
`ALTER DEFAULT PRIVILEGES` de la migración inicial). No tocan `BitacoraAuditoria` ni relajan sus
permisos. Las operaciones económicas siguen pasando por sus casos de uso y sus disparadores.

## Reutilización (sin cambios de esquema)

El asistente **no** agrega campos a entidades existentes. Lee y escribe `Reserva`, `EspacioComun`,
`DetalleLiquidacion`/`Liquidacion`, `Pago`, `Reclamo`/`ReclamoHistorial`, `Gasto`, `Novedad`,
`Notificacion`, `DocumentoConsorcio`/`FragmentoDocumento`/`ConsultaDocumental` **solo** a través de
sus casos de uso.
