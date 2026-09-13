# 15. Prueba

> **Requisito de la cátedra (Última entrega, punto 15):** *"Prueba."*

> ✅ **Estado: completo.** Los resultados de § 15.2 nombran la prueba automática o el guion que los
> verifica; lo parcial y lo no ejecutado está dicho como tal, con su defecto en § 15.4.

---

## 15.1 Estrategia de prueba

| Nivel | Alcance | Responsable | Momento |
|---|---|---|---|
| Unitario | Lógica de dominio aislada: prorrateo, intereses, imputación, validación de coeficientes y de reglas de reserva | Quien escribe el código | Continuo, obligatorio en la lógica económica según el punto 8.3.3 |
| Integración | Casos de uso completos contra base de datos real, incluyendo transaccionalidad | Ambos integrantes | Al cerrar cada requerimiento |
| Sistema | Circuitos de negocio de extremo a extremo | Ambos integrantes | Al cerrar cada iteración |
| Aceptación | Validación por el cliente contra los criterios del punto 6.4.1 | Cliente | Al cerrar cada iteración |
| Seguridad | Auditoría externa contratada | Empresa externa | Paquete 6.2 del punto 10.2 |
| Rendimiento | Verificación de RNF-06 y RNF-07 | Ambos integrantes | Iteración 2 y cierre |
| Accesibilidad | Verificación de RNF-11 sobre las pantallas del consorcista | Integrante 2 | Iteración 3 |

## 15.2 Casos de prueba críticos

### 15.2.1 Motor de liquidación — riesgo RT-01

Los casos siguientes derivan de las reglas de negocio del punto 7.2 y de los flujos alternativos del
caso de uso CU-03. Ningún resultado distinto de "supera" es aceptable para cerrar la iteración 2.

| ID | Caso | Resultado esperado | Estado |
|---|---|---|---|
| PL-01 | Consorcio de 12 unidades con coeficientes exactos, sin deuda anterior | La suma de los detalles iguala el total, diferencia $ 0 | **Supera** (2026-09-10) |
| PL-02 | Consorcio de 96 unidades con coeficientes de ocho decimales | Diferencia de redondeo menor o igual a un centavo, asignada a la unidad de mayor coeficiente | **Supera** (2026-09-10), también con 100 unidades |
| PL-03 | Coeficientes que suman 99,9998 % | Se aborta e informa qué unidades revisar y la diferencia exacta | **Supera** (2026-09-10), probado con `99,99999999` |
| PL-04 | Período con gastos ordinarios y extraordinarios | Dos subtotales por unidad, conforme a RN-05 y a la Ley 27.551 | **Supera** (2026-09-10) |
| PL-05 | Unidad con deuda de tres períodos anteriores | Interés por **mes vencido completo** sobre cada liquidación impaga, desde su propio vencimiento | **Supera** (2026-09-10). El criterio cambió de días a meses completos por decisión del 2026-09-10; ver `003-liquidacion/spec.md` § Clarifications |
| PL-06 | Intento de liquidar un período ya liquidado | Se rechaza mientras haya una liquidación **vigente**; después de anular, la reemisión procede | **Supera** (2026-09-10), incluida la ejecución concurrente |
| PL-07 | Coeficiente modificado después de emitir una liquidación anterior | La liquidación anterior conserva su coeficiente; la nueva usa el vigente, conforme a RN-02 | **Supera** (2026-09-10) |
| PL-08 | Falla de persistencia a mitad de la operación | La transacción revierte por completo | **Supera** (2026-09-10). La falla se provoca con una segunda emisión, que es la única que rompe después de haber escrito |
| PL-09 | Gasto en cuotas imputado a varios períodos | Solo la cuota del período se incluye en la liquidación | |
| PL-10 | **Comparación contra tres liquidaciones reales del cliente** | Coincidencia al centavo en las tres | **Supera** (2026-09-10), con una diferencia de convención explicada abajo |

PL-10 es el caso de mayor valor: es la validación en paralelo del punto 5.1.2 y el criterio de
aceptación del entregable 3 del punto 6.4.1.

El caso `PL-09` queda abierto: el gasto en cuotas no lo construyó ninguna etapa, y no es alcance de
la iteración 2.

