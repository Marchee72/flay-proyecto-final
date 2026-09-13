# 13. Prototipo

> **Requisito de la cátedra (Última entrega, punto 13):** *"Prototipo."*
> **Fecha límite:** 18 de diciembre de 2026.

> ✅ **Estado: completo.** Cerrado con la iteración 3 (etapa `004-servicios`). Cada módulo dice qué
> quedó construido, qué quedó diferido y qué difiere de lo diseñado (§ 13.7).

---

## 13.1 Naturaleza del prototipo

Conforme al punto 8.4, en este proyecto conviven dos tipos de prototipo:

| Tipo | Destino | Documento |
|---|---|---|
| Prototipo de interfaz, desechable | Se descarta tras validarlo con el cliente | Se documenta en 13.2 |
| **Prototipo del sistema, evolutivo** | **Se convierte en el sistema entregado** | Es el prototipo exigido por este punto |

El prototipo entregado es el resultado de las tres iteraciones del punto 8.3.1, desplegado y
operativo, no una maqueta.

## 13.2 Prototipo de interfaz — resultado de la validación

*Verificación FR-027 (`001-andamiaje`) al 09/09/2026 — H-09 parte verificable:*

| Hito (punto 10) | Fecha prevista | Estado real | Evidencia |
|---|---|---|---|
| Prototipo de interfaz 2.5 | 24/07/2026 | No cumplido | Sin pantallas ni acta en el repo; se reprograma al arranque de 001 |
| Prueba de concepto 5.1 | semana del 24/08/2026 | No cumplida | Sin código desechable ni medición 80/85 %; pasa a paquete 5.1 de 004 con datos de `datos-cliente/` |
| Demo de iteración 1 | 04/09/2026 | No cumplida | Entorno de demostración desplegado y actualizándose solo desde el 09/09/2026, pero sin funcionalidad que demostrar: `001-andamiaje` no construye ningún `RF-nn`. Pasa a SC-014 de 002 |

*Validación con cliente (paquete 2.5 del punto 10.2), pendiente de reprogramación:*

| Pantalla | Usuario validador | Fecha | Observaciones recibidas | Resolución |
|---|---|---|---|---|
| Panel de administración | Socio gerente | | | |
| Carga de gasto con comprobante | Responsable de liquidaciones | | | |
| Ejecución de la liquidación | Responsable de liquidaciones | | | |
| Estado de cuenta de la unidad | Consorcista | | | |
| Alta y seguimiento de reclamo | Consorcista | | | |
| Panel de indicadores | Socio gerente | | | |

## 13.3 Alcance del prototipo entregado

El alcance comprometido en el punto 9.11 —433 puntos de función sin ajustar, con 23 funcionalidades
diferidas— está construido. De las diferidas, tres se construyeron igual porque una decisión de la
etapa las volvió baratas (§ 13.7); el resto sigue diferido con el paliativo que el punto 9.11
enumera.

**Estado al cierre de la iteración 3** (etapa `004-servicios`, 2026-09-12):

