# Fase 1 — Modelo de datos: Vencimientos escalonados

Dos entidades nuevas y ajustes de semántica en entidades existentes. Toda cantidad de dinero en `Decimal`; los porcentajes en `Decimal` con escala suficiente.

## Entidad nueva — `TramoVencimiento` (configuración por consorcio)

Un tramo de la regla de vencimientos de un consorcio. 1 a 3 por consorcio.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `consorcioId` | uuid | FK a `Consorcio`. **Lleva `consorcio_id` → entidad aislada** por la extensión. |
| `orden` | int (1..3) | 1 = base. |
| `diaDelMes` | int (1..28) | Día del mes siguiente al período (como `diaVencimiento`). |
| `recargoPorcentaje` | Decimal(6,4) | Porcentaje; el del `orden` 1 es 0. |
| `creadoEn` / `actualizadoEn` | timestamptz | |

**Reglas de validación** (dominio, al guardar la regla completa):
- `orden` consecutivos desde 1; el tramo `orden = 1` tiene `recargoPorcentaje = 0`.
- `diaDelMes` estrictamente ascendentes por `orden`; todos ≤ 28.
- `recargoPorcentaje` del último tramo **< `Consorcio.tasaMoraMensual`** (D7).
- Entre 1 y 3 tramos.

**Índices / restricciones**: `@@unique([consorcioId, orden])`. Disparador de auditoría `fn_auditar` (RN-15).

**Compatibilidad**: un consorcio sin filas de `TramoVencimiento` se comporta como hoy — un único vencimiento al día `Consorcio.diaVencimiento`, recargo 0.

## Entidad nueva — `VencimientoLiquidacion` (snapshot congelado)

Copia, al emitir, de cada tramo sobre una liquidación concreta. **No lleva `consorcio_id`**: cuelga de `Liquidacion` (aislada), como `DetalleLiquidacion`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `liquidacionId` | uuid | FK a `Liquidacion`. |
| `orden` | int (1..3) | |
| `fecha` | date | Fecha concreta del tramo para el período (resuelta de `diaDelMes`). |
| `recargoPorcentaje` | Decimal(6,4) | Congelado al emitir. |

**Invariantes**:
- El tramo de mayor `orden` tiene `fecha == Liquidacion.vencimiento` (el "último vencimiento" / vence en firme).
- Inmutable tras la emisión (solo se crea en la transacción de liquidación).

**Índices**: `@@unique([liquidacionId, orden])`, `@@index([liquidacionId])`.

## Entidades existentes — ajustes de semántica (sin romper datos)

- **`Liquidacion.vencimiento`**: pasa a significar el **último** vencimiento (vence en firme). La mora (`interesPorMora`, `deudaVigentePorUnidad`) lo usa sin cambios. Para liquidaciones viejas (un solo vencimiento) sigue siendo correcto.
- **`DetalleLiquidacion.totalUnidad`**: es el **base** de la expensa (sin recargo). El recargo es derivado y no se persiste acá (D4). El arrastre al período siguiente usa el saldo propio des-arrastrado de este base (nota #4).
- **`Consorcio.diaVencimiento` / `tasaMoraMensual`**: se conservan. `diaVencimiento` es el día por defecto del último tramo; `tasaMoraMensual` participa de la validación D7.

## Relaciones

```text
Consorcio 1 ──< TramoVencimiento        (regla vigente, configurable)
Liquidacion 1 ──< VencimientoLiquidacion (snapshot congelado al emitir)
Liquidacion 1 ──< DetalleLiquidacion     (existente; totalUnidad = base)
```

## Estados / ciclo de vida de una expensa (derivado por fecha, no persistido)

Para una expensa emitida, dado `hoy` (hora AR) y sus `VencimientoLiquidacion`:

1. **En término / escalonando**: `hoy ≤ fecha(último)`. Exigible = `totalUnidad × (1 + recargoVigente(hoy))`. Estado de cobro: `pendiente` (o `pagada` si el saldo es 0).
2. **Vencida en firme**: `hoy > fecha(último)` y con saldo. Exigible = `totalUnidad` base (sin recargo). Estado: `vencida`. La mora se liquidará en el período siguiente sobre el base arrastrado.
3. **Pagada**: saldo des-arrastrado ≤ 0 en cualquier momento.