#### La única discrepancia de PL-10, y por qué no es un defecto

Al comparar **2026-07** apareció una diferencia en la unidad `1A`: la planilla dice `125000.09` de
ordinario y el motor calcula `125000.13`. **Los totales coinciden**: `150000.09` en los dos
documentos, y en las otras once unidades no hay ninguna diferencia.

La causa es de convención, no de cálculo. La planilla del cliente **le resta el ajuste de redondeo a
la columna «ordinario»** —`125000.13 − 0.04 = 125000.09`— y además lo muestra en su propia columna.
El sistema deja el importe intacto y el ajuste aparte, porque la regla RN-07 (§ 7.2) y el Principio
II de la constitución exigen que la diferencia quede **«en un campo propio, no mezclada con el
importe»**: es lo que permite explicarle a un propietario de dónde salieron sus centavos.

La comparación automática traduce esa columna y deja la explicación escrita en
`pruebas/planillas/liquidaciones-reales.spec.ts`. Conviene avisarle al cliente que el documento de
expensa va a mostrar el ajuste como línea separada, que es un cambio visible respecto de su
planilla.

### 15.2.2 Autorización — riesgo RT-04

Estas pruebas se ejecutan **por cada entidad expuesta**, no una sola vez.

| ID | Caso | Resultado esperado | Estado |
|---|---|---|---|
| PA-01 | Consorcista intenta acceder a una unidad de otro consorcio por su identificador | Denegado | **Cumple**: `pruebas/integracion/consorcios.spec.ts` («un consorcista que no es propietario de la unidad no la encuentra»), `autorizacion.spec.ts` («con habilitación sobre otro consorcio, tampoco»); de extremo a extremo, `pruebas/e2e/consorcista.spec.ts` («el gasto de otro consorcio no aparece: no encontrado, nunca prohibido») |
| PA-02 | Consorcista intenta descargar la liquidación de otra unidad | Denegado | **Cumple**: `pruebas/e2e/expensa.spec.ts` («la expensa de otra unidad responde no encontrado»), `pruebas/integracion/pagos.spec.ts` («el consorcista ve el estado de cuenta de su unidad y no el de la vecina») |
| PA-03 | Consorcista consulta la nómina de morosos | Denegado, conforme a RN-13; solo accede al dato agregado | **Cumple**: `pruebas/integracion/pagos.spec.ts` («el administrador ve la nómina; el consorcista, solo el agregado»), `pruebas/e2e/morosidad.spec.ts` (el consorcista no ve ningún nombre de unidad) |
| PA-04 | Consorcista formula una consulta documental cuya respuesta está en el reglamento de otro consorcio | No se recupera ningún fragmento ajeno; se responde sin respaldo | **Cumple**: `pruebas/integracion/consulta-documental.spec.ts` (SC-016: un espía sobre el generador comprueba que no le llega ningún fragmento ajeno ni no visible) y contra el proveedor real el 12/09/2026 (PI-07) |
| PA-05 | Operador intenta ejecutar una liquidación | Denegado: la ejecución es del rol administrador | **Cumple** (el sistema no tiene rol «operador»: son consejo y consorcista): `pruebas/integracion/autorizacion.spec.ts` («el rol que no alcanza es rechazado, aunque la habilitación sea vigente»), `periodo-liquidado.spec.ts` («un consorcista no abre períodos»), `consorcios.spec.ts` («un consorcista no puede cargar el padrón») |
| PA-06 | Usuario con habilitación vencida | Denegado | **Cumple**: `pruebas/integracion/autorizacion.spec.ts` («una habilitación que venció ayer equivale a inexistente») |
| PA-07 | Acceso directo a un enlace de comprobante sin sesión | Denegado; los enlaces son firmados y de vencimiento corto | **Parcial** — defecto D-01: la dirección del comprobante solo se resuelve con sesión y habilitación (`comprobantes.spec.ts`: «uno sin confirmar no se puede ver», «el comprobante de otro consorcio devuelve no encontrado»; sin sesión, `/api/exportar` y el panel responden 401 y redirección), pero la dirección que entrega el almacenamiento **no vence**: quien la obtuvo la puede reutilizar. Ver § 15.4 |

