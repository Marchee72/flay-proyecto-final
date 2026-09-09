<!--
SYNC IMPACT REPORT
Version change: (plantilla sin ratificar) → 1.0.0
Tipo de cambio: MAJOR — ratificación inicial. La constitución pasa de plantilla con
placeholders a documento de gobierno con principios definidos.

Principios definidos (ninguno renombrado; no existían antes):
  I.   Aislamiento por consorcio (NO NEGOCIABLE)
  II.  Exactitud del dinero (NO NEGOCIABLE)
  III. El dominio no conoce la infraestructura
  IV.  La asistencia automática no decide
  V.   Auditoría completa e inviolable

Secciones agregadas:
  - Restricciones técnicas y de seguridad (reemplaza [SECTION_2_NAME])
  - Flujo de desarrollo (reemplaza [SECTION_3_NAME])
  - Governance

Secciones removidas: ninguna.

Todo el contenido deriva de docs/; no introduce reglas nuevas. Origen de cada principio:
  I   → 07-analisis-de-datos.md §7.2 RN-12 · 12-diseno.md §1.3 dec. 3 · 11-analisis-de-riesgos.md RT-04
  II  → 12-diseno.md §6 · §3 · 07-analisis-de-datos.md RN-01, RN-02, RN-07
  III → 12-diseno.md §1.1, §1.2
  IV  → 12-diseno.md §8.1 · RN-14, RNF-14, RNF-15
  V   → 07-analisis-de-datos.md RN-15 · RNF-12 · 12-diseno.md §3

TODOs diferidos: ninguno. RATIFICATION_DATE se fija en la fecha de adopción de este
documento como instrumento de gobierno, no en la fecha de inicio del proyecto.
-->

# Constitución de Flay

Flay es un sistema de administración de consorcios de propiedad horizontal. Administra dinero
de terceros y datos personales de personas que no eligieron ser usuarias del sistema. Esa es la
razón de ser de cada principio que sigue.

Esta constitución **deriva** de la documentación de `docs/` y no la reemplaza. Ante cualquier
discrepancia, `docs/requisitos-catedra.md` y los documentos de las entregas prevalecen. Lo que
esta constitución agrega es exigibilidad: convierte en condición de integración lo que allí está
enunciado como diseño.

## Core Principles

### I. Aislamiento por consorcio (NO NEGOCIABLE)

Un usuario accede únicamente a los datos de los consorcios sobre los que tiene una habilitación
vigente (RN-12, RNF-03).

El filtro por consorcio **DEBE** aplicarse en la capa de acceso a datos, en un solo lugar. **NO
DEBE** implementarse repitiéndolo en cada consulta.

*Fundamento:* RT-04 identifica esto como el defecto de seguridad más probable y más grave del
sistema. Un filtro olvidado en una consulta expone los datos de un consorcio a otro. Aplicarlo en
un único punto convierte el olvido en imposible; repetirlo en cada consulta lo vuelve cuestión de
tiempo.

*Verificación:* toda consulta que devuelva datos de negocio tiene una prueba que confirma que un
usuario sin habilitación vigente sobre ese consorcio no obtiene resultados. La nómina nominada de
deudores solo es visible para administrador y consejo de propietarios; el consorcista ve
únicamente el dato agregado (RN-13).

### II. Exactitud del dinero (NO NEGOCIABLE)

Todo importe se calcula y se almacena en aritmética decimal de precisión fija. **El punto flotante
está prohibido para dinero**, en cualquier capa, sin excepción.

Reglas de cálculo:

- Los coeficientes de las unidades de un consorcio suman exactamente 100,000000 %, con ocho
  decimales (RN-01). La verificación es obligatoria antes de liquidar.
- El redondeo a dos decimales ocurre **solo al final de cada importe unitario**, nunca en pasos
  intermedios.
- La diferencia de redondeo se asigna a la unidad de mayor coeficiente y se registra en un campo
  propio (RN-07).
- Una diferencia mayor a un centavo por unidad **aborta** la liquidación y registra un incidente.
- Toda la liquidación ocurre en una única transacción.
- El coeficiente aplicado se copia al `DetalleLiquidacion` (RN-02): una liquidación pasada debe
  poder reconstruirse aunque el coeficiente haya cambiado después.

*Fundamento:* es dinero de terceros. Un error de representación es inaceptable, y emitir una
liquidación incorrecta es peor que fallar de manera ruidosa. Una diferencia de ese orden de
magnitud no es redondeo: es un defecto de cálculo.

*Verificación:* la lógica de liquidación, prorrateo, intereses e imputación se desarrolla con
pruebas primero (§ Flujo de desarrollo) y se prueba sin base de datos, apoyándose en el
Principio III.