| Módulo | Requerimientos | Estado | Observaciones |
|---|---|---|---|
| Usuarios, roles y habilitaciones | RF-03 | **Construido** | Sin cambios desde la iteración 1 |
| Consorcios y unidades | RF-01, RF-02 | **Construido** | Sin cambios desde la iteración 1 |
| Gastos y comprobantes | RF-04, RF-05, RF-10 | **Construido** | Se suma la carga asistida (RF-06) y la exportación en CSV. Sin baja de gasto ni detección de comprobante duplicado (§ 13.7) |
| Liquidación de expensas | RF-07, RF-08 | **Construido** | Sin cambios desde la iteración 2; exportación en CSV por unidad |
| Pagos y morosidad | RF-09 | **Construido** | Sin cambios desde la iteración 2; exportación en CSV |
| Reclamos | RF-11, RF-13 | **Construido** | Máquina de estados con historial por transición; RN-11 la impone un `CHECK` de la base; bandeja y detalle desde el teléfono; aviso al vecino en cada cambio |
| Reservas | RF-15, RF-16 | **Construido** | Espacios con reglas (anticipación, duración, capacidad, tope mensual); la superposición la rechaza una restricción `EXCLUDE` de la base, verificada con dos inserciones concurrentes; la deuda vencida bloquea la reserva |
| Proveedores | RF-17 | **Construido** | Sin baja: diferida (§ 9.11) |
| Comunicación y documentación | RF-18, RF-19 | **Construido** | Novedades con aviso a cada habilitado; documentos con subida directa, marca de visibilidad e indexación en segundo plano. Sin baja de documento ni edición de novedad (§ 9.11) |
| Notificaciones | RF-14 | **Construido** | Despachador sobre la cola de trabajos, con reintentos, «agotado» visible y botón de reintento; sin proveedor de correo, todo queda pendiente y ninguna operación falla |
| Indicadores de gestión | RF-21 a RF-25 | **Construido** | Seis indicadores sobre vistas materializadas en `NUMERIC`, refrescadas a diario y a mano; validados contra un cálculo independiente con tolerancia cero (SC-009); p95 de 184 ms |
| Funciones asistidas | RF-06, RF-12, RF-20 | **Construido** | Cuatro interfaces con tres implementaciones cada una (proveedor, determinista, nula). Extracción con confirmación humana y umbral de confianza; triage que sugiere y nunca decide; consulta documental que cita o se abstiene. Proveedor: Gemini (§ 14.3) |
| Auditoría | RF-26 | **Construido** | Reclamo, reserva y extracción se suman a las tablas auditadas por disparador (SC-021) |
| Exportación abierta | § 5.5.4 | **Construido** | Gastos, liquidaciones y pagos en CSV por consorcio, con sesión y habilitación; `npm run exportar:verificar` cuadra los tres al centavo (SC-018) |

### Lo que la iteración 3 deja verificado

| Criterio | Medición al 2026-09-12 |
|---|---|
| Dos reservas concurrentes del mismo espacio y horario (SC-005, RN-10) | Exactamente una queda confirmada; la segunda la rechaza la base, salteándose la aplicación |
| Cambio de estado sin responsable (RN-11) | Rechazado por la aplicación con mensaje, y por el `CHECK` de la base ante un `UPDATE` directo |
| Indicadores contra cálculo independiente (SC-009, SC-022) | 554 filas comparadas en decimal, tolerancia cero, sobre 10.800 gastos |
| Panel de indicadores (SC-010, RNF-06) | p95 de 184 ms en 100 cargas sobre el volumen anual |
| Extracción de comprobantes (SC-001, PI-01) | 149 de 150 campos sobre 30 comprobantes, contra el umbral del 80 % |
| Búsqueda semántica (SC-001, PI-06) | 20 de 20 preguntas con el fragmento correcto entre los tres primeros, contra el 85 % |
| Abstención sin respaldo (SC-015, PI-07) | Diez preguntas sin respuesta en el reglamento, diez abstenciones; cero invenciones, con la determinista y con el proveedor real |
| Aislamiento de la consulta documental (SC-016) | Ningún fragmento no visible ni de otro consorcio llega al generador: lo filtra el `WHERE`, no la aplicación |
| Confirmación humana (SC-017, RN-14) | Ningún gasto nace de una extracción sin el envío explícito de la persona; los campos corregidos quedan anotados |
| Degradación (SC-013, RNF-14) | Con la implementación nula y con el correo caído, cero operaciones de negocio fallan; un proyecto de Playwright lo recorre contra un servidor sin clave |
| Exportación abierta (SC-018) | Los tres CSV cuadran al centavo contra la base |
| Accesibilidad (SC-020, RNF-11) | Cero infracciones A/AA en las once pantallas de servicios |

**Estado al cierre de la iteración 2** (etapa `003-liquidacion`, 2026-09-10):

