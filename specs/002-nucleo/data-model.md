# Data Model — 002-nucleo (Fase 1)

Trece entidades nuevas más `BitacoraAuditoria`, que ya existe. Convenciones de § 7.4: identificador
universalmente único generado por la base, `creado_en` y `actualizado_en` en toda tabla, nombres en
español. Todo importe y todo coeficiente en `NUMERIC`; **ningún** tipo de punto flotante.

Las tablas marcadas **económicas** llevan el disparador `fn_auditar()` de `001-andamiaje` (FR-025).

## 1. Identidad y aislamiento

### `Persona`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | Clave, no secuencial (§ 12.3) |
| `nombre`, `apellido` | texto | Obligatorios |
| `documento` | texto | Único cuando está presente |
| `correo` | texto | Único cuando está presente |
| `telefono` | texto | Opcional |

Datos personales bajo Ley 25.326 (RNF-13). No cuelga de `Consorcio`: una persona puede ser
propietaria en varios.

### `Usuario`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | Clave |
| `persona_id` | UUID | Única: una persona tiene a lo sumo un usuario |
| `correo` | texto | **Único**. Es la identificación al iniciar sesión |
| `clave_derivada` | texto | Argon2id (FR-001). Nunca en texto plano |
| `estado` | enum | `invitado`, `activo`, `suspendido` |
| `bloqueado_hasta` | timestamptz nulo | Bloqueo temporal de FR-001b |

### `IntentoInicioSesion`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | Clave |
| `correo_probado` | texto | Se guarda aunque la cuenta no exista |
| `origen` | texto | Dirección de origen del pedido |
| `exitoso` | booleano | |
| `momento` | timestamptz | Índice por `(correo_probado, momento)` |

Cinco fallos consecutivos en la ventana bloquean quince minutos (FR-001b). El administrador puede
levantar el bloqueo poniendo `bloqueado_hasta` en nulo (FR-001c).

### `Habilitacion` — la tabla que materializa el Principio I

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | Clave |
| `usuario_id` | UUID | Obligatorio |
| `consorcio_id` | UUID | Obligatorio |
| `rol` | enum | `administrador`, `consejo`, `consorcista` (FR-007) |
| `vigencia_desde` | date | Obligatoria |
| `vigencia_hasta` | date nulo | Nulo = sin vencimiento |

Índice por `(usuario_id, consorcio_id)`. **Una habilitación no vigente equivale a inexistente**
(FR-004): la vigencia se evalúa contra la fecha, no contra la existencia de la fila.

## 2. Consorcios, unidades y coeficientes

### `Consorcio`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | Clave. **Raíz del aislamiento** |
| `nombre`, `direccion`, `localidad` | texto | Obligatorios |
| `cuit` | texto | Único |

Sin baja: está diferida (§ 9.11, FR-009).

### `Unidad` — **económica**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | Clave |
| `consorcio_id` | UUID | Obligatorio. Alcanzado por el aislamiento |
| `designacion` | texto | Única por consorcio (`1A`, `PB-2`) |
| `coeficiente` | `NUMERIC(11,8)` | Ocho decimales (FR-010) |

**Invariante**: por cada consorcio con al menos una unidad, la suma de coeficientes vigentes es
exactamente `100.00000000`, impuesta por disparador de restricción diferido (FR-011b, FR-011c).

### `CoeficienteHistorico` — **económica**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | Clave |
| `unidad_id` | UUID | Obligatorio |
| `coeficiente` | `NUMERIC(11,8)` | |
| `vigencia_desde` | date | **No puede ser anterior a hoy** (FR-012) |
| `vigencia_hasta` | date nulo | Se cierra al abrir el siguiente |

Permite reconstruir una liquidación pasada (regla RN-02). Modificar un coeficiente cierra la
vigencia anterior y abre una nueva **hacia el futuro**, en la misma transacción.

### `Ocupacion`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | Clave |
| `unidad_id` | UUID | Obligatorio |
| `persona_id` | UUID | Obligatorio |
| `tipo` | enum | `propietario`, `inquilino` |
| `vigencia` | **rango de fechas** | Tipo de rango de la base, no dos columnas |

**Restricción de exclusión** `EXCLUDE USING gist (unidad_id WITH =, tipo WITH =, vigencia WITH &&)`:
la base rechaza dos ocupaciones vigentes del mismo tipo sobre la misma unidad (regla RN-09, SC-005).

## 3. Gastos, rubros, proveedores y comprobantes

