# Configuración desde la documentación, horarios de uso, reserva con deuda y proveedor desde la factura — diseño

Fecha: 2026-11-18. Origen: notas de prueba de Lautaro. Iteración 3 (servicios y análisis).

## Intención

Que dar de alta un consorcio sea leer su reglamento una vez y no transcribirlo pantalla por
pantalla. Hoy el administrador carga el reglamento como documento (`RF-19`) y después, a mano,
vuelve a escribir en el sistema lo que el reglamento ya dice: espacios comunes y sus reglas de
reserva, vencimientos y recargos, tasa de mora, reglas de asamblea. El sistema ya extrae el texto
del documento para las consultas (`RF-20`); se trata de que además **proponga** esa configuración y
el administrador la aplique con un clic.

Junto con eso, tres piezas chicas que salieron de la misma prueba:

- **Horarios de uso** de un espacio común, que hoy no se pueden configurar y el reglamento suele fijar.
- **El rechazo de la reserva por deuda vencida** deja de ser fijo y pasa a ser una opción **por
  espacio común**.
- **El proveedor desde la factura:** si la carga asistida detecta razón social y CUIT y no hay
  proveedor que coincida, se ofrece darlo de alta al confirmar.

## Objetivos

1. Al terminar de indexar un documento de la sección Documentación (reglamentos, actas y
   contratos), el sistema lo analiza y deja **sugerencias de configuración**, cada una con la cita
   del documento que la respalda.
2. El administrador ve las sugerencias de un documento con el valor actual y el propuesto, y las
   **aplica con un clic** o las descarta (enfoque B, elegido).
3. Un espacio común puede tener **horario de uso**; la reserva fuera de horario se rechaza; al
   cambiar el horario, las reservas confirmadas futuras que quedan afuera **se cancelan y se avisa**.
4. Cada espacio común tiene la opción **«rechazar reservas de unidades con deuda vencida»**,
   encendida por defecto.
5. Al confirmar una extracción de comprobante sin proveedor coincidente, con razón social y CUIT
   detectados, se ofrece **dar de alta el proveedor** en la misma confirmación.

## No-objetivos

- **Padrón y coeficientes** desde el reglamento de copropiedad (decisión propia). Los porcentuales
  tocan dinero, tienen su propia carga con suma exacta de 100 (decisión 7) y una propuesta errónea es
  un defecto económico; queda para una funcionalidad aparte si se pide.
- Sugerencias para usuarios, ocupaciones, proveedores o rubros desde la documentación.
- Edición de una sugerencia antes de aplicarla: se aplica tal cual o se descarta; corregir es
  editar después en la pantalla de siempre (consecuencia aceptada del enfoque B).
- Horarios distintos por día de la semana (decisión propia, ver § Horarios).
- Avisos de sugerencias en la bandeja; se ven en Documentación.

## Anti-objetivos

- **Que algo de la IA cambie la configuración sin que una persona lo apruebe** (RN-14). El clic de
  «Aplicar» es esa aprobación; sin clic no se escribe nada.
- Que una sugerencia aplicada saltee las validaciones de la pantalla de configuración: todo pasa por
  el mismo caso de uso que el formulario.
- Que el análisis bloquee o demore la carga del documento o su indexación.

## Restricciones

- Invariante 5: la interfaz de IA nueva tiene **tres implementaciones** (Gemini, determinística,
  nula). La nula devuelve «no disponible» y el documento queda sin sugerencias, sin error visible.
- Invariante 1: `SugerenciaConfiguracion` lleva `consorcio_id` y se lee por la extensión de
  aislamiento.
- Decisión 9 y 18: el análisis es un trabajo más de la cola `TrabajoPendiente`.
- Decisión 28: validadores de campo en el dominio, usados por el formulario y por el caso de uso.
- Auditoría: los cambios de configuración ya quedan en la bitácora porque se aplican por los casos
  de uso existentes; la sugerencia guarda quién la aplicó y cuándo.
- Migraciones versionadas; el enum `TipoTrabajo` suma un valor.

## Approaches

Se consideraron tres, todos con el análisis como trabajo de cola después de indexar:

- **A. Sugerencias que abren el formulario existente precargado.** Sin lógica nueva de aplicación,
  permite corregir antes de confirmar; diez sugerencias son diez pasadas por formularios.