| Módulo | Requerimientos | Estado | Observaciones |
|---|---|---|---|
| Usuarios, roles y habilitaciones | RF-03 | **Construido** | Identidad, invitación por correo y habilitación en tres niveles (plataforma, administradora, consorcio). Bloqueo por intentos fallidos con mensaje único |
| Consorcios y unidades | RF-01, RF-02 | **Construido** | Alta, padrón y cambio de coeficiente hacia el futuro. La suma exacta la impone un disparador diferido, no el código. La unidad lleva su tipo —departamento, cochera, local o baulera (punto 7)—, y una cochera puede tener dueño propio, sin departamento en el edificio. El padrón se pega desde una planilla, se puede generar por pisos, y la pantalla ofrece cerrar el sobrante del reparto dentro del límite de § 14.4. Faltan `piso`, `superficie_m2` y `activa`, que el punto 7 declara y esta etapa no necesitó |
| Gastos y comprobantes | RF-04, RF-05, RF-10 | **Construido** | Alta de gasto sobre período abierto, subida directa del comprobante al almacenamiento, listado filtrable. Sin baja de gasto: diferida (§ 9.11) |
| Liquidación de expensas | RF-07, RF-08 | **Construido** | Motor en el dominio con 100 % de ramas y coincidencia al centavo con las tres planillas del cliente (SC-005). Cierre, emisión en una transacción, anulación y reemisión con el candado en la base. Documento por unidad en diferido, accesible sólo por quien corresponde. Interés por mes vencido, desglosado por liquidación impaga |
| Pagos y morosidad | RF-09 | **Construido** | Imputación por antigüedad en el dominio; saldo a favor aplicado en la emisión siguiente; nómina nominada sólo para administrador y consejo, agregado para el consorcista |
| Reclamos | RF-11, RF-13 | Iteración 3 | |
| Reservas | RF-15, RF-16 | Iteración 3 | |
| Proveedores | RF-17 | **Construido** | Alta y edición. Sin baja: diferida (§ 9.11) |
| Comunicación y documentación | RF-18, RF-19 | Iteración 3 | |
| Notificaciones | RF-14 | **Parcial** | El mecanismo de reintento está construido y probado. La emisión deja `Notificacion` en `pendiente` por cada habilitado; el despachador es de la iteración 3 |
| Indicadores de gestión | RF-21 a RF-25 | Iteración 3 | |
| Funciones asistidas | RF-06, RF-12, RF-20 | Iteración 3 | La pantalla de alta de gasto ya admite valores precargados y exige confirmación humana, para que `RF-06` se enchufe sin rediseñarla (FR-020, regla RN-14) |
| Auditoría | RF-26 | **Construido** | Las cinco tablas económicas de la etapa dejan asiento por disparador; la aplicación no puede escribir la bitácora |

### Lo que la iteración 1 deja verificado

| Criterio | Medición al 2026-09-10 |
|---|---|
| Suma de coeficientes exacta en los dos consorcios de § 13.4 (SC-001) | `100.00000000` en ambos, comparado por decimal |
| Aislamiento por consorcio y por rol (SC-002, SC-002b) | 92 pruebas de integración; el filtro por consorcio no se escribe a mano en ninguna consulta de datos económicos, y una prueba de dominio lo verifica (SC-003) |
| Invariantes impuestos por la base (SC-004b, SC-005) | Verificados **salteándose la capa de aplicación** |
| Tiempo de respuesta del listado con 10.800 gastos (SC-006) | p95 de 363 ms contra un límite de 2.000 ms (§ 14.5) |
| Accesibilidad de las pantallas del consorcista (SC-011) | axe sin infracciones A ni AA |

### Lo que la iteración 2 deja verificado

