# Fase 0 — Investigación y decisiones: `004-servicios`

Trece decisiones que el plan necesita cerradas antes de la primera prueba. Las que tocan al
proveedor externo se apoyan en el Principio IV y en lo medido en las dos pruebas de concepto
(`poc/resultados/`, § 14.3); las que tocan integridad, en la regla de «la base impone lo que puede
imponer» que `002` y `003` ya siguen.

## R-01 — Proveedor: Gemini API en capa paga, por su SDK oficial, con tres modelos fijados por configuración

**Decisión**: `@google/genai` (SDK oficial, una dependencia nueva) contra la capa **paga** de Gemini
API. Modelos por variable de entorno con estos valores por defecto: `gemini-3.5-flash` para
`ExtractorDocumental`, `ClasificadorTexto` y `GeneradorRespuesta`; `gemini-embedding-001` con
`outputDimensionality: 768` para `GeneradorVectores`. La clave `GEMINI_API_KEY` es la única
configuración obligatoria; sin ella, el punto de composición elige la implementación nula (R-02).

**Fundamento**: § 14.3 ya está decidido con las dos PoC: 149/150 campos y 20/20 preguntas. La capa
paga es la única que cumple C3 (los datos no se usan para entrenar) y la única que no agota la cuota
a mitad de corrida, que es lo que pasó tres veces durante la PoC. 768 dimensiones porque es lo que
declara el diccionario de datos (`vector(768)`), lo que admite el índice HNSW de `pgvector` sin
recortes y lo que el modelo soporta como dimensión reducida sin pérdida apreciable en un corpus de
cientos de fragmentos. El SDK y no REST porque el código de producción se tipa y se mantiene; la PoC
usó REST porque era desechable.

**Alternativas descartadas**: REST a mano como en la PoC —ahorra una dependencia y cuesta tipos y
manejo de errores propios—; `gemini-embedding-2`, que devuelve un solo vector por llamada y no
admite `taskType`, sin ventaja para este corpus; los otros dos candidatos de la tabla de § 14.3, no
medidos por falta de credenciales y con las interfaces del dominio como seguro si hubiera que
cambiar.

## R-02 — Tres implementaciones por interfaz, elegidas en un solo lugar

**Decisión**: las cuatro interfaces se declaran en `src/dominio/contratos/asistencia.ts`. En
`src/infraestructura/asistencia/` viven exactamente tres módulos: `gemini.ts` (proveedor),
`determinista.ts` (pruebas) y `nula.ts` (degradación). `src/aplicacion/dependencias.ts` elige una
vez, por entorno: `FLAY_ASISTENCIA=determinista` → determinista (lo usan las pruebas de extremo a
extremo); `GEMINI_API_KEY` presente → proveedor; ninguna de las dos → nula. Toda función asistida
recibe la interfaz por parámetro, como el reloj y el repositorio.

**Fundamento**: SC-012 exige que una búsqueda en el repositorio devuelva exactamente tres
implementaciones; ponerlas en una carpeta con nombre hace la búsqueda trivial y la prueba de
integración la cuenta. La elección por entorno en el punto de composición es la misma regla que la
decisión 5 de `CLAUDE.md`: un caso de uso que importa su implementación deja de ser probable.

**Qué hace la determinista**: extrae con expresiones regulares (CUIT, fecha, el importe que sigue a
«total»), clasifica por palabras clave contra la lista de rubros, vectoriza con una bolsa de palabras
proyectada a 768 dimensiones por hash, y responde concatenando los fragmentos citados. No es buena:
es **predecible**, que es lo que una prueba necesita.

**Qué hace la nula**: devuelve «no disponible» en cada método, sin lanzar. La extracción deja el
formulario vacío con el mensaje de RNF-10; el triage no crea sugerencia; la consulta documental
devuelve búsqueda por título y descarga directa (§ 8.5, degradación).

## R-03 — La extracción corre diferida sobre `TrabajoPendiente`, nunca en el pedido

**Decisión**: tipo de trabajo `extraccion_comprobante`. Al confirmar la subida de un comprobante
suelto (R-04) se encola el trabajo; el manejador llama al extractor, valida la salida contra el
esquema y crea la `ExtraccionComprobante` en `pendiente`. La pantalla de alta de gasto se abre con
los valores precargados cuando la extracción existe, y con el formulario vacío y el aviso «la
extracción no está lista; podés cargarlo a mano» cuando no.

**Fundamento**: la PoC midió mediana de 7,7 s y hasta 86 s bajo carga del proveedor. Ninguna de esas
latencias entra en un pedido web ni en el presupuesto de RNF-06. La cola de `002` ya tiene reintento
con espera creciente, `SKIP LOCKED` y reenvío manual (R-06 de `002`, R-02 de `003`): es una línea de
enum y un manejador.