### `RubroGasto`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | Clave |
| `nombre` | texto | Único |
| `clasificacion` | enum | `ordinario`, `extraordinario` (regla RN-04) |

Precargado por semilla acordada con el cliente (FR-014). Alta y modificación diferidas (§ 9.11).

### `Proveedor`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | Clave |
| `consorcio_id` | UUID | Obligatorio |
| `razon_social` | texto | Obligatoria |
| `cuit` | texto | Único por consorcio |
| `rubro_habitual_id` | UUID nulo | Sugerencia al cargar un gasto |

Raíz del grafo de la etapa: se construye antes que `Gasto` (FR-015).

### `Periodo` — **económica**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | Clave |
| `consorcio_id` | UUID | Obligatorio |
| `anio`, `mes` | entero | **Único por consorcio** |
| `estado` | enum | `abierto`, `cerrado`, `liquidado`, `anulado` |

**Alcance de esta etapa: sólo apertura y listado** (FR-024). El enum declara los cuatro estados
porque `src/dominio/contratos` publica el contrato mínimo que `003-liquidacion` comparte (FR-017,
M-04), pero esta etapa **sólo produce `abierto`**. Las transiciones a `cerrado`, `liquidado` y
`anulado` son alcance de `003`.

### `Gasto` — **económica**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | Clave |
| `consorcio_id` | UUID | Obligatorio. Alcanzado por el aislamiento |
| `periodo_id` | UUID | Obligatorio. **Inmutable si el período no está `abierto`** (regla RN-03) |
| `rubro_id` | UUID | Obligatorio |
| `proveedor_id` | UUID nulo | |
| `importe` | `NUMERIC(14,2)` | Nunca punto flotante; viaja como cadena hacia la interfaz |
| `clasificacion` | enum | Heredada del rubro, congelada en el gasto (regla RN-04) |
| `fecha` | date | |
| `descripcion` | texto | |
| `cargado_por` | UUID | Usuario autor de la carga |

Índices para SC-006: `(consorcio_id, periodo_id, rubro_id)` y `(consorcio_id, fecha)`.

### `Comprobante` — **económica**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | Clave |
| `gasto_id` | UUID | Obligatorio |
| `clave_objeto` | texto | Ubicación en el almacenamiento; el archivo **no** está en la base |
| `tipo_contenido` | texto | PDF, JPEG, PNG, WebP, HEIC o TIFF (FR-018) |
| `bytes` | entero | Hasta 26.214.400 (25 MB) |
| `estado` | enum | `pendiente`, `disponible`, `fallido` |

`pendiente` es el estado mientras la subida directa no confirmó (FR-018b): el gasto ya existe y el
comprobante todavía no. El almacenamiento se consume por el puerto de FR-019.

## 4. Transversales

### `TrabajoPendiente`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | Clave |
| `tipo` | enum | `invitacion`, `confirmacion_subida` |
| `carga` | JSONB | Lo mínimo para reintentar; **sin datos personales innecesarios** |
| `estado` | enum | `pendiente`, `despachado`, `agotado` |
| `intentos` | entero | |
| `proximo_intento` | timestamptz | Espera creciente |
| `ultimo_error` | texto nulo | Para diagnóstico, no para la interfaz |

Índice por `(estado, proximo_intento)`. El drenaje toma un lote con bloqueo de fila salteando lo
bloqueado, de modo que dos pedidos simultáneos no despachen lo mismo (FR-006b).

### `BitacoraAuditoria`

Creada en `001-andamiaje`. Esta etapa engancha `fn_auditar()` a las **cinco** tablas económicas:
`Unidad`, `CoeficienteHistorico`, `Periodo`, `Gasto` y `Comprobante` (FR-025, SC-007).

## 5. Grafo de dependencias

```text
Consorcio ─┬─ Unidad ── CoeficienteHistorico
           │     └─ Ocupacion ── Persona ── Usuario ── Habilitacion
           ├─ Periodo ──┐
           ├─ Proveedor ─┼─ Gasto ── Comprobante
           └─────────────┘     │
                          RubroGasto (sin consorcio: catálogo)
```

Orden de construcción: `Consorcio` → `Persona`/`Usuario`/`Habilitacion` → `Unidad` →
`CoeficienteHistorico`/`Ocupacion` → `RubroGasto`/`Proveedor` → `Periodo` → `Gasto` →
`Comprobante`. `RubroGasto` es catálogo global: **no** lleva `consorcio_id` y por eso queda fuera
del aislamiento a propósito.