- **B. Sugerencias con «Aplicar» de un clic.** *(Elegido por Lautaro.)* Más rápido para el
  administrador; exige un aplicador por tipo de sugerencia y no permite corregir antes de aplicar.
- **C. Por el asistente conversacional.** El asistente hoy no tiene herramientas de configuración,
  habría que escribirlas igual, y queda escondido en una conversación sin lista revisable. Descartado.

## Diseño

### 1. Horarios de uso (EspacioComun)

- Columnas nuevas en `EspacioComun`: `horaApertura` y `horaCierre` (`TIME`, ambas nulas = sin
  restricción; o ambas o ninguna, `CHECK`). **Decisión propia:** un solo horario diario para todos
  los días; `horaCierre <= horaApertura` significa que cruza la medianoche (de 20:00 a 02:00), porque
  un SUM que cierra a la 1 es lo normal.
- Dominio: función pura `dentroDelHorario(desde, hasta, apertura, cierre)` en hora argentina
  (`diaArgentino`, nunca UTC). La reserva entera tiene que caber en **una** ventana de apertura.
  **Decisión propia:** con ventana que cruza la medianoche, una reserva que empieza después de las
  00:00 y antes del cierre pertenece a la ventana **del día anterior** (de 20:00 a 02:00, la reserva
  00:30–01:30 del sábado es válida: cae en la ventana que abrió el viernes). Con prueba de dominio de
  los bordes (justo a la apertura, justo al cierre, cruzando medianoche, tramo de madrugada, ventana
  nula).
- `reservar` la verifica junto con las demás reglas del espacio, con mensaje «El SUM se usa de 10:00
  a 23:00.» (RNF-10).
- `editarEspacio` (y `altaEspacio`) aceptan el horario. Al **cambiar** el horario, en la misma
  transacción se cancelan las reservas `confirmada` **que todavía no empezaron** (`desde > ahora`;
  **decisión propia:** una reserva en curso no se corta) del espacio y que ya no caben, con motivo
  «Cambió el horario de uso del espacio», y se notifica igual que hoy hace `deshabilitarEspacio`
  (mismo `notificar`, mismo destinatario: quien hizo la reserva). Se devuelve la cantidad cancelada y
  el aviso de éxito la menciona.
- Formulario de espacio (`modal-espacio.tsx`): dos `<input type="time">`, con validador de campo del
  dominio (decisión 28).

### 2. Reserva con deuda configurable (EspacioComun)

- Columna `rechazaConDeuda BOOLEAN NOT NULL DEFAULT true`. El valor por defecto preserva el
  comportamiento actual de todos los espacios existentes.
- `reservar`: el paso 1 (deuda vencida, CU-09) corre solo si `espacio.rechazaConDeuda`.
- Formulario de espacio: casilla «Rechazar reservas de unidades con deuda vencida».
- Cambiarla no toca reservas existentes.

### 3. Proveedor desde la factura (carga asistida)

- La pantalla `gastos/asistida/[id]` ya busca el proveedor por CUIT o razón social. Si no encuentra
  y la extracción trajo **razón social y CUIT** (los dos datos obligatorios de `Proveedor`), muestra
  una casilla marcada «Dar de alta como proveedor» con **razón social y CUIT editables** al lado,
  precargados con lo detectado (**decisión propia:** lo que se escribe en el padrón lo confirma una
  persona, RN-14; la casilla sola grabaría la lectura de la IA tal cual).
- `confirmarExtraccion` recibe `nuevoProveedor?: { razonSocial, cuit }`; si viene, crea el
  `Proveedor` dentro de la
  **misma transacción** que el `Gasto` (rubro habitual = rubro del gasto) y ata el gasto a él. La
  validación del CUIT es la misma que usa `altaProveedor` (se extrae a un validador compartido si hoy
  está inline). Si el CUIT ya existe en el consorcio (carrera), se usa ese proveedor, no se duplica.
- Si el administrador elige un proveedor de la lista, la casilla se ignora.
- `campos_corregidos` (I-5): si la persona edita la razón social o el CUIT antes de crear, cuenta
  como corrección de `proveedor`/`cuit`, igual que cualquier otro campo de la extracción.

