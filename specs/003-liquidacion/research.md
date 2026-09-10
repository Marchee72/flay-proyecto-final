# Fase 0 — Investigación y decisiones: `003-liquidacion`

Nueve decisiones que el plan necesita cerradas antes de la primera prueba. Cada una dice qué se
eligió, por qué, y qué se descartó. Las que tocan dinero se apoyan en el Principio II; las que tocan
capas, en el Principio III.

## R-01 — El documento de expensa se genera en el servidor y se guarda como objeto

**Decisión**: `@react-pdf/renderer` 4.1.3 —ya fijado en § 14.1— rendea el documento en el servidor y
los bytes se guardan con clave `expensas/<consorcio>/<liquidacion>/<unidad>.pdf`. `DetalleLiquidacion`
guarda la clave, y la lectura se resuelve con el mismo permiso autorizado que los comprobantes.

**Fundamento**: el comprobante de `002` sube **directo desde el navegador** porque los bytes son del
usuario; acá los produce el servidor, así que el puerto `AlmacenObjetos` necesita una operación que
`002` no tiene: `guardar(clave, bytes, tipoContenido)`. Es la única forma en la que el archivo puede
existir sin que nadie lo suba.

**Alternativas descartadas**: generar el documento al pedirlo, sin guardarlo —cada descarga volvería
a rendear y RNF-07 se mide sobre 96 unidades—; y guardarlo en la base como binario, que infla la
base con datos que no se consultan.

## R-02 — La generación diferida corre sobre `TrabajoPendiente`, con disparo explícito

**Decisión**: un trabajo por unidad, de tipo `documento_expensa`, encolado por la emisión. Se drena
por dos caminos: el oportunista de `002` —el siguiente pedido despacha un lote— y un **disparo
explícito** del administrador («generar los documentos ahora») acotado por tiempo, que es el que
cierra las 96 unidades de SC-007 sin depender de que alguien navegue.

**Fundamento**: `002` ya construyó la cola con reintentos, espera creciente, `SKIP LOCKED` y reenvío
manual. Reusarla es una línea de enum. Lo que no alcanza es el drenaje oportunista solo: con lotes de
cinco por pedido, 96 documentos son veinte pedidos, y SC-007 pide menos de diez minutos con progreso
observable.

**Alternativas descartadas**: una tarea programada —la capa gratuita admite una corrida diaria
(cláusula de § 12.7, misma razón que en `002`)—; y generar los 96 dentro de la transacción de
emisión, que rompe el presupuesto de 30 segundos de RNF-07 y ata la liquidación a un servicio
externo.

## R-03 — El candado de la emisión doble lo pone la base, con índice único parcial

**Decisión**: `CREATE UNIQUE INDEX ... ON "Liquidacion" (periodo_id) WHERE estado = 'vigente'`.

**Fundamento**: la regla RN-06 (§ 7.2) dice «una sola vez» y `FR-003b` dice que anular deja el
período en `liquidado` y admite una reemisión. Las dos cosas juntas significan que el candado **no
puede ser el estado del período**: tiene que ser que no exista otra liquidación vigente. Un índice
parcial lo impone en la base, así que dos transacciones en paralelo no pueden ganar las dos (SC-011,
M-07), sin que el código tenga que bloquear nada.

**Alternativas descartadas**: verificar en la aplicación antes de insertar —es exactamente la
carrera que M-07 pide probar—; y bloquear la fila del período con `SELECT ... FOR UPDATE`, que
funciona pero deja la garantía en el código y no en el esquema.

**Ojo**: el punto 7 declara `Liquidacion.periodo_id` como **único a secas**. Así, una liquidación
anulada bloquearía para siempre la reemisión de su período. Es una corrección documental, anotada en
`002-nucleo/correcciones-documentales.md`.

## R-04 — El motor calcula con `decimal.js`, no con el decimal del mapeador

**Decisión**: el dominio usa `importe()` de `@/compartido/dinero`, que envuelve `decimal.js`. La
conversión a `Prisma.Decimal` ocurre en el borde, en infraestructura.

