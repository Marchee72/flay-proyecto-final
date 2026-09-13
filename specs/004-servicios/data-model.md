# Fase 1 — Modelo de datos: `004-servicios`

Materializa el punto 7 para las entidades de reclamos, reservas, comunicación y asistencia
automática, y las cinco vistas materializadas de § 7.7. Como en `003`: importes en `NUMERIC`, cero
punto flotante, y **la base impone lo que puede imponer** —`CHECK` para RN-11, exclusión para
RN-10, disparador de auditoría sobre las tablas económicas nuevas—.

Nomenclatura: español y `snake_case` en la base. Todo lo que declara `consorcio_id` queda alcanzado
por la extensión de aislamiento de `001` sin escribir un filtro.

## Lo que cambia en lo ya construido

### `TrabajoPendiente.tipo` — enumerado

Cuatro valores nuevos: `notificacion`, `extraccion_comprobante`, `triage_reclamo`,
`indexar_documento`. Cada uno con su manejador en `src/aplicacion/pendientes/manejadores.ts`. La
cola no cambia.

### `Notificacion`

Sin campos nuevos. Cambia que ahora **toda** fila nace con su `TrabajoPendiente` de tipo
`notificacion` en la misma transacción (research R-07), y una migración de datos encola las que
`003` dejó en `pendiente`. `tipo` gana `reserva_rechazada`; `vencimiento_proximo` queda declarado y
sin uso, como en `003`.

### `Comprobante`

**No se toca** (research R-04). El comprobante de la carga asistida existe primero como clave de
objeto dentro de `ExtraccionComprobante` y se vuelve `Comprobante` al confirmar.

## Entidades nuevas

### `Reclamo` — **económica cuando se vincula a un gasto**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | Clave |
| `consorcio_id` | UUID | Obligatorio. Aislado |
| `unidad_id` | UUID nulo | Nulo cuando el reclamo es de un área común |
| `creado_por` | UUID | Usuario autor |
| `titulo` | `VARCHAR(140)` | |
| `descripcion` | `TEXT` | |
| `alcance` | enum | `individual`, `general` |
| `rubro_id` | UUID nulo | Del catálogo global |
| `urgencia` | enum | `baja`, `media`, `alta`, `critica`. Por defecto `media` |
| `estado` | enum | `abierto`, `asignado`, `en_curso`, `resuelto`, `cerrado`, `rechazado` |
| `responsable_id` | UUID nulo | **`CHECK (estado = 'abierto' OR responsable_id IS NOT NULL)`** — regla RN-11 en la base (SC-004) |
| `proveedor_id` | UUID nulo | Proveedor del consorcio |
| `gasto_id` | UUID nulo | El gasto que el reclamo generó, si lo hubo (`FR-008`, fuente de I-3) |
| `fecha_apertura` | timestamptz | |
| `fecha_resolucion` | timestamptz nulo | Se escribe al pasar a `resuelto`; se **sobrescribe** en una reapertura resuelta de nuevo: I-4 mide hasta el último cierre (caso límite de la spec) |

Índice `(consorcio_id, estado, fecha_apertura)` para la bandeja (§ 7.6).

Transiciones válidas (dominio, `src/dominio/reclamos/estado.ts`):

```text
abierto   → asignado | rechazado
asignado  → en_curso | rechazado | abierto      (quitar responsable vuelve a abierto)
en_curso  → resuelto | asignado
resuelto  → cerrado | en_curso                  (el autor puede reabrir si no se resolvió)
cerrado   → abierto                             (reapertura: deja asiento como cualquier otra)
rechazado → (final)
```

### `ReclamoHistorial`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | |
| `reclamo_id` | UUID | Obligatorio |
| `estado_anterior` | enum nulo | Nulo sólo en el asiento de creación |
| `estado_nuevo` | enum | |
| `comentario` | `TEXT` nulo | |
| `usuario_id` | UUID | Quien produjo el cambio |
| `ocurrido_en` | timestamptz | |

Sin `consorcio_id`: se alcanza por `Reclamo` (decisión 10 de `CLAUDE.md`). Un asiento por
transición, escrito en la misma transacción que el cambio de estado (SC-003, research R-09). El
asiento de creación (`null → abierto`) también existe: es el que le da a I-4 la apertura.

### `SugerenciaReclamo`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | |
| `reclamo_id` | UUID | **Único**: una sugerencia por reclamo |
| `rubro_sugerido_id` | UUID nulo | |
| `urgencia_sugerida` | enum nulo | |
| `proveedor_sugerido_id` | UUID nulo | Limitado a proveedores del consorcio: el clasificador recibe la lista y el manejador **verifica** que el devuelto esté en ella |
| `horas_estimadas` | `INTEGER` nulo | |
| `confianza` | `NUMERIC(4,3)` nulo | |
| `aceptada` | `BOOLEAN` nulo | Nulo hasta que el administrador aplica (`true`) o descarta (`false`). Fuente de `v_precision_asistencia` |
| `procesado_en` | timestamptz | |