### 4. Sugerencias de configuración desde la documentación

**Qué se puede sugerir** (todo lo configurable hoy más lo nuevo de este diseño; cada tipo se aplica
por su caso de uso existente):

| Tipo | Contenido | Se aplica con |
|---|---|---|
| `espacio_nuevo` | nombre, capacidad, anticipación mín. (h) y máx. (días), duración máx. (h), reservas por mes y unidad, horario, rechaza con deuda | `altaEspacio` |
| `espacio_cambio` | espacio existente (por id) + solo los campos que el documento fija | `editarEspacio`, mezclando con los valores actuales |
| `vencimientos` | tramos (día y recargo) y tasa de mora mensual | `guardarReglaVencimientos` |
| `asambleas` | regla de mayoría, anticipación de convocatoria, tope de unidades por apoderado, umbral de expensas sin voto | `guardarConfiguracion` (asambleas) |
| `instrucciones_pago` | texto | `guardarInstruccionesDePago` |

Un campo que el documento no menciona **no** se sugiere: en `espacio_cambio` y en las reglas
parciales se completa con el valor vigente al aplicar. En `vencimientos`, si el documento fija solo
la mora, los tramos vigentes se conservan, y viceversa.

**Depósito: fuera (decisión propia).** `requiereDeposito`/`importeDeposito` existen en la tabla pero
hoy no se configuran (ni `altaEspacio`/`editarEspacio` ni el formulario los manejan) y el cobro no
está construido. La consigna es sugerir lo que el sistema permite configurar; el depósito no entra.

**Vencimientos: una sola convención (decisión propia).** El lector devuelve los tramos en la
convención de **boleta** (decisión 27): «pagando hasta el día N, recargo X %», 1er tramo en 0 %,
que es como lo escribe un reglamento y como lo guarda `guardarReglaVencimientos`. La tarjeta muestra
actual → propuesto en la **misma convención que la pantalla de configuración**, pasando ambos lados
por `escalonadoDesdeTramos`, para que el administrador lea lo que después ve en Vencimientos. «Vence
el día 10» sin recargo es el día del 1er tramo. «No se cobra interés» no genera sugerencia: la
validación vigente exige mora positiva y eso no se toca acá; si al aplicar la mora vigente no pasa
la validación, la sugerencia queda pendiente con el mensaje del caso de uso.

**Modelo.** Tabla `SugerenciaConfiguracion`: `id`, `consorcio_id`, `documento_id` (FK a
`DocumentoConsorcio`, `ON DELETE CASCADE`), `tipo` (enum de la tabla de arriba), `datos` (`JSONB`,
validado con Zod por tipo al leer y al aplicar), `cita` (texto del documento que la respalda, con
página si se conoce), `estado` (`pendiente` / `aplicada` / `descartada`), `resuelta_por`,
`resuelta_en`, timestamps. Los importes de depósito viajan como cadena en `datos` (§ 14.1, medida 3).

**Interfaz de IA.** Nueva `LectorDeConfiguracion` en `dominio/contratos/asistencia.ts`:
`leer(texto: string, contexto: { espaciosExistentes: { id, nombre }[] }) → Resultado<SugerenciaLeida[]>`.
Tres implementaciones: Gemini (`gemini.ts`, salida estructurada con esquema, mismo patrón que
`ExtractorDocumental`), determinística (reconoce un texto de prueba fijo y devuelve sugerencias
conocidas) y nula (`no disponible`). Se agrega a la lista de la invariante 5 en `CLAUDE.md`. El
modelo recibe los espacios existentes para decidir entre `espacio_nuevo` y `espacio_cambio`
(«el SUM» del reglamento ↔ «SUM» cargado); no recibe personas ni importes de expensas.

**Flujo.**
1. `manejadorIndexacion`, al terminar bien, encola `sugerir_configuracion` con el `documentoId`
   (nuevo valor de `TipoTrabajo`) **solo si el documento es de la documentación del consorcio:
   reglamento de copropiedad, reglamento interno, acta o contrato** (`TipoDocumento`). Póliza y
   «otro» no se analizan. El acta firmada que publica la asamblea (`acta.ts`) es de tipo `acta` y
   entra. La indexación no espera ni falla por esto.