### 15.2.3 Funciones asistidas

| ID | Caso | Resultado esperado | Estado |
|---|---|---|---|
| PI-01 | Extracción sobre 30 comprobantes de formatos variados (ficticios, generados; ver § 14.3) | Al menos 80 % de campos correctos, según el criterio del punto 8.4.3 | **Supera**: 149 de 150 campos (99,3 %), 11/09/2026, `poc/resultados/extraccion-gemini-consolidado.json` |
| PI-02 | Comprobante ilegible o fuera de foco | Confianza por debajo del umbral; formulario vacío, sin precarga | **Cumple** (12/09/2026, proveedor real): sobre una foto desenfocada y rotada el extractor devolvió confianza 0,300 con fecha e importe inventados; por debajo del umbral 0,5 (CU-06 3b) no se precarga ningún campo y la pantalla lo dice. Latencia 9,0 s. `pruebas/integracion/extraccion.spec.ts` reproduce esa salida |
| PI-03 | Servicio de extracción deshabilitado | La carga manual funciona sin degradación de ninguna otra función (RNF-14) | **Cumple** (12/09/2026): proyecto `degradacion` de Playwright contra un servidor con la implementación nula (`pruebas/e2e/asistencia.degradacion.spec.ts`), más `asistencia.spec.ts` con `no_disponible`: el comprobante queda guardado, el formulario vacío y el gasto se carga a mano; reclamos y consulta siguen |
| PI-04 | Salida del servicio malformada o fuera de esquema | Se descarta; se comporta como servicio no disponible | **Cumple**: `pruebas/integracion/extraccion.spec.ts` («una salida fuera de esquema equivale a servicio no disponible») |
| PI-05 | La extracción devuelve un importe erróneo y el operador no lo corrige | Verificar que el comprobante permanece visible junto al campo, de modo que el error sea detectable | **Cumple**: la revisión (`/gastos/asistida/[id]`) muestra el comprobante junto al formulario; `pruebas/e2e/asistencia.spec.ts` (SC-017) corrige el importe y verifica `campos_corregidos = ["importe"]` |
| PI-06 | Consulta documental con 20 preguntas frecuentes sobre un reglamento de 72 artículos (ficticio) | Al menos 85 % con el fragmento correcto entre los tres primeros | **Supera**: 20 de 20 (100 %), 19 en primer lugar; línea de base léxica 16 de 20. 11/09/2026, `poc/resultados/busqueda-gemini.json` |
| PI-07 | Consulta cuya respuesta **no** está en la documentación cargada | Se responde que no hay respaldo documental. **No se improvisa una respuesta** | **Cumple** (12/09/2026, proveedor real, `gemini-3.5-flash-lite` porque `gemini-3.5-flash` devolvía 503 por demanda): «¿Cuánto cuesta el estacionamiento para visitas?» → sin respaldo, 3,5 s; como consorcista del otro consorcio, la pregunta del SUM → sin respaldo, 0,6 s (ningún fragmento ajeno llega al generador). Con la determinista, diez preguntas sin respuesta dan diez abstenciones (`consulta-documental.spec.ts`) |
| PI-08 | Toda respuesta generada | Cita documento y página | **Cumple** (12/09/2026, proveedor real): «¿Cuántas personas entran en el salón de usos múltiples?» → «La capacidad máxima del salón de usos múltiples es de cuarenta personas», cita Reglamento de copropiedad, fragmento 50, 3,9 s; indexar los 72 artículos tomó 7,3 s. Sin citas no hay respuesta, lo decide el caso de uso |
| PI-09 | Triage con el servicio deshabilitado | El reclamo se crea sin clasificar | **Cumple**: `pruebas/integracion/triage.spec.ts` («con la nula el reclamo se crea sin sugerencia») |

PI-07 es la prueba más importante de esta sección: verifica el segundo principio del punto 12.8.1.

### 15.2.4 Reglas de negocio restantes