| Criterio | Medición al 2026-09-10 |
|---|---|
| Cuadratura del prorrateo con tolerancia cero sobre 1, 12, 96 y 100 unidades (SC-001) | 33 pruebas de dominio sin base, 100 % de ramas (SC-002, SC-014) |
| Coincidencia con las tres liquidaciones reales del cliente (SC-005) | Al centavo en las tres; una diferencia de convención en el ajuste de redondeo, explicada en § 15.2.1 |
| Emisión doble, incluida la concurrente (SC-011) | Exactamente una emite; el candado es un índice único parcial de la base |
| Liquidación de 100 unidades (SC-006, RNF-07) | 1.155 ms en la peor de cinco corridas, contra 30.000 |
| 96 documentos en diferido (SC-007) | 38 s en dos disparos, contra 10 min; una falla inyectada deja los otros 95 intactos |
| Expensa de otra unidad por identificador directo (SC-008) | «No encontramos lo que buscabas», en escritorio y a 390 px |
| Nómina de deudores por rol (SC-015) | Dos consultas distintas: la del consorcista no trae un solo nombre |
| Aislamiento entre consorcios en la morosidad (RT-04) | Fuga encontrada y cerrada: las tablas sin `consorcio_id` se alcanzan por su padre aislado |

### Ensayo del recorrido sobre el entorno desplegado (SC-014)

Recorrido de `specs/002-nucleo/quickstart.md` § Recorrido manual, hecho el **2026-09-10** sobre
<https://flay-bamba-team.vercel.app> con la versión `1a36120`, íntegramente desde el navegador.

| Paso | Resultado |
|---|---|
| 1. Sesión de administrador e invitación de un consorcista | **Hecho.** La persona queda en estado `invitado` y la fila muestra «Correo en cola.» con el botón de reenvío: la degradación de RNF-14 a la vista, porque la demostración no tiene proveedor de correo |
| 2. Consorcio de 12 unidades cerrando en `99.99999999` | **Hecho.** Rechazo: «Los coeficientes suman 99.99999999 %: falta 0.00000001 % para llegar a 100. Revisá las 12 unidades cargadas.» Corregida la última unidad, el padrón cierra en `100.00000000` (SC-004) |
| 3. Período del mes, gasto con comprobante | **Hecho salvo la bitácora.** Período 09/2026 abierto, gasto de `125000.50` —a la vista como cadena, no como número— y comprobante subido **directo** al almacenamiento, sin pasar por el servidor |
| 4. Consorcista desde un teléfono | **Parcial.** El listado y el detalle se recorrieron a 390 px sin desplazamiento horizontal, pero con la sesión del administrador |
| 5. Gasto de otro consorcio por identificador directo en la dirección | **Hecho.** El mismo identificador, con el otro consorcio activo, responde «No encontramos lo que buscabas.», nunca «prohibido» |

Lo que el ensayo encontró, y que ninguna prueba automática podía encontrar:

1. **El entorno desplegado estaba incompleto.** No tenía secreto de sesión —ingresar devolvía 500—
   ni almacén de objetos, así que no había forma de subir un comprobante. Nadie lo había notado
   porque hasta `001-andamiaje` no existía pantalla con sesión y la ruta de salud no la necesita.
   Ambas cosas quedaron configuradas el 2026-09-10; el flujo de verificación arrastraba el mismo
   hueco (§ 14.5).
2. **La bitácora no tiene pantalla.** La auditoría se impone por disparador y se verifica por prueba
   de integración contra la base (SC-007, SC-008), pero ninguna funcionalidad de la etapa la expone:
   el paso 3 del guion supone una vista que no existe. Se construye en la iteración 2 o el guion se
   reescribe; no es un defecto de lo construido, es un hueco del guion.
3. **El paso 4 depende del correo.** El enlace para fijar la contraseña sólo viaja por correo, así
   que sin proveedor configurado no hay forma de entrar como la persona invitada. Es coherente con
   FR-005 —no hay contraseña inicial fuera del enlace— y con RNF-14, pero deja el paso a medias
   hasta que la demostración tenga un servicio de correo.

## 13.4 Datos de demostración

*Semilla versionada en `datos-cliente/juego-ficticio-13-4/` (M-08). La demostración corre únicamente
sobre esta semilla; se registra su hash SHA256 por archivo:*