### III. El dominio no conoce la infraestructura

La arquitectura es en capas dentro de un despliegue único. La regla de dependencia apunta al
dominio: **el dominio define las interfaces que necesita y la infraestructura las implementa**.

| Capa | Responsabilidad | Lo que NO hace |
|---|---|---|
| Presentación | Renderizar, recibir formularios, validar formato, presentar errores | Reglas de negocio; acceso directo a la base |
| Aplicación | Orquestar casos de uso, verificar autorización, abrir transacciones, registrar auditoría | Cálculos de negocio |
| Dominio | RN-01 a RN-15: prorrateo, intereses, imputación | Acceder a infraestructura |
| Infraestructura | Persistencia, archivos, correo, servicios externos | Decidir algo del negocio |

**NO DEBE** introducirse una separación en servicios desplegables independientes. La decisión está
tomada en el punto 5.5 y responde a la capacidad real de operación de un equipo de dos personas.

*Fundamento:* esta regla de dependencia es lo que hace verificables los Principios II y IV. Sin
ella, la lógica de liquidación no se puede probar sin base de datos y el proveedor de servicios
automáticos deja de ser reemplazable.

### IV. La asistencia automática no decide

Ninguna salida de un servicio automático impacta en un dato económico sin confirmación humana
explícita (RN-14). `ExtraccionComprobante` es una entidad separada de `Gasto`; el gasto se crea
recién en la acción de confirmar del operador.

Además:

- Toda respuesta sobre documentación **DEBE** citar su fuente. Sin fuente, no hay respuesta.
- La indisponibilidad del servicio externo **NO DEBE** bloquear ninguna función del negocio
  (RNF-14): degrada de forma elegante.
- El proveedor **DEBE** ser reemplazable sin tocar la lógica de negocio (RNF-15). Cada interfaz
  del dominio —`ExtractorDocumental`, `ClasificadorTexto`, `GeneradorVectores`,
  `GeneradorRespuesta`— tiene tres implementaciones: la del proveedor, una determinística para
  pruebas y una nula para degradación.

*Fundamento:* las funciones asistidas son las de mayor incertidumbre técnica y las únicas cuya
ausencia no impide operar el sistema. Que existan tres implementaciones por interfaz es lo que
convierte RNF-14 y RNF-15 en propiedades del diseño en lugar de promesas.

*Verificación:* cada función asistida se prueba con el servicio deshabilitado, y la búsqueda
documental se prueba con preguntas cuya respuesta no está en la documentación cargada.

### V. Auditoría completa e inviolable

Toda operación que modifica un dato económico queda registrada en la bitácora de auditoría
(RN-15).

- La bitácora se puebla mediante **disparadores de base de datos**, no desde el código de la
  aplicación. Ninguna ruta de código puede omitirla.
- El usuario de base de datos de la aplicación **NO DEBE** tener permisos de actualización ni de
  borrado sobre la bitácora (RNF-12). Es de solo agregado.

*Fundamento:* una bitácora que el código puede omitir, o que la aplicación puede alterar, no es
evidencia. Poblarla y protegerla en la base es lo que la vuelve confiable ante un propietario que
pregunta o ante una auditoría.

## Restricciones técnicas y de seguridad

**Neutralidad de producto hasta el punto 14.** La documentación de análisis y diseño describe
capacidades, no marcas. La elección concreta de lenguaje, proveedor de IA y herramienta de
graficación se justifica en `docs/entrega-final/14-codificacion.md` contra los criterios ya
fijados, y no antes. Comprometer un producto durante el análisis introduce una dependencia que el
diseño está construido para evitar.

**Esquema de base de datos.** Migraciones versionadas en el repositorio. **Ningún cambio manual
sobre la base**, en ningún entorno.

**Integridad en la base, no solo en el código.** Las reglas que admiten expresarse como
restricción de base de datos se implementan así: restricciones de exclusión para RN-09
(ocupaciones superpuestas) y RN-10 (reservas superpuestas), claves foráneas para RN-03. La
validación de aplicación es el recurso para lo que la base no puede expresar, no el mecanismo
primario.

**Identificadores.** Universalmente únicos, no secuenciales: las direcciones web no exponen el
volumen de datos.

**Datos personales.** El tratamiento cumple la Ley 25.326 (RNF-13). Los datos no salen del
sistema hacia terceros sin que exista base legal y contractual para ello; esta restricción es la
razón por la que los indicadores se resuelven dentro de la aplicación y no en una herramienta
externa de inteligencia de negocios.

**Accesibilidad y alcance de dispositivos.** Diseño adaptable con visualización correcta en
teléfono (RNF-01). Las pantallas destinadas al consorcista cumplen WCAG 2.1 nivel AA (RNF-11).