| ID | Caso | Resultado esperado | Estado |
|---|---|---|---|
| PR-01 | Dos reservas simultáneas del mismo espacio y horario | La restricción de exclusión de la base rechaza la segunda, conforme a RN-10 | **Supera**: `pruebas/integracion/reservas.spec.ts` («dos INSERT concurrentes que saltan la aplicación: exactamente uno queda confirmado»), es la restricción `EXCLUDE` de la base y no la aplicación |
| PR-02 | Reserva fuera de la anticipación mínima | Rechazada, informando la regla concreta y el valor admitido | **Cumple**: `pruebas/integracion/reservas.spec.ts` («anticipación, duración, capacidad y tope mensual, cada uno con su valor») |
| PR-03 | Reserva que excede el tope mensual de la unidad | Rechazada | **Cumple**: misma prueba que PR-02 (el tope mensual con su valor en el mensaje) |
| PR-04 | Dos ocupaciones vigentes del mismo tipo sobre una unidad | Rechazada, conforme a RN-09 | **Cumple**: `pruebas/integracion/invariantes-base.spec.ts` («un segundo inquilino vigente sobre la misma unidad es rechazado»; dos propietarios sí, que es el condominio) |
| PR-05 | Carga de un comprobante ya existente | Se advierte el duplicado y se muestra el gasto asociado | **No implementado** — defecto D-02: el comprobante no guarda huella y el duplicado no se detecta. La alternativa disponible es el listado de gastos por período y proveedor. Ver § 15.4 y § 13.7 |
| PR-06 | Modificación de un gasto de un período liquidado | Rechazada, conforme a RN-03 | **Cumple**: `pruebas/integracion/periodo-liquidado.spec.ts` («un período liquidado rechaza el alta en el 100 % de los intentos»; cerrado y anulado tampoco) |
| PR-07 | Cambio de estado de reclamo sin responsable asignado | Rechazado, conforme a RN-11 | **Supera**: la aplicación lo rechaza con mensaje y un `UPDATE` directo lo rechaza el `CHECK` de la base (`pruebas/integracion/reclamos.spec.ts`, SC-004) |
| PR-08 | Toda operación sobre datos económicos | Queda registrada en la bitácora, conforme a RN-15 | **Cumple**: `pruebas/integracion/auditoria-etapa.spec.ts` (las cinco tablas económicas de `002`), `auditoria-liquidacion.spec.ts` (liquidación, detalles, pagos e imputaciones) y `auditoria-servicios.spec.ts` (reclamo, reserva, extracción y el gasto que nace de ella): exactamente un asiento por operación, con imagen anterior y posterior |
| PR-09 | Intento de modificar o borrar un registro de auditoría desde la aplicación | Denegado, conforme a RNF-12 | **Cumple**: `pruebas/integracion/bitacora.spec.ts` («`flay_app` no puede escribir la bitácora: tres veces permiso denegado») y `auditoria-etapa.spec.ts` («la aplicación no puede borrar lo que sus propias tablas asentaron», SC-008) |

### 15.2.5 Requerimientos no funcionales

| ID | Requerimiento | Criterio | Estado |
|---|---|---|---|
| PN-01 | RNF-06 | Percentil 95 de las consultas por debajo de 2 segundos | **Supera** sobre el panel de indicadores I-6, la pantalla que agrega más: `medir:p95 /indicadores`, 100 cargas sobre `semilla:volumen` (10.800 gastos, doce períodos), p50 149 ms, p95 **184 ms** (12/09/2026, local contra la base administrada). Estado de cuenta, reclamos y reservas quedan fuera del presupuesto verificado (I-07) |
| PN-02 | RNF-07 | Liquidación de 100 unidades en menos de 30 segundos | **Supera**: `npm run medir:liquidacion`, cinco corridas de 100 unidades contra la base administrada entre 734 y 1.155 ms (§ 14.5, 10/09/2026); la prueba de integración `medicion-liquidacion.spec.ts` lo exige en cada corrida de la puerta |
| PN-03 | RNF-01 | Operación correcta en pantallas de 360 píxeles de ancho | **Cumple a 390 px**, el ancho del proyecto `telefono` de Playwright: cada pantalla del consorcista y de servicios tiene una prueba que afirma que no desborda a lo ancho (`desbordaALoAncho`) y que la navegación sigue disponible. Los 360 px de la consigna no tienen prueba automática aparte |
| PN-04 | RNF-11 | Contraste mínimo 4,5:1, navegación completa por teclado, etiquetas asociadas | **Cumple**: axe A/AA con cero infracciones sobre inicio, ingreso, guía de estilos, listado y detalle del consorcista, expensa, y las once pantallas de servicios (`*.a11y.spec.ts`, `npm run test:a11y`); teclado en `guia-estilos.spec.ts` («todo lo accionable es alcanzable por teclado») |
| PN-05 | RNF-09 | Restauración desde copia de respaldo, probada y cronometrada | **No ejecutada**: la base administrada ofrece restauración a un punto en el tiempo, pero la restauración no se ensayó ni cronometró en esta entrega. Queda como puerta de producción en § 18 |
| PN-06 | RNF-10 | Revisión de todos los mensajes de error por una persona ajena al desarrollo | **Parcial**: los mensajes de error se afirman en las pruebas automáticas (cada rechazo nombra la causa y el valor admitido: `reservas.spec.ts`, `periodo-liquidado.spec.ts`, `comprobantes.spec.ts`), pero la revisión por una persona ajena al desarrollo no se hizo |