- Dos consorcios contrastantes: C-A Mitre 456 (12 uds, 12.50000000/7.50000000/5.00000000 =
  100.00000000) y C-B San Martín 7890 (96 uds, 95×1.04166667 + 1×1.04166635 = 100.00000000).
  **Construido** en `pruebas/fixtures/juego-13-4.ts`, con esos mismos coeficientes, y cargado por
  `npm run semilla`; el volumen anual de 10.800 gastos lo agrega `npm run semilla:volumen`. La
  semilla es código y no un juego de archivos con hash bajo `datos-cliente/`: al ser
  determinística, el hash que M-08 pedía lo da el control de versiones.
- Doce períodos de 2026 por consorcio, los abre `semilla:volumen` con sus 450 gastos cada uno. Las
  liquidaciones y los pagos **no** los deja la semilla: se emiten desde la pantalla durante la
  demostración (paso 2 del guion), porque emitir es justamente lo que se muestra. La mora prevista
  (C-A 3B, 1C, 2C) se produce pagando el resto de las unidades y dejando esas tres.
- Reclamos RC-01 a RC-05 en todos los estados, con su historial; dos espacios comunes por consorcio.
- Reglamento como documento del consorcio de 12: `datos-cliente/reglamento/reglamento-copropiedad.md`,
  en `pendiente` con su trabajo de indexación, que corre con el primer pedido al panel.
- Un usuario por rol (`usuarios.csv`): administrador, consejo, consorcistas al día y morosos. Nacen
  `invitado`; con `DEMO_CLAVE` en el entorno de demostración nacen activos con esa clave.

Como la semilla es código, su huella es la del control de versiones. Los archivos que la componen y
su hash de objeto en Git al cierre (`git hash-object`):

| Archivo | Hash de objeto |
|---|---|
| `pruebas/fixtures/juego-13-4.ts` | `6ceec7458b32bc8d4270918b4fac72fa012f3a9f` |
| `pruebas/fixtures/servicios-13-4.ts` | `90b9f33db8f836b0c351bb35c1df3cd91b9820f3` |
| `scripts/semilla.mjs` | `d56c04fadef7899e49c1d59e9e341ea6849b3c59` |
| `scripts/semilla-volumen.mjs` | `47def30e7a3199f2edbd0e46c68ad0414edb1927` |
| `prisma/semilla-rubros.ts` | `a3c39a2a20739d2ff713779f6eb9eef435f19648` |

Los archivos CSV de `datos-cliente/juego-ficticio-13-4/` son la especificación legible de la misma
semilla; sus hashes:

| Archivo | SHA256 |
|---|---|
| `consorcios.csv` | `2F25629373F4AEE86121B27E2DB801852CA97737F00B069CCD4170D830AE0834` |
| `unidades-12.csv` | `8B78D0AF2E09E20B6EC16193BD09F6E47D8F30F580381FAE9927BB791FF4E732` |
| `unidades-96.csv` | `DA14E0F84A826BB03CD7C5FC187A1BA33FE80109B981B2B71AA08B0FCD9EC43B` |
| `periodos-12.csv` | `6415808F00F47BD56835F41DB1E94AA5D27C3AF58BA8268FC8BF05238E69BB6C` |
| `reclamos.csv` | `F87B669AD6E90864086DDA547350003896B188936F604A5B8421EDFF48524A4D` |
| `usuarios.csv` | `6D6C2CCE06FA55329F5E71FBD14182EF8A2D64513D60CF06AEF1B2A21635B3F4` |

Los datos son ficticios. **No se utilizan datos reales de Grupo Delta en el entorno de demostración**,
conforme al punto 5.3.2.

## 13.5 Acceso al prototipo

Estado al cierre de la iteración 3.