**Mensajes de error.** Redactados para el usuario final, sin exponer detalles técnicos internos
(RNF-10).

**Presupuestos de rendimiento.** Consultas por debajo de 2 segundos en el 95 % de los casos
(RNF-06). Liquidación de un consorcio de 100 unidades en menos de 30 segundos (RNF-07); la
generación de documentos es diferida porque no cabe en ese presupuesto de forma sincrónica.

**Notificaciones.** El envío es asincrónico: se persiste la notificación en estado pendiente y una
tarea programada la despacha con reintentos. Una falla del servicio de correo **NO DEBE** hacer
fallar la liquidación.

## Flujo de desarrollo

**Metodología.** Iterativa e incremental, tres iteraciones de construcción (Núcleo → Liquidación →
Servicios y análisis), según `docs/entrega-3/08-metodologia-desarrollo.md`. Cada iteración produce
un incremento desplegado y demostrable.

**Gestión de la configuración.**

- Una rama por requerimiento. La rama principal siempre desplegable.
- Integración mediante solicitud de incorporación con **revisión obligatoria del otro
  integrante**. Ningún cambio llega a la rama principal sin revisión.
- Los mensajes de confirmación referencian el código de requerimiento (por ejemplo, `RF-07`).
- Versionado semántico, con etiqueta por cada iteración cerrada.
- Verificación automática en cada envío: compilación, análisis estático y pruebas.

**Pruebas primero en el núcleo económico.** El desarrollo guiado por pruebas es **obligatorio** en
la lógica de liquidación, prorrateo, intereses e imputación de pagos. Es opcional en el resto del
sistema. La distinción es deliberada: se aplica donde un error tiene costo alto y donde la
independencia del dominio (Principio III) lo hace barato.

**Definición de terminado.** Un requerimiento está terminado únicamente cuando cumple las ocho
condiciones:

1. Código integrado a la rama principal y revisado por el otro integrante.
2. Pruebas automatizadas correspondientes en verde, y verificación automática del repositorio en
   verde.
3. Autorización por rol y por consorcio verificada (RNF-03, RN-12).
4. Opera correctamente en teléfono (RNF-01).
5. Mensajes de error comprensibles para el usuario final (RNF-10).
6. Desplegado en el entorno de demostración y accesible.
7. Si modifica datos económicos, registra en la bitácora de auditoría (RN-15).
8. Documentación asociada actualizada.

La condición 3 es explícita y no se da por supuesta: verificar el aislamiento en cada
requerimiento, y no en una revisión final, es la forma de cumplir el Principio I.

**Deuda técnica.** Se reserva el 10 % de la capacidad de cada iteración para refactorización.

**Trazabilidad.** Los códigos `RF-nn`, `RNF-nn`, `RN-nn`, `RT-nn` y `CU-nn` son el vínculo entre
la documentación y el código. Toda especificación, rama y confirmación que implemente un
requerimiento lo referencia por su código.

## Governance

**Jerarquía.** Esta constitución está subordinada a `docs/requisitos-catedra.md` y a los
documentos de las entregas, que son la fuente de verdad del proyecto. Está por encima de cualquier
otra práctica, preferencia de estilo o decisión de conveniencia adoptada durante la construcción.
Un principio no se incumple por apuro de calendario: si el plazo aprieta, se recorta alcance,
según lo ya decidido en el punto 8.5.

**Enmiendas.** Requieren acuerdo explícito de los dos integrantes, quedan registradas en el
historial del repositorio y se acompañan de la actualización del documento de `docs/` del que el
principio deriva. Una enmienda que contradiga la documentación de las entregas exige modificar
primero esa documentación.

**Versionado.** Semántico sobre esta constitución:

- **MAJOR:** se remueve o se redefine un principio de manera incompatible con lo anterior.
- **MINOR:** se agrega un principio o una sección, o se expande materialmente una guía existente.
- **PATCH:** aclaraciones, redacción, correcciones sin efecto semántico.

**Cumplimiento.** Toda revisión de código verifica las ocho condiciones de la definición de
terminado. Los cinco principios se revisan como compuertas al planificar cada funcionalidad
(sección *Constitution Check* de `plan-template.md`) y al cerrar cada iteración. Toda complejidad
que se aparte de un principio debe justificarse por escrito en el plan de la funcionalidad; si no
puede justificarse, no se implementa.

**Guía de ejecución.** `CLAUDE.md` en la raíz del repositorio provee la orientación operativa
diaria para agentes de codificación y deriva de este documento.

**Version**: 1.0.0 | **Ratified**: 2026-09-08 | **Last Amended**: 2026-09-08