### `EspacioComun`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | |
| `consorcio_id` | UUID | Aislado |
| `nombre` | `VARCHAR(80)` | Único por consorcio |
| `capacidad_maxima` | `INTEGER` nulo | |
| `anticipacion_minima_horas` | `INTEGER` | Por defecto 48 |
| `anticipacion_maxima_dias` | `INTEGER` | Por defecto 60 |
| `duracion_maxima_horas` | `INTEGER` | Por defecto 8 |
| `reservas_max_mes_unidad` | `INTEGER` | Por defecto 2 |
| `requiere_deposito` | `BOOLEAN` | Por defecto `false`. El cobro del depósito **no** se construye en esta etapa: el campo existe para que el reglamento se pueda cargar entero |
| `importe_deposito` | `NUMERIC(14,2)` nulo | |
| `activo` | `BOOLEAN` | La baja lógica; las reservas futuras de un espacio dado de baja se cancelan y notifican (caso límite) |

### `Reserva`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | |
| `consorcio_id` | UUID | Aislado (el diccionario no lo lleva; se agrega por la decisión 10: la bandeja de reservas se consulta directo) |
| `espacio_id` | UUID | |
| `unidad_id` | UUID | |
| `solicitada_por` | UUID | |
| `desde`, `hasta` | timestamptz | `CHECK (desde < hasta)` |
| `cantidad_personas` | `INTEGER` nulo | `CHECK (<= capacidad_maxima)` lo valida la aplicación, porque cruza tablas |
| `estado` | enum | `pendiente`, `confirmada`, `cancelada`, `cumplida`, `rechazada` |
| `motivo_rechazo` | `TEXT` nulo | Lo que el mensaje al solicitante dice |
| `observaciones` | `TEXT` nulo | |

**Restricción de exclusión** (research R-08):

```sql
ALTER TABLE "Reserva" ADD CONSTRAINT reserva_sin_superposicion
  EXCLUDE USING gist (espacio_id WITH =, tstzrange(desde, hasta) WITH &&)
  WHERE (estado = 'confirmada');
```

Es RN-10 en la base (SC-005). La aplicación traduce el error `23P01` a «ese horario ya está
reservado». La deuda vencida se verifica **antes** de insertar, con el saldo de `003` (`FR-011`,
SC-006).

### `Novedad`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | |
| `consorcio_id` | UUID | Aislado |
| `titulo` | `VARCHAR(140)` | |
| `cuerpo` | `TEXT` | |
| `publicada_por` | UUID | |
| `publicada_en` | timestamptz | |
| `fijada` | `BOOLEAN` | |

La publicación crea una `Notificacion` de tipo `novedad` por cada usuario con habilitación vigente
en el consorcio, cada una con su trabajo.

### `DocumentoConsorcio`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | |
| `consorcio_id` | UUID | Aislado |
| `tipo` | enum | `reglamento_copropiedad`, `reglamento_interno`, `acta`, `contrato`, `poliza`, `otro` |
| `titulo` | `VARCHAR(200)` | |
| `clave_almacenamiento` | `VARCHAR(400)` | `documentos/<consorcio>/<id>.pdf`, subida directa como los comprobantes |
| `tipo_contenido` | `TEXT` | Sólo `application/pdf` en esta etapa |
| `hash_sha256` | `CHAR(64)` nulo | Lo calcula el indexador al bajar los bytes; nulo hasta entonces |
| `fecha_documento` | `DATE` nulo | |
| `visible_consorcistas` | `BOOLEAN` | `false` → sólo administrador y consejo (SC-016) |
| `estado_indexacion` | enum | `pendiente`, `procesando`, `indexado`, `error` |
| `error_indexacion` | `TEXT` nulo | El motivo, legible |
| `cargado_por` | UUID | |

La baja está diferida (§ 9.11): se opera por soporte, con `DELETE` en cascada sobre los fragmentos.

### `FragmentoDocumento`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | |
| `documento_id` | UUID | Cascada al borrar el documento |
| `numero_fragmento` | `INTEGER` | Único por documento |
| `pagina` | `INTEGER` nulo | Para la cita |
| `contenido` | `TEXT` | |
| `vector` | `vector(768)` | `Unsupported` en Prisma; se escribe y se consulta en SQL. Índice `HNSW (vector vector_cosine_ops)` |

Sin `consorcio_id`: **nunca se consulta directo**. La única consulta une con `DocumentoConsorcio`
y filtra por consorcio y visibilidad en el `WHERE` (research R-06, `FR-029`).