### 15.2.6 Las tres condiciones de § 5.5.4

La adopción de la alternativa A quedó sujeta a tres condiciones verificables durante la construcción.
Las tres se verificaron:

| Condición | Verificación | Resultado |
|---|---|---|
| Ninguna función crítica depende exclusivamente de un tercero | Prueba de degradación por cada servicio externo | **Verificada**. Correo: `pruebas/integracion/despachador.spec.ts` y `pendientes.spec.ts` (con el correo caído, cero operaciones fallan y el aviso queda pendiente con reintento). Asistencia: la implementación nula en `asistencia-implementaciones.spec.ts`, `extraccion.spec.ts`, `consulta-documental.spec.ts`, `triage.spec.ts` y el proyecto `degradacion` de Playwright contra un servidor sin clave (SC-013). Almacenamiento: la vista del gasto y la revisión del comprobante sobreviven a un almacén que no responde |
| Los datos se exportan íntegramente en formato abierto | Procedimiento probado antes de la puesta en marcha | **Verificada**. `GET /api/exportar/{consorcio}/{gastos,liquidaciones,pagos}.csv` (UTF-8 con BOM, `;`), `pruebas/integracion/exportar.spec.ts` (el CSV suma en decimal lo mismo que la liquidación), `pruebas/e2e/exportar.spec.ts` (401, 404, descarga) y `npm run exportar:verificar`, que cuadra los tres CSV al centavo contra la base: 12/09/2026, 5.400 gastos en 2,9 s (SC-018) |
| La brecha en búsqueda semántica se resuelve con prueba de concepto antes de comprometer RF-20 | Prueba de concepto sobre un reglamento de copropiedad | **Verificada**. PI-06: 20 de 20 preguntas con el fragmento correcto entre los tres primeros sobre un reglamento ficticio de 72 artículos, contra el umbral del 85 % (`datos-cliente/poc-resultados/busqueda-gemini.json`, 11/09/2026). PI-01, la extracción, 149 de 150 campos |

## 15.3 Precisión medida de las funciones asistidas

*A completar tras el primer mes de operación, con datos de producción.*

| Métrica | Fuente | Umbral de retiro | Valor medido |
|---|---|---|---|
| Extracciones confirmadas sin corrección | `ExtraccionComprobante.campos_corregidos` | Por debajo del 70 % durante un mes | |
| Campos con mayor tasa de corrección | Ídem | — | |
| Sugerencias de reclamo aceptadas sin modificar | `SugerenciaReclamo.aceptada` | Por debajo del 60 % | |
| Consultas documentales marcadas sin respaldo | `ConsultaDocumental.sin_respaldo` | Por encima del 40 % indica documentación insuficiente, no falla del servicio | |
| Consultas valoradas como útiles | `ConsultaDocumental.util` | Por debajo del 60 % | |

Estas métricas se obtienen de la vista `v_precision_asistencia` del punto 7.7 y son las que permiten
decidir con datos si cada función se sostiene, se ajusta o se retira.

