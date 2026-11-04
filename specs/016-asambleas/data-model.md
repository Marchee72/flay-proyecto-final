# Data Model: Asambleas de consorcio

Convenciones del repositorio:

- identificadores UUID con `gen_random_uuid()`;
- `creadoEn` y `actualizadoEn` en todas las tablas;
- columnas en `snake_case` con `@map`;
- `Timestamptz(6)` para instantes;
- coeficientes en `Decimal(11,8)`.

**Toda tabla nueva lleva `consorcio_id`**, así queda aislada por la extensión (Principio I) y se
consulta directo, sin pasar por el padre (nota 10 de `CLAUDE.md`). Toda tabla nueva lleva
`fn_auditar` (RN-15).

## Cambios a entidades existentes

**`Consorcio`**: cuatro columnas nuevas (research R-13).

| Campo | Tipo | Default |
|---|---|---|
| `reglaMayoriaAsamblea` | enum `ReglaMayoria` (`presentes`, `totalidad`) | `presentes` |
| `anticipacionConvocatoriaDias` | `Int`, de 1 a 60 | 15 |
| `topeUnidadesPorApoderado` | `Int`, de 1 a 10 | 3 |
| `umbralExpensasSinVoto` | `Int`, de 0 a 24 | 2 (sin voto si adeuda **más de** este número) |

**Enums**:

- `TipoNotificacion` suma `asamblea_convocada`, `asamblea_cancelada`, `poder_otorgado`,
  `poder_revocado`, `decision_provisoria`, `acta_a_firmar` y `acta_firmada`.
- `TipoTrabajo` suma `correo_directo`.

## Entidades nuevas

### Asamblea

| Campo | Tipo | Notas |
|---|---|---|
| `id`, `consorcioId` | UUID | |
| `tipo` | `TipoAsamblea` (`ordinaria`, `extraordinaria`) | |
| `titulo` | `VarChar(200)` | |
| `fechaHora` | `Timestamptz` | primera convocatoria; la segunda es `+30 min`, derivada |
| `lugar` | `VarChar(300)` | |
| `organizadorId` | UUID → `Usuario` | |
| `administracionInvitada` | `Boolean` | `true` siempre si organiza la administración |
| `estado` | `EstadoAsamblea` | ver transiciones |
| `convocadaEn`, `canceladaEn`, `abiertaEn`, `constituidaEn`, `finalizadaEn` | `Timestamptz?` | |
| `convocatoriaQueRige` | `ConvocatoriaAsamblea?` (`primera`, `segunda`) | se fija al constituir |
| `dirigeId` | UUID? → `Usuario` | quien dirige ahora; cambia al tomar la dirección |
| `presidenteId`, `secretarioId` | UUID? → `Usuario` | elegidos entre los representantes presentes con usuario (`UnidadEnAsamblea.representanteId`); los dos firman el acta |
| `reglaMayoria`, `anticipacionDias`, `topeApoderado`, `umbralSinVoto` | | copiados del consorcio al convocar |

**Validaciones**:

- `convocar` exige `fechaHora ≥ hoy + anticipacionDias` (hora de Argentina) y al menos un punto.
- Un punto de opción múltiple tiene al menos dos opciones.

**Transiciones** (`src/dominio/asambleas/estado.ts`, espejadas en el disparador):

```text
borrador ──convocar──▶ convocada ──abrir──▶ en_curso ──finalizar──▶ finalizada
   │                       │                                            │
   └─(borrar)              └──cancelar──▶ cancelada                     └─(acta firmada)─▶ acta_firmada
```

- `en_curso → cancelada` solo si no se constituyó: es el caso de la asamblea sin quórum.
- `finalizar` exige la asamblea constituida y todos los puntos `cerrado`.

### PuntoAsamblea