### `ConsultaDocumental`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | |
| `consorcio_id` | UUID | Aislado |
| `usuario_id` | UUID | |
| `pregunta` | `TEXT` | |
| `respuesta` | `TEXT` nulo | Nulo cuando `sin_respaldo` |
| `fragmentos_citados` | `JSONB` | `[{ fragmento_id, documento_id, titulo, pagina }]`; vacío cuando `sin_respaldo` |
| `sin_respaldo` | `BOOLEAN` | Verdadero cuando ningún fragmento pasó el piso **o** el generador no citó ninguno (SC-014, SC-015) |
| `util` | `BOOLEAN` nulo | Valoración del usuario |
| `consultado_en` | timestamptz | |

### `ExtraccionComprobante` — **económica**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | |
| `consorcio_id` | UUID | Aislado (research R-04) |
| `clave_objeto` | `TEXT` | El archivo subido, antes de que exista el gasto |
| `tipo_contenido` | `TEXT` | |
| `comprobante_id` | UUID nulo | Se completa al confirmar, cuando nacen `Gasto` y `Comprobante` |
| `proveedor_detectado` | `VARCHAR(160)` nulo | |
| `cuit_detectado` | `VARCHAR(13)` nulo | |
| `fecha_detectada` | `DATE` nulo | |
| `importe_detectado` | `NUMERIC(14,2)` nulo | Cadena hacia la interfaz |
| `rubro_sugerido_id` | UUID nulo | |
| `confianza` | `NUMERIC(4,3)` nulo | |
| `confianza_por_campo` | `JSONB` nulo | |
| `estado` | enum | `pendiente` (esperando al extractor), `propuesta` (lista para revisar), `confirmada`, `corregida`, `descartada`, `no_disponible` (el servicio no respondió: formulario vacío) |
| `confirmada_por` | UUID nulo | |
| `campos_corregidos` | `JSONB` nulo | `["importe", "rubro"]`: lo que la persona cambió. Fuente de I-5 y `v_precision_asistencia` |
| `gasto_id` | UUID nulo | El gasto que nació al confirmar (SC-017: **ninguna** fila de `Gasto` sin `confirmada_por`) |
| `cargado_por` | UUID | |
| `procesado_en` | timestamptz nulo | |

Enganchada a `fn_auditar()`: toca dinero propuesto y es la evidencia de RN-14.

## Vistas materializadas (§ 7.7)

Todas con `consorcio_id`; se leen sólo desde `src/infraestructura/repositorios/indicadores.ts`, que
exige el consorcio activo o la lista de consorcios habilitados (research R-11). Se refrescan con
`REFRESH MATERIALIZED VIEW CONCURRENTLY`, que exige un índice único por vista.

| Vista | Grano | Columnas clave | Indicador |
|---|---|---|---|
| `v_morosidad_consorcio` | consorcio × mes | `deuda_vencida NUMERIC(14,2)`, `masa_liquidada NUMERIC(14,2)`, `porcentaje NUMERIC(5,2)`, `unidades_en_mora INTEGER` | I-1, I-6 |
| `v_gasto_rubro_periodo` | consorcio × rubro × período | `importe NUMERIC(14,2)`, `promedio_movil_12 NUMERIC(14,2)` nulo si hay menos de doce, `desvio_porcentual NUMERIC(6,1)` nulo si no hay promedio | I-2, I-6 |
| `v_desempeno_proveedor` | consorcio × proveedor × rubro | `costo_acumulado NUMERIC(14,2)`, `contrataciones INTEGER`, `costo_promedio NUMERIC(14,2)`, `horas_medias_resolucion NUMERIC(8,1)` nulo sin reclamos | I-3 |
| `v_resolucion_reclamos` | consorcio × rubro × urgencia | `cantidad INTEGER`, `mediana_horas NUMERIC(8,1)`, `p90_horas NUMERIC(8,1)` | I-4, I-6 |
| `v_precision_asistencia` | consorcio × mes | `extracciones_confirmadas`, `sin_correccion`, `sugerencias`, `aceptadas`, `horas_apertura_a_liquidacion NUMERIC(8,1)` | I-5 |

`porcentaje` y `desvio_porcentual` se redondean **una vez**, en la vista, con `ROUND(..., 2)` y
`ROUND(..., 1)` sobre `NUMERIC`. La nómina nominada de I-1 **no** es una vista: es la consulta de
morosidad de `003`, que ya está restringida por rol (RN-13, SC-011).

## Auditoría

Se enganchan a `fn_auditar()`: `ExtraccionComprobante`, `Reclamo` (por `gasto_id`) y `Reserva`
(por `importe_deposito` futuro y porque restringe un derecho de uso). `SugerenciaReclamo`,
`Novedad`, `DocumentoConsorcio`, `FragmentoDocumento` y `ConsultaDocumental` no son económicas y
no se auditan (SC-021 cuenta las tres primeras).