**Alternativas descartadas**: extraer en el pedido de subida (bloquea al operador hasta 86 s);
extraer al abrir el formulario (lo mismo, más veces); un servicio de colas externo (un proveedor
más en la etapa más cargada).

## R-04 — El comprobante suelto: `ExtraccionComprobante` lleva consorcio y clave del objeto

**Decisión**: la carga asistida sube el archivo **antes** de que exista el gasto, así que
`ExtraccionComprobante` declara `consorcio_id` (aislada por la extensión de `001`) y
`clave_objeto`, y su `comprobante_id` es **opcional** y se completa al confirmar, cuando nacen el
`Gasto` y su `Comprobante` en la misma transacción. `Comprobante` de `002` no se toca.

**Fundamento**: el diccionario de datos pone `comprobante_id NN`, pero `Comprobante.gasto_id` es
`NN` desde `002` y RN-14 dice que el gasto nace al confirmar. Las tres cosas no pueden ser ciertas a
la vez. Relajar `Comprobante.gasto_id` dejaría una tabla sin `consorcio_id` con filas huérfanas que
la extensión de aislamiento no filtra: es la decisión 10 de `CLAUDE.md`, el hallazgo de RT-04.
Poner el consorcio en la extracción mantiene el aislamiento sin tocar lo que ya funciona.

**Alternativas descartadas**: `Comprobante.gasto_id` opcional (fuga de aislamiento);
crear un gasto «borrador» antes de extraer (viola RN-14 en la letra: existiría una fila de `Gasto`
originada por la extracción, que es lo que SC-017 cuenta como cero).

## R-05 — Indexación: texto por página con `unpdf`, fragmentos por párrafo con solapamiento, vector en `pgvector`

**Decisión**: trabajo `indexar_documento`, encolado por la carga. El manejador baja el objeto, calcula
`hash_sha256`, extrae texto **por página** con `unpdf` (la compilación de `pdf.js` para entornos sin
DOM, una dependencia nueva), fragmenta agrupando párrafos hasta ~1.000 caracteres con el último
párrafo repetido como solapamiento, y corta además en cada «Art.» cuando el documento los tiene.
Vectoriza en lotes y escribe `FragmentoDocumento` con `createMany` más una sentencia `UPDATE`
en SQL para la columna `vector`, que Prisma declara como `Unsupported("vector(768)")`. Índice HNSW
con `vector_cosine_ops`. `estado_indexacion` recorre `pendiente → procesando → indexado | error`.

**Fundamento**: § 12.2 y FR-030 piden indexación diferida; el documento de 200 páginas de los casos
límite no puede esperar en un pedido. Un fragmento por artículo fue lo que la PoC midió al 100 %:
los reglamentos reales están numerados y ese corte respeta la unidad de sentido. El texto lo saca
una biblioteca y no el proveedor, para que la indexación de un reglamento de 200 páginas no cueste
200 llamadas ni dependa de que el proveedor esté disponible: si no hay vectores, el documento queda
en `error` con motivo y se puede reintentar; el texto ya está.

**Alternativas descartadas**: pedirle el texto al proveedor (costo y latencia por página, y la
degradación arrastra al texto); `pdf-parse` (sin número de página fiable); guardar los vectores
fuera de la base (un servicio más, y el filtro por consorcio dejaría de ser una cláusula `WHERE`).

## R-06 — La recuperación filtra por consorcio y visibilidad en el `WHERE`, y la abstención la decide el generador con salida estructurada

**Decisión**: la búsqueda es una consulta SQL en infraestructura que toma el consorcio de
`consorcioActivo()` —y **se niega** a correr sin él—, une `FragmentoDocumento` con
`DocumentoConsorcio`, aplica `consorcio_id = $1 AND (visible_consorcistas OR $2)` y recién entonces
ordena por `vector <=> $3` y limita a 6. Un piso de similitud coseno de 0,55 descarta lo obviamente
ajeno. El `GeneradorRespuesta` recibe pregunta y fragmentos y devuelve una salida estructurada
`{ respuesta, citas: [numero_fragmento], sin_respaldo }` con la instrucción de responder sólo con lo
que los fragmentos dicen. Una respuesta con `citas` vacías se trata como `sin_respaldo`, se
persiste con ese valor y se muestra «no lo encontramos en la documentación cargada».

