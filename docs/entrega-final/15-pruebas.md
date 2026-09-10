# 15. Prueba

> **Requisito de la cátedra (Última entrega, punto 15):** *"Prueba."*

> ⚠️ **Estado: esqueleto.** La estrategia y los criterios ya están definidos; los resultados se
> completan durante la construcción y el cierre.

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
| PL-07 | Coeficiente modificado después de emitir una liquidación anterior | La liquidación anterior conserva su coeficiente; la nueva usa el vigente, conforme a RN-02 | |
| PL-08 | Falla de persistencia a mitad de la operación | La transacción revierte por completo | **Supera** (2026-09-10). La falla se provoca con una segunda emisión, que es la única que rompe después de haber escrito |
| PL-09 | Gasto en cuotas imputado a varios períodos | Solo la cuota del período se incluye en la liquidación | |
| PL-10 | **Comparación contra tres liquidaciones reales del cliente** | Coincidencia al centavo en las tres | **Supera** (2026-09-10), con una diferencia de convención explicada abajo |

PL-10 es el caso de mayor valor: es la validación en paralelo del punto 5.1.2 y el criterio de
aceptación del entregable 3 del punto 6.4.1.

Los casos `PL-07` y `PL-09` quedan abiertos: el primero necesita el cambio de coeficiente entre dos
emisiones y el segundo, el gasto en cuotas, que ninguna etapa construyó todavía.

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
| PA-01 | Consorcista intenta acceder a una unidad de otro consorcio por su identificador | Denegado | |
| PA-02 | Consorcista intenta descargar la liquidación de otra unidad | Denegado | |
| PA-03 | Consorcista consulta la nómina de morosos | Denegado, conforme a RN-13; solo accede al dato agregado | |
| PA-04 | Consorcista formula una consulta documental cuya respuesta está en el reglamento de otro consorcio | No se recupera ningún fragmento ajeno; se responde sin respaldo | |
| PA-05 | Operador intenta ejecutar una liquidación | Denegado: la ejecución es del rol administrador | |
| PA-06 | Usuario con habilitación vencida | Denegado | |
| PA-07 | Acceso directo a un enlace de comprobante sin sesión | Denegado; los enlaces son firmados y de vencimiento corto | |

### 15.2.3 Funciones asistidas

| ID | Caso | Resultado esperado | Estado |
|---|---|---|---|
| PI-01 | Extracción sobre 30 comprobantes reales de formatos variados | Al menos 80 % de campos correctos, según el criterio del punto 8.4.3 | |
| PI-02 | Comprobante ilegible o fuera de foco | Confianza por debajo del umbral; formulario vacío, sin precarga | |
| PI-03 | Servicio de extracción deshabilitado | La carga manual funciona sin degradación de ninguna otra función (RNF-14) | |
| PI-04 | Salida del servicio malformada o fuera de esquema | Se descarta; se comporta como servicio no disponible | |
| PI-05 | La extracción devuelve un importe erróneo y el operador no lo corrige | Verificar que el comprobante permanece visible junto al campo, de modo que el error sea detectable | |
| PI-06 | Consulta documental con 20 preguntas frecuentes sobre un reglamento real | Al menos 85 % con el fragmento correcto entre los tres primeros | |
| PI-07 | Consulta cuya respuesta **no** está en la documentación cargada | Se responde que no hay respaldo documental. **No se improvisa una respuesta** | |
| PI-08 | Toda respuesta generada | Cita documento y página | |
| PI-09 | Triage con el servicio deshabilitado | El reclamo se crea sin clasificar | |

PI-07 es la prueba más importante de esta sección: verifica el segundo principio del punto 12.8.1.

### 15.2.4 Reglas de negocio restantes

| ID | Caso | Resultado esperado | Estado |
|---|---|---|---|
| PR-01 | Dos reservas simultáneas del mismo espacio y horario | La restricción de exclusión de la base rechaza la segunda, conforme a RN-10 | |
| PR-02 | Reserva fuera de la anticipación mínima | Rechazada, informando la regla concreta y el valor admitido | |
| PR-03 | Reserva que excede el tope mensual de la unidad | Rechazada | |
| PR-04 | Dos ocupaciones vigentes del mismo tipo sobre una unidad | Rechazada, conforme a RN-09 | |
| PR-05 | Carga de un comprobante ya existente | Se advierte el duplicado y se muestra el gasto asociado | |
| PR-06 | Modificación de un gasto de un período liquidado | Rechazada, conforme a RN-03 | |
| PR-07 | Cambio de estado de reclamo sin responsable asignado | Rechazado, conforme a RN-11 | |
| PR-08 | Toda operación sobre datos económicos | Queda registrada en la bitácora, conforme a RN-15 | |
| PR-09 | Intento de modificar o borrar un registro de auditoría desde la aplicación | Denegado, conforme a RNF-12 | |

### 15.2.5 Requerimientos no funcionales

| ID | Requerimiento | Criterio | Estado |
|---|---|---|---|
| PN-01 | RNF-06 | Percentil 95 de las consultas por debajo de 2 segundos | |
| PN-02 | RNF-07 | Liquidación de 100 unidades en menos de 30 segundos | |
| PN-03 | RNF-01 | Operación correcta en pantallas de 360 píxeles de ancho | |
| PN-04 | RNF-11 | Contraste mínimo 4,5:1, navegación completa por teclado, etiquetas asociadas | |
| PN-05 | RNF-09 | Restauración desde copia de respaldo, probada y cronometrada | |
| PN-06 | RNF-10 | Revisión de todos los mensajes de error por una persona ajena al desarrollo | |

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

*A completar durante la construcción.*

| Severidad | Definición | Criterio de cierre |
|---|---|---|
| Crítica | Impide operar, o produce un error en un importe | Bloquea la entrega |
| Alta | Funcionalidad comprometida inoperante, o defecto de autorización | Bloquea la entrega |
| Media | Funcionalidad degradada con alternativa disponible | Se admite documentada |
| Baja | Cosmético o de redacción | Se admite documentada |

| ID | Descripción | Severidad | Detectado en | Estado | Resolución |
|---|---|---|---|---|---|
| | | | | | |

## 15.5 Resultado de la auditoría de seguridad externa

*A completar tras el paquete 6.2 del punto 10.2.*

| Hallazgo | Severidad | Descripción | Remediación | Estado |
|---|---|---|---|---|
| | | | | |

Un hallazgo de severidad alta bloquea la puesta en producción, conforme al hito del punto 10.7.

## 15.6 Informe de pruebas

*A completar al cierre.*

| Indicador | Valor |
|---|---|
| Casos de prueba definidos | |
| Casos ejecutados | |
| Casos superados | |
| Defectos detectados por severidad | |
| Defectos abiertos al momento de la entrega | |
| Cobertura de pruebas automatizadas sobre la lógica de dominio | |

---

## Referencias

*A completar.*