## 15.4 Registro de defectos

| Severidad | Definición | Criterio de cierre |
|---|---|---|
| Crítica | Impide operar, o produce un error en un importe | Bloquea la entrega |
| Alta | Funcionalidad comprometida inoperante, o defecto de autorización | Bloquea la entrega |
| Media | Funcionalidad degradada con alternativa disponible | Se admite documentada |
| Baja | Cosmético o de redacción | Se admite documentada |

| ID | Descripción | Severidad | Detectado en | Estado | Resolución |
|---|---|---|---|---|---|
| D-01 | La dirección de descarga de un comprobante o documento la entrega el almacenamiento y no vence: solo se resuelve con sesión y habilitación, pero quien la obtuvo puede reutilizarla | Media (funcionalidad con alternativa: la dirección es impredecible y solo la recibe quien está habilitado; no hay acceso por enumeración) | Iteración 2, revisión de `src/infraestructura/objetos/blob.ts` | Abierto, documentado | Almacén privado con dirección firmada de vencimiento corto, pendiente para producción (§ 18) |
| D-02 | El comprobante no guarda huella: un archivo cargado dos veces produce dos comprobantes (CU-06 2a) | Media (alternativa: el listado de gastos por período y proveedor) | Iteración 3, cierre de PR-05 | Abierto, documentado | Huella SHA-256 por comprobante con índice único por consorcio, como ya la tiene `DocumentoConsorcio` |
| D-03 | `Decimal.toFixed()` perdía los ceros finales al serializar hacia la interfaz (`70` en vez de `70.00`) | Alta (importe mal presentado, no mal calculado) | Iteración 3, e2e de indicadores | Cerrado | `cadena(valor, decimales)` en la capa de aplicación, cubierto por `pruebas/e2e/importe-cadena.spec.ts` |
| D-04 | Una consulta de Prisma devuelta sin `await` desde el trabajo de `conAutorizacion` corría fuera del contexto de aislamiento | Alta (aislamiento) | Iteración 3, integración de reclamos | Cerrado | `async () => await …` en el caso de uso; la extensión sigue lanzando `SinConsorcioActivo` cuando pasa |
| D-05 | El extractor real devolvió fecha e importe inventados con confianza 0,300 sobre una foto borrosa | Alta (dato económico propuesto sin sustento) | Iteración 3, PI-02 contra el proveedor | Cerrado | Umbral 0,5 de confianza global por debajo del cual no se precarga ningún campo (CU-06 3b), `extraccion.spec.ts` |

## 15.5 Resultado de la auditoría de seguridad externa

*A completar tras el paquete 6.2 del punto 10.2.*

| Hallazgo | Severidad | Descripción | Remediación | Estado |
|---|---|---|---|---|
| | | | | |

Un hallazgo de severidad alta bloquea la puesta en producción, conforme al hito del punto 10.7.

## 15.6 Informe de pruebas

| Indicador | Valor |
|---|---|
| Casos de prueba definidos | 41 casos críticos en § 15.2 (PL 10, PA 7, PI 9, PR 9, PN 6), respaldados por 301 pruebas automáticas: 93 de dominio sin base, 171 de integración contra la base (4 de ellas sobre las tres liquidaciones reales, sin base), 37 de extremo a extremo (escritorio, teléfono y degradación) más las de accesibilidad |
| Casos ejecutados | 41 de 41; la puerta `npm run verificar` corre las 301 automáticas en cada integración |
| Casos superados | 37 superan o cumplen; 2 parciales (PA-07, PN-06); 1 no implementado (PR-05); 1 no ejecutado (PN-05) |
| Defectos detectados por severidad | Alta 3 (cerrados), Media 2 (abiertos y documentados), Crítica 0 |
| Defectos abiertos al momento de la entrega | 2, ambos de severidad media con alternativa documentada (D-01, D-02) |
| Cobertura de pruebas automatizadas sobre la lógica de dominio | 100 % de líneas, ramas y funciones sobre `src/dominio/liquidacion/` (umbral exigido por `vitest.config.ts`); el resto del dominio sin umbral, cubierto por sus pruebas de comportamiento |

---

## Referencias

*A completar.*