| Campo | Tipo | Notas |
|---|---|---|
| `id`, `consorcioId`, `asambleaId` | UUID | |
| `orden` | `Int` | `UNIQUE (asamblea_id, orden)` |
| `titulo` | `VarChar(200)` | |
| `descripcion` | `Text?` | |
| `modalidad` | `ModalidadPunto` (`binaria`, `opcion_multiple`) | |
| `mayoria` | `MayoriaRequerida?` (`absoluta`, `dos_tercios`, `unanimidad`) | obligatoria si `binaria`, nula si `opcion_multiple` (`CHECK`) |
| `estado` | `EstadoPunto` (`pendiente`, `abierto`, `cerrado`) | a lo sumo un `abierto` por asamblea: índice único parcial `(asamblea_id) WHERE estado = 'abierto'` |
| `abiertoEn`, `cerradoEn` | `Timestamptz?` | |
| `resultado` | `ResultadoPunto?` (`aprobado`, `rechazado`, `sin_decision`) | se fija al cerrar |
| `opcionGanadoraId` | UUID? → `OpcionPunto` | solo `opcion_multiple` |
| `conteo` | `JsonB?` | conteos por opción en unidades y coeficientes (en texto) y bases, congelados al cerrar para el acta |
| `provisorio` | `Boolean` | default `false` |
| `vencePlazoOposicion` | `Timestamptz?` | `cerradoEn` + 15 días corridos; el aviso sale en la misma transacción |
| `resumen` | `Text?` | se redacta con el acta `en_redaccion` |
| `notas` | `Text?` | apuntes de la reunión, solo con el punto `abierto`; no van al acta |
| `borradorResumen` | `Text?` | propuesta de la IA; no cuenta hasta que una persona la guarda en `resumen` |

Para los puntos binarios, las opciones `positivo`, `negativo` y `abstencion` son fijas y no se
guardan en `OpcionPunto`: se modelan como enum `SentidoVoto`.

### OpcionPunto

`id`, `consorcioId`, `puntoId`, `orden` y `texto` (`VarChar(200)`), con
`UNIQUE (punto_id, orden)`. Solo para puntos `opcion_multiple`.

### Poder

| Campo | Tipo | Notas |
|---|---|---|
| `id`, `consorcioId`, `asambleaId` | UUID | |
| `unidadId` | UUID → `Unidad` | |
| `otorganteId` | UUID → `Persona` | propietario vigente de la unidad |
| `apoderadoId` | UUID → `Usuario` | habilitado en el consorcio |
| `origen` | `OrigenRegistro` (`en_linea`, `papel`) | |
| `registradoPorId` | UUID → `Usuario` | el otorgante, o quien cargó el papel |
| `revocadoEn` | `Timestamptz?` | |

**Restricciones e índices**:

- `UNIQUE (asamblea_id, unidad_id) WHERE revocado_en IS NULL`;
- el tope por apoderado se valida con un candado de transacción (research R-12);
- se revoca solo con la asamblea `convocada`.

### UnidadEnAsamblea (padrón congelado y asistencia)

| Campo | Tipo | Notas |
|---|---|---|
| `id`, `consorcioId`, `asambleaId`, `unidadId` | UUID | `UNIQUE (asamblea_id, unidad_id)` |
| `designacion` | `VarChar` | copiada, para el acta |
| `coeficiente` | `Decimal(11,8)` | copiado al abrir (RN-02) |
| `sinVoto` | `Boolean` | `vencidos > umbralSinVoto` al abrir (research R-04) |
| `presente` | `Boolean` | default `false` |
| `representanteId` | UUID? → `Usuario` | quien está presente por la unidad; nulo si quien dirige marca a alguien sin cuenta |
| `representanteNombre` | `VarChar?` | nombre para el acta, también cuando no hay usuario |
| `representacion` | `Representacion?` (`propietario`, `apoderado`) | |
| `acreditadoEn` | `Timestamptz?` | |
| `acreditadoPorId` | UUID → `Usuario` | |

Se insertan todas las filas al abrir, en una sola sentencia. Marcar presente es un `UPDATE` que
solo pasa de `false` a `true`: el disparador rechaza desmarcar y rechaza cambiar el representante
una vez fijado. Así se cumple que la primera persona que se registra representa la unidad.

### VotoAsamblea

| Campo | Tipo | Notas |
|---|---|---|
| `id`, `consorcioId`, `puntoId`, `unidadId` | UUID | `UNIQUE (punto_id, unidad_id)` |
| `sentido` | `SentidoVoto?` | binario |
| `opcionId` | UUID? → `OpcionPunto` | opción múltiple; `CHECK`: exactamente uno de los dos |
| `emitidoPorId` | UUID → `Usuario` | |
| `origen` | `OrigenVoto` (`propio`, `carga_manual`) | |
| `emitidoEn` | `Timestamptz` | `now()` de la base |

**Disparador `fn_voto_inmutable`**:

