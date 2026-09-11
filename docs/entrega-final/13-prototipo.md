# 13. Prototipo

> **Requisito de la cátedra (Última entrega, punto 13):** *"Prototipo."*
> **Fecha límite:** 18 de diciembre de 2026.

> ⚠️ **Estado: esqueleto.** Este documento se completa durante la construcción. La estructura y los
> criterios ya están definidos; el contenido se incorpora al cerrar cada iteración.

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

*A completar al cierre de las tres iteraciones. Debe coincidir con el alcance comprometido del
punto 9.11: 433 puntos de función sin ajustar, con las 23 funcionalidades diferidas allí
enumeradas.*

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
- Doce períodos (C-A 2025-09 a 2026-08, 11 liquidados + 1 abierto; C-B 11 liquidados + 1 abierto).
- Mora: C-A 3B (3 períodos), 1C (2), 2C (1); resto al día. Reclamos RC-01 a RC-05 en todos los estados.
- Reglamento indexado: `datos-cliente/reglamento/reglamento-copropiedad.md` + 20 preguntas.
- Un usuario por rol (`usuarios.csv`): administrador, consejo, consorcistas al día y morosos.

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

*Se completa en cada cierre de iteración. Estado al cierre de la iteración 1.*

| Dato | Valor |
|---|---|
| Dirección del sistema | <https://flay-bamba-team.vercel.app> — sigue al último despliegue verde de `main`; `/api/salud` dice qué versión y qué migración sirve |
| Usuario administrador | `admin@flay.test`, creado por `npm run semilla:arranque` con la clave en variable de entorno. **La clave no se versiona** y se rota en el primer ingreso (FR-005) |
| Usuario operador | No existe en la iteración 1: los roles construidos son administrador, consejo y consorcista (RF-03) |
| Usuario consorcista | Se crea por invitación desde la pantalla de usuarios. Queda en estado `invitado` hasta que salga el correo con el enlace, y la demostración todavía no tiene proveedor de correo configurado |
| Repositorio de código | <https://github.com/Marchee72/flay-proyecto-final> |
| Versión entregada | `v0.3.0` — etiqueta de cierre de la iteración 2 sobre `main` (§ 8.3.5) |

## 13.6 Guion de demostración

*A completar.* Recorrido sugerido para la evaluación, que muestra el circuito completo del negocio:

1. Ingreso como operador, carga de un gasto adjuntando el comprobante y verificación de la extracción
   asistida.
2. Ingreso como administrador, ejecución de la liquidación del período y verificación de la
   cuadratura.
3. Ingreso como consorcista, consulta del estado de cuenta y descarga de la expensa con acceso a los
   comprobantes de respaldo.
4. Alta de un reclamo como consorcista y verificación de la clasificación automática.
5. Gestión del reclamo como operador hasta su cierre, con notificación al vecino.
6. Consulta sobre el reglamento en lenguaje natural, verificando la cita de la fuente.
7. Panel de indicadores: morosidad, desvío de gasto, desempeño de proveedores y tiempo de resolución.
8. Demostración de la degradación: con el servicio de asistencia deshabilitado, la carga manual y el
   alta de reclamo siguen funcionando.

El punto 8 del guion no es habitual en una demostración, pero es la verificación de RNF-14 y de los
principios del punto 12.8.1.

## 13.7 Limitaciones conocidas

*A completar.* Debe enumerar, sin omitir: las funcionalidades diferidas del punto 9.11, los defectos
abiertos de severidad baja y media, y toda diferencia entre lo diseñado y lo construido.

---

## Referencias

*A completar.*