| Dato | Valor |
|---|---|
| Dirección del sistema | <https://flay-bamba-team.vercel.app> — sigue al último despliegue verde de `main`; `/api/salud` dice qué versión y qué migración sirve |
| Usuario de plataforma | `admin@flay.test`, creado por `npm run semilla:arranque` con la clave en variable de entorno. **La clave no se versiona** y se rota en el primer ingreso (FR-005). Alcanza los dos consorcios |
| Usuario administrador | `admin1@flay.demo` (Grupo Delta, administra C-A y C-B) y `operador1@flay.demo` (administrador sólo de C-B) |
| Usuario consejo | `consejo1@flay.demo` (consejo y consorcista de C-A) |
| Usuarios consorcistas | `vecino1a@flay.demo` (1A, al día), `moroso3b@flay.demo` (3B, en mora), `inquilino1c@flay.demo` (1C, inquilino), `vecinob010@flay.demo` (C-B) |
| Clave de los usuarios ficticios | La de `DEMO_CLAVE` en el entorno de demostración, una sola para los siete; sin esa variable nacen `invitado` y no entran. **No se versiona** |
| Usuario operador | No existe como rol: los roles son administrador, consejo y consorcista (RF-03). `operador1@flay.demo` es un administrador acotado a un consorcio |
| Repositorio de código | <https://github.com/Marchee72/flay-proyecto-final> |
| Versión entregada | `v0.4.0` — etiqueta de cierre de la iteración 3 sobre `main` (§ 8.3.5) |

## 13.6 Guion de demostración

Recorrido para la evaluación sobre las pantallas construidas, con la semilla de § 13.4 y los
usuarios de § 13.5. Cada paso nombra la pantalla y lo que se debe ver:

1. **Carga asistida** — como `admin1`, Gastos → «Cargar comprobante con asistencia», subir
   `datos-cliente/comprobantes/archivos/C15.png` (total manuscrito). En menos de un minuto la
   revisión muestra el formulario precargado con `62500.00` y la marca «Precargado: revisar antes
   de confirmar» al lado del comprobante; el gasto existe recién al apretar «Registrar gasto».
2. **Liquidación** — como `admin1`, Períodos → cerrar el mes y emitir. La emisión muestra el total
   y la cuadratura; los 12 documentos se generan en diferido. Pagos → registrar el pago de las
   unidades al día y dejar 3B, 1C y 2C: es la mora que después muestran los indicadores.
3. **El consorcista** — como `vecino1a`, desde un teléfono: Expensas → su expensa con el detalle y
   la descarga; Gastos → el listado con los comprobantes. Probar la dirección de la expensa de otra
   unidad: «No encontramos lo que buscabas».
4. **Reclamo con sugerencia** — como `vecino1a`, Reclamos → «Nuevo reclamo» («El ascensor quedó
   parado con una persona atrapada»). Como `admin1`, abrir el reclamo: la tarjeta «Sugerencia
   automática» propone rubro, urgencia crítica y proveedor; aplicar no cambia el estado.
5. **Gestión hasta el cierre** — como `admin1`, Asignar → Marcar en curso → Resolver → Cerrar, con
   comentario en cada paso; el historial lo muestra completo. Pendientes → «Despachar» muestra los
   avisos al vecino (o «en cola» sin proveedor de correo).
6. **Consulta documental** — como `vecino1a`, Documentación → «Preguntarle a la documentación»:
   «¿Cuántas personas entran en el salón de usos múltiples?» responde «cuarenta» citando el
   reglamento y el fragmento. «¿Cuánto cuesta el estacionamiento para visitas?» responde «No lo
   encontramos en la documentación cargada».
7. **Indicadores** — como `admin1`, Indicadores: morosidad con la meta del 12 % y sus alertas,
   gasto por rubro con desvíos, proveedores por costo y recurrencia, resolución de reclamos por
   urgencia con la meta de 72 h, carga administrativa contra las 38 h.
8. **Degradación** — con `GEMINI_API_KEY` retirada del entorno y el servicio reiniciado: la carga
   asistida deja el comprobante guardado y el formulario vacío; el reclamo se registra sin
   sugerencia; la consulta lleva a la lista de documentos. Todo lo demás sigue igual (RNF-14).