- rechaza el `DELETE`, y el `UPDATE` que cambia punto, unidad o consorcio;
- con el punto cerrado, rechaza todo `UPDATE`;
- rechaza el `INSERT` si el punto no está `abierto`, si la asamblea no está `en_curso` o si la
  unidad no está `presente`, o está `sinVoto`, en `UnidadEnAsamblea`.

### OposicionDecision

| Campo | Tipo | Notas |
|---|---|---|
| `id`, `consorcioId`, `puntoId`, `unidadId` | UUID | `UNIQUE (punto_id, unidad_id)` |
| `personaId` | UUID → `Persona` | propietario de la unidad ausente |
| `origen` | `OrigenRegistro` | |
| `registradoPorId` | UUID → `Usuario` | |
| `registradaEn` | `Timestamptz` | |

**Validación**:

- el punto es `provisorio` y `now() ≤ vencePlazoOposicion`;
- la unidad estaba ausente (`presente = false`) y con voto.

Lo controla un disparador; no admite `UPDATE`.

### ActaAsamblea

| Campo | Tipo | Notas |
|---|---|---|
| `id`, `consorcioId`, `asambleaId` | UUID | `UNIQUE (asamblea_id)` |
| `estado` | `EstadoActa` (`en_redaccion`, `a_firmar`, `firmada`) | |
| `claveContenido` | `VarChar(400)?` | PDF del contenido en `ALMACEN`, al enviar a firmar |
| `hashContenido` | `Char(64)?` | SHA-256 del PDF de contenido |
| `enviadaAFirmarEn` | `Timestamptz?` | |
| `recordatorioEnviadoEn` | `Timestamptz?` | research R-10 |
| `documentoId` | UUID? → `DocumentoConsorcio` | al quedar firmada |

Nace al finalizar la asamblea, en `en_redaccion`. Con `estado <> 'en_redaccion'`, el disparador
rechaza cambios en `resumen` de los puntos y en los firmantes.

### ObservacionAsamblea

| Campo | Tipo | Notas |
|---|---|---|
| `id`, `consorcioId`, `asambleaId` | UUID | |
| `usuarioId` | UUID → `Usuario` | `UNIQUE (asamblea_id, usuario_id)`: una por persona |
| `unidades` | `VarChar(200)` | las que representaba al escribir; vacío si dirige sin unidad |
| `texto` | `VarChar(1000)` | vacío deja la observación sin efecto |

El disparador solo admite altas y cambios con la asamblea `en_curso` y todos los puntos `cerrado`.
No se borra mientras la asamblea exista; cae en cascada con ella y queda en la bitácora por
`fn_auditar`.

### FirmanteActa

| Campo | Tipo | Notas |
|---|---|---|
| `id`, `consorcioId`, `actaId` | UUID | |
| `usuarioId` | UUID → `Usuario` | |
| `rolEnActa` | `RolFirmante` (`presidente`, `secretario`, `propietario`) | `UNIQUE (acta_id, usuario_id)`; exactamente 1 presidente, 1 secretario y 2 propietarios |
| `firmadoEn` | `Timestamptz?` | |
| `hashFirmado` | `Char(64)?` | debe igualar `hashContenido` |

Los firmantes se designan en `en_redaccion`. Firmar es un único `UPDATE` de `firmadoEn` y
`hashFirmado` sobre la fila propia: el disparador rechaza volver a firmar o cambiarlos después.

**Reemplazo**: con el acta `a_firmar`, el disparador admite un solo cambio, el de `usuarioId` en
una fila **sin firmar** (`firmadoEn IS NULL`), que deja el rol igual. Se registra el campo
`reemplazaA` (UUID? → `Usuario`, el anterior). Una fila firmada no admite ningún cambio. El
reemplazo queda en la bitácora por `fn_auditar`.
Cuando firma el último, la aplicación genera el PDF final y crea el `DocumentoConsorcio` en la
misma transacción (research R-09).

## Relaciones con lo existente

- `Unidad`, para el padrón y los poderes. Se filtra `bajaDesde: null` al congelar.
- `Persona`, para otorgantes, presidente y secretario. `Ocupacion` vigente dice quién es
  propietario: `ocupaUnidad`, `ocupantesVigentesDe` y `usuariosQueOcupan`.
- `Usuario` y `Habilitacion`: roles consejo y administrador, apoderados y firmantes.
- `saldoImpagoPorUnidad`: sin voto por mora.
- `Notificacion` y `TrabajoPendiente`: avisos y `correo_directo`.
- `DocumentoConsorcio` (`tipo: acta`): el acta firmada, indexada para RF-20.