**Fundamento**: el dominio no puede importar `@prisma/client` —lo prohíbe la regla de análisis
estático de `001` y lo exige el Principio III—, y SC-002 pide que el motor corra con `DATABASE_URL`
sin definir. `002` ya dejó esta separación construida y probada.

## R-05 — Meses completos de fecha a fecha, con aritmética nativa

**Decisión**: `mesesCompletos(vencimiento, hoy)` cuenta meses de calendario y resta uno si todavía
no se alcanzó el día del mes. El 31 de un mes vence contra el último día de un mes más corto: de un
vencimiento el 31 de enero, el 28 de febrero **no** completa el mes; el 1 de marzo sí. Sin
dependencia nueva.

**Fundamento**: la fórmula elegida es interés simple por mes vencido completo (`FR-024`), así que la
única primitiva que hace falta es contar meses. Agregar una biblioteca de fechas para eso es traer
un proveedor para una función de ocho líneas que además hay que probar igual.

**Alternativas descartadas**: contar días y dividir por 30 —da meses fraccionarios, que es
justamente lo que la decisión de `FR-024` descarta—; y una biblioteca de fechas.

## R-06 — La imputación recorre de la más vieja a la más nueva y no vuelve

**Decisión**: función pura `imputar(pago, detallesImpagos)` que ordena por vencimiento ascendente y
consume el importe hasta agotarlo, devolviendo las imputaciones y el sobrante. La suma de
imputaciones más el sobrante iguala el pago, con tolerancia cero, y eso es una prueba.

**Fundamento**: la regla RN-08 (§ 7.2) fija el orden; el resto es un recorrido. Que sea una función
pura es lo que permite probar los casos difíciles —pago que cubre una liquidación y media, pago que
excede la deuda, pago cero— sin base de datos.

## R-07 — El interés se guarda desglosado, en su propia tabla

**Decisión**: `InteresLiquidado` con `(detalle_id, liquidacion_origen_id, capital, tasa, meses,
importe)`. El `interes_mora` del detalle es la suma de sus filas.

**Fundamento**: el interés de una unidad es la suma de un cálculo **por cada liquidación impaga**
(`FR-024`), cada una con sus propios meses. Un solo campo de tasa no lo reconstruye, y guardar sólo
el total tampoco: apenas llega un pago posterior, ya no se puede saber qué estaba impago al momento
de emitir. Sin el desglose, la promesa de explicarle el importe a un propietario (RNF-10) se cae a
los treinta días.

**Alternativas descartadas**: un campo JSON con el desglose —mismo dato, sin integridad
referencial—; y recalcular a demanda, que da un número distinto cada vez que alguien paga.

## R-08 — `Notificacion` y `TrabajoPendiente` son cosas distintas y conviven

**Decisión**: la emisión crea una `Notificacion` por destinatario, en estado `pendiente`, tal como la
declara el punto 7. **No** se encola un `TrabajoPendiente` para despacharla: el despachador es de
`004-servicios`.

**Fundamento**: `Notificacion` es el aviso —tiene destinatario, título, cuerpo, entidad referida y
estado de lectura, y el consorcista lo va a ver—; `TrabajoPendiente` es el mecanismo que reintenta un
efecto externo. Fundirlas ahorraría una tabla y perdería el aviso: al conectar el correo en `004` no
habría dónde leer qué se debía avisar.

## R-09 — El presupuesto de 30 segundos se cumple con inserción por lote

**Decisión**: los detalles y sus filas de interés se insertan con `createMany` dentro de la única
transacción de la emisión; se mide con el arnés de `002` sobre el consorcio de 100 unidades.

**Fundamento**: RNF-07 concede 30 segundos y el trabajo real son cien cálculos en memoria más una
escritura. El riesgo no es el cálculo sino el viaje de red por fila contra una base administrada
—que es lo que ya se midió en `002`—, y por eso la inserción va por lote y no en ciclo.