El punto 8 del guion no es habitual en una demostración, pero es la verificación de RNF-14 y de los
principios del punto 12.8.1.

## 13.7 Limitaciones conocidas

Sin omitir nada, en tres grupos.

**Diferidas en el punto 9.11 y que siguen diferidas** (20 de 23, con el paliativo allí enumerado):
certificado de deuda (1); informe de precisión de la asistencia (3: la vista `v_precision_asistencia`
y las columnas existen, la pantalla no); ocupación de espacios comunes como indicador (4); aviso de vencimiento próximo (5); carga masiva de unidades
(6: el padrón entra entero pero desde el formulario, no desde un archivo); alta y modificación de
rubro (9, 10: el catálogo se siembra); anulación de pago (8: se anula la liquidación entera y sus imputaciones se revierten, no un pago suelto); bajas lógicas de consorcio, unidad, usuario, proveedor y
documento (11 a 15); modificación o baja de novedad (16); notificaciones leídas y su listado (17,
23: los avisos van por correo, no hay centro de notificaciones); consulta de proveedor con
histórico (19); consulta de la bitácora (20: se produce por disparador, se lee por base); listado de
rubros (21); descarga de comprobante como transacción aparte (22).

**Diferidas en el punto 9.11 que se construyeron igual** (3 de 23), porque una decisión de la etapa
las volvió baratas o necesarias: exportación completa en formato abierto (2: es la condición de
§ 5.5.4, y salió a un manejador de ruta); anulación de liquidación con reemisión (7: nació con el
candado y la auditoría de la iteración 2, y al anular se revierten las imputaciones de sus pagos);
modificación de espacio común (18: mismo formulario que el alta).

**Defectos abiertos y diferencias entre lo diseñado y lo construido**:

- D-01 (media, § 15.4): la dirección de descarga de un comprobante o documento la entrega el
  almacenamiento y no vence. Sólo se resuelve con sesión y habilitación, pero una vez obtenida se
  puede reutilizar. El diseño (§ 18, A6) pedía enlace firmado de vencimiento corto: queda para
  producción con un almacén privado.
- D-02 (media): el comprobante no guarda huella; el duplicado (CU-06, flujo 2a) no se detecta. La
  huella sí existe para los documentos del consorcio.
- Depósitos como medio de pago: se registran como `deposito` sin conciliación bancaria; la
  conciliación no estaba en el alcance y sigue sin estarlo.
- HEIC y TIFF no se muestran en el navegador: se ofrecen para descarga con la razón a la vista
  (FR-018c). La vista previa convertida quedó fuera.
- Sólo se indexa lo que tiene texto: PDF con texto y Markdown. Un PDF escaneado sin capa de texto
  queda en `error` con el motivo legible y se sigue pudiendo descargar; no hay reconocimiento
  óptico de documentos, aunque sí de comprobantes (que van por el extractor, no por el índice).
- No hay rol «operador» (§ 13.5): el diseño de los casos de uso lo nombraba y el punto 12 lo
  resolvió con administrador, consejo y consorcista. Un administrador acotado a un consorcio cumple
  ese papel.
- La cola de trabajos se drena con cada pedido al panel y con una tarea diaria para las vistas; no
  hay un proceso aparte. Sin navegación no hay drenaje: para la demostración alcanza, y la nota 14
  de `CLAUDE.md` lo deja dicho.
- Restauración de respaldo (PN-05) y revisión de mensajes por una persona ajena (PN-06) no se
  ejecutaron en esta entrega; ambas quedan como puerta de producción en § 18.

---

## Referencias

- Documentos internos: puntos 8.4 (prototipos), 9.11 (decisión de alcance), 12 (diseño), 14
  (codificación), 15 (prueba) y 18 (seguridad) de este mismo trabajo.
- `specs/002-nucleo/quickstart.md`, `specs/003-liquidacion/quickstart.md` y
  `specs/004-servicios/quickstart.md`: los recorridos manuales de cada etapa, de los que sale el
  guion de § 13.6.