**Fundamento**: la PoC dejó las similitudes de los aciertos entre 0,68 y 0,80 y las del quinto
puesto entre 0,58 y 0,70: **el umbral solo no separa** una pregunta respondible de una que no lo es.
Lo que separa es que el generador diga si los fragmentos contienen la respuesta, y SC-015 —diez
preguntas sin respuesta en la documentación, cero invenciones— es la prueba de eso. El filtro en el
`WHERE` antes del `ORDER BY` es FR-029 tal cual: el fragmento de otro consorcio **nunca llega** al
generador (SC-016), no es que se descarta después.

**Alternativas descartadas**: filtrar después de recuperar (viola FR-029 y RN-12); un umbral alto
sin abstención del generador (recorta preguntas legítimas, que la PoC mostró a 0,68); responder sin
citas cuando la confianza es alta (Principio IV, sin excepción).

## R-07 — El despachador de notificaciones reusa la cola: un trabajo por `Notificacion`

**Decisión**: tipo de trabajo `notificacion` con carga `{ notificacionId }`. Todo alta de
`Notificacion` pasa por `notificar(...)` en aplicación, que crea la fila y su trabajo **en la misma
transacción**. El manejador busca la notificación, la envía por el puerto `Notificador`
(`enviarNotificacion`, operación nueva junto a `enviarInvitacion`) y marca `enviada_en` y
`estado_envio`. Una migración versionada encola un trabajo por cada `Notificacion` que `003` dejó en
`pendiente`: eso es lo que SC-007 verifica como cero avisos perdidos entre etapas. El despacho
explícito del administrador («enviar avisos ahora») es el mismo botón acotado a 20 s que `003` usa
para los documentos.

**Fundamento**: `Notificacion` no tiene intentos ni próximo intento, y `TrabajoPendiente` sí, con
`agotado` visible y reenvío manual. Duplicar esa máquina en otra tabla es la alternativa que un
recién llegado tendría que aprender dos veces. Que la fila y el trabajo nazcan juntos es lo que hace
imposible el aviso sin despachador.

**Alternativas descartadas**: agregar `intentos` y `proximo_intento` a `Notificacion` y un segundo
drenaje (dos colas); una tarea programada (la corrida diaria de la capa gratuita, misma razón que
`002` y `003`); enviar en el pedido (RNF-14: el correo caído no puede voltear el negocio, y SC-008
lo mide).

## R-08 — La superposición de reservas la rechaza la base con una restricción de exclusión

**Decisión**: `EXCLUDE USING gist (espacio_id WITH =, tstzrange(desde, hasta) WITH &&) WHERE
(estado = 'confirmada')`, escrita a mano en la migración porque Prisma no la declara. `btree_gist`
está instalado desde `001`. La reserva nace **confirmada** si la base la acepta; el error de
exclusión (`23P01`) se traduce en aplicación al mensaje «ese horario ya está reservado» (RNF-10).
`desde < hasta` es un `CHECK`. La deuda vencida se verifica antes con la misma función de saldo
impago por unidad que `003` usa para la morosidad, exportada desde `src/aplicacion/pagos`.

**Fundamento**: FR-010 y SC-005 lo piden por la base, incluida la ejecución concurrente, y la
prueba lo verifica saltándose la capa de aplicación con dos inserciones simultáneas. La restricción
de exclusión es la única forma en que dos transacciones concurrentes no pueden dejar dos reservas
confirmadas: es la misma familia que RN-09 en `002`.

**Alternativas descartadas**: verificar superposición con un `SELECT` previo (pierde la carrera);
estado `pendiente` con confirmación del administrador (el reglamento del cliente no lo pide y agrega
una pantalla; `pendiente` queda en el enumerado para el caso de depósito, que esta etapa no
construye).

## R-09 — Reclamos: la máquina de estados en el dominio, RN-11 como `CHECK`, el historial en la misma transacción

**Decisión**: `src/dominio/reclamos/estado.ts` declara las transiciones válidas como tabla pura
(igual que `periodos/estado.ts`): `abierto → asignado → en_curso → resuelto → cerrado`, `rechazado`
desde `abierto` o `asignado`, y `cerrado → abierto` como reapertura. RN-11 va a la base:
`CHECK (estado = 'abierto' OR responsable_id IS NOT NULL)`. `transicionar()` es el **único** camino
de aplicación que cambia el estado: valida con el dominio, actualiza y escribe `ReclamoHistorial`
en una transacción, y encola las notificaciones al autor y al responsable (§ 12.7).

**Fundamento**: SC-004 pide el rechazo en el 100 % de los casos, y un `CHECK` no se olvida. El
historial lo escribe la aplicación y no un disparador porque lleva comentario y autor, y un
disparador tendría que leerlos de variables de sesión; con un único camino y la prueba de SC-003
sobre cada transición el asiento es tan seguro como una regla de negocio puede serlo.