2. El manejador del trabajo arma el texto desde los `FragmentoDocumento` ya guardados (no vuelve a
   bajar el archivo), llama al lector, valida cada sugerencia con Zod **y con los validadores del
   dominio** (una sugerencia que no pasaría la pantalla de configuración se descarta en silencio), y
   reemplaza las sugerencias `pendiente` previas de ese documento por las nuevas. Las ya aplicadas o
   descartadas no se tocan.
3. Una sugerencia idéntica a la configuración vigente no se guarda (no hay nada que aplicar).
4. Reindexar un documento vuelve a generar las sugerencias pendientes.
5. **Documentos ya indexados (decisión propia):** en la página de un documento `indexado` de esos
   cuatro tipos, el
   administrador tiene un botón «Buscar configuración» que encola `sugerir_configuracion` sin
   reindexar. Así los reglamentos ya cargados en los consorcios existentes también se analizan, y
   sirve para reanalizar. Sin migración de relleno: el costo de IA lo dispara una persona.

**Pantalla.** Solo el administrador.
- Listado de Documentación: en la columna que ya ve el administrador, «N sugerencias» cuando hay
  pendientes, enlazando a la página del documento.
- Página del documento: sección «Configuración que menciona este documento», una tarjeta por
  sugerencia con: qué cambia (título legible: «Nuevo espacio: SUM»), tabla **actual → propuesto** de
  los campos que cambian, la cita en un `<blockquote>`, y dos botones: **Aplicar** y **Descartar**.
  El valor «actual» se calcula al mirar, no al generar.
- **Reservas afectadas (decisión propia):** si aplicar un cambio de horario cancelaría reservas, la
  tarjeta lo dice al mirar («Aplicar cancela 3 reservas confirmadas») y **Aplicar** pide confirmación
  en un `BotonModal` antes de escribir. Sin reservas afectadas, es un clic.
- **Aplicar** llama al aplicador del tipo dentro de `conAutorizacion` (administrador). Si el caso de
  uso rechaza (por ejemplo, la mora propuesta no supera el recargo más alto vigente), la sugerencia
  queda `pendiente` y el mensaje sale como aviso de problema (decisión 24); no se marca nada.
  Si aplica, queda `aplicada` con `resuelta_por`/`resuelta_en` y aviso de éxito; si el cambio de
  horario canceló reservas, el aviso lo dice.
- `espacio_cambio` cuyo espacio ya no existe o está deshabilitado: se muestra como no aplicable y
  solo se puede descartar.
- Una sugerencia aplicada o descartada se muestra plegada, como historia.

### Trazabilidad

Requerimientos a citar en código y commits: `RF-19`/`RF-20` (documentación), `RF-08` (vencimientos),
`CU-09` (reservas), `RN-14` (confirmación humana), `RNF-14`/`RNF-15` (degradación de IA). Si el
análisis amerita un `RF` nuevo en `docs/entrega-1/04-alternativas-solucion.md`, se agrega
describiendo capacidades, sin nombres de producto.

## Lo que queda al constructor

- Orden de las cuatro piezas (sugerido: horario y deuda → proveedor → sugerencias, porque las
  sugerencias usan los campos nuevos del espacio).
- Tope de texto enviado al lector y cómo partir un documento muy largo.
- Forma exacta del esquema Zod por tipo y del prompt.
- Nombres de componentes y de los aplicadores.
- Si el validador de CUIT ya existe o se extrae.

## Verificación

- Dominio: `dentroDelHorario` (bordes y medianoche); validadores de horario.
- Integración: reserva fuera de horario rechazada; cambio de horario cancela y notifica solo las
  futuras que no caben; `rechazaConDeuda=false` permite reservar con deuda; confirmar extracción con
  `crearProveedor` crea uno y no duplica por CUIT; manejador de sugerencias con el lector
  determinístico genera, reemplaza pendientes y omite idénticas; aplicar cada tipo pasa por su caso de
  uso y un rechazo deja la sugerencia pendiente; no-administrador no ve ni aplica; aislamiento
  (sugerencia de otro consorcio = no encontrado).
- E2E: subir un reglamento de prueba → aparecen sugerencias → aplicar un espacio nuevo → el espacio
  existe con su horario; en teléfono 390×844.
- `npm run verificar` + `test:a11y`.