**Alternativas descartadas**: disparador para el historial (sin comentario, o con dos escritores);
validar RN-11 sólo en aplicación (una ruta olvidada la salta).

## R-10 — Triage: un trabajo por reclamo nuevo, una sugerencia que el administrador aplica o descarta

**Decisión**: al registrar un reclamo se encola `triage_reclamo`. El manejador llama al
`ClasificadorTexto` con título, descripción, la lista de rubros y los proveedores **del consorcio**, y
escribe `SugerenciaReclamo`. En la pantalla del reclamo la sugerencia aparece aparte, con «aplicar»
(copia rubro, urgencia y proveedor al reclamo y marca `aceptada = true`) y «descartar»
(`aceptada = false`). El estado del reclamo no cambia en ninguno de los dos casos.

**Fundamento**: FR-027 y § 8.4: sugiere, nunca decide; el proveedor sugerido se limita a los
registrados. `aceptada` es la fuente de `v_precision_asistencia`.

## R-11 — Indicadores: vistas materializadas en SQL, decimal hasta el borde, refresco diario por tarea programada más botón

**Decisión**: cuatro vistas materializadas (`v_morosidad_consorcio`, `v_gasto_rubro_periodo`,
`v_desempeno_proveedor`, `v_resolucion_reclamos`) más `v_precision_asistencia`, todas con
`consorcio_id` y todo importe `NUMERIC(14,2)`. El promedio móvil de I-2 es una ventana de doce filas
anteriores del mismo consorcio y rubro, en `NUMERIC`, y el desvío se redondea a un decimal **al
final**; con menos de doce períodos el promedio es `NULL` y la interfaz dice «historia
insuficiente». I-4 usa `percentile_cont(0.5)` y `percentile_cont(0.9)` sobre horas (tiempo, no
dinero). El refresco es `REFRESH MATERIALIZED VIEW CONCURRENTLY`, disparado por la tarea programada
de la plataforma (una corrida diaria a las 04:00, la que la capa gratuita admite, contra una ruta
protegida por secreto) y por un botón «actualizar ahora» para la demostración. Las vistas se leen
desde `src/infraestructura/repositorios/indicadores.ts` con SQL que toma el consorcio activo o, para
el panel consolidado I-6, la lista de consorcios con habilitación vigente del usuario. Los importes
viajan como cadena; Recharts recibe números **sólo para dibujar** porcentajes y series, y la
etiqueta que se lee es la cadena.

**Fundamento**: FR-017, FR-018, FR-019, FR-020 y SC-010 (2 s en el percentil 95 sobre ~600.000
registros): agregar en cada pedido no entra en el presupuesto; materializar de madrugada sí, y es lo
que § 9.1 diseñó. La tarea diaria es exactamente lo que en `002` y `003` no servía para colas y acá
sí sirve, porque «de madrugada» es la frecuencia pedida. `flay/sin-aritmetica-monetaria` cubre el
código TypeScript del módulo; el SQL se revisa a mano en SC-022.

**Alternativas descartadas**: vistas comunes (no cumplen SC-010 sobre el volumen a cinco años);
calcular en la aplicación (repite la lógica que § 7.7 puso en la base); una herramienta externa de
inteligencia de negocios (RNF-13, FR-022).

## R-12 — Graficación: Recharts 2.15.0, ya instalado; § 14.2 se ratifica

**Decisión**: Recharts, componentes de cliente, un gráfico por indicador, tabla accesible debajo con
los mismos datos como cadena (WCAG 2.1: el gráfico no es la única forma de leer el dato).

**Fundamento**: FR-024 pide ratificar o rectificar; está instalado desde `001` y no hay motivo de
cambio. La tabla debajo cierra SC-020 sin depender de la accesibilidad del SVG.

## R-13 — Exportación abierta: CSV por consorcio desde manejadores de ruta, con la habilitación vigente

**Decisión**: `GET /api/exportar/{consorcio}/{gastos|liquidaciones|pagos}.csv`, con la sesión y la
habilitación verificadas como en `/api/comprobantes`, importes como cadena con punto decimal,
codificación UTF-8 con BOM para que la planilla del cliente lo abra bien, separador `;` (regional
es-AR). Se genera por `enConsorcio` y en flujo, sin cargar todo en memoria.

**Fundamento**: FR-032b y SC-018 (condición de § 5.5.4). Es lo que permite irse del sistema con los
datos, que el punto 5 promete al cliente.

**Alternativas descartadas**: exportación desde el panel con un botón por tabla (es lo mismo detrás,
la ruta se puede llamar desde el botón); formato propio o planilla binaria (no es «abierto»).
