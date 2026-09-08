# 5. Análisis de factibilidad

> **Requisito de la cátedra (2° Entrega, punto 5):** *"Análisis de factibilidad: factibilidad
> operacional, factibilidad técnica, factibilidad legal, factibilidad económico-financiera (para la
> empresa donde se implementará el sistema). Elección de una alternativa – Justificación."*

---

## 5.0 Convenciones de la evaluación

| Parámetro | Valor adoptado |
|---|---|
| Moneda | Pesos argentinos, en moneda constante de **marzo de 2026** |
| Tipo de cambio de referencia | USD 1 = $ 1.450 |
| Horizonte de evaluación | 3 años |
| Tasa de descuento real | 12 % anual |
| Costo laboral horario cargado, personal administrativo de Grupo Delta | $ 9.000 |
| Honorarios de administración | 8 % sobre la masa liquidada |
| Fuente de los valores profesionales | Tabla de honorarios del Consejo Profesional de Ciencias Informáticas de la Provincia de Santa Fe, valores de referencia orientativos |

Todos los valores de partida provienen de la cuantificación del punto 2.7 y del relevamiento del
punto 1.

---

## 5.1 Factibilidad operacional

Responde si la organización puede y quiere operar el sistema, y si el sistema resuelve efectivamente
el problema planteado.

### 5.1.1 Capacidad de los usuarios

| Grupo de usuarios | Cantidad | Perfil tecnológico | Evaluación |
|---|---|---|---|
| Socio gerente | 1 | Usuario habitual de planilla de cálculo, correo y banca electrónica | Sin barrera |
| Área Contable y Liquidaciones | 1 | Usuaria avanzada de planillas de cálculo; es quien hoy ejecuta el proceso manual | Sin barrera. Es la usuaria de mayor impacto y la que más gana |
| Área Administrativa | 2 | Uso cotidiano de correo, mensajería y ofimática | Sin barrera |
| Área de Mantenimiento | 1 | Uso principalmente móvil | Requiere que las pantallas operativas funcionen bien en teléfono, cubierto por RNF-01 |
| Propietarios e inquilinos | 418 unidades | Heterogéneo. Incluye adultos mayores con uso limitado de tecnología | **Barrera real y parcial.** Es el riesgo de adopción principal |

La barrera del último grupo se trata sin negarla: el sistema **no elimina los canales tradicionales**.
La liquidación se sigue pudiendo imprimir para cartelera y enviar por correo electrónico, y el
reclamo telefónico se sigue recibiendo, cargándolo la administrativa en el sistema en nombre del
vecino. La adopción digital es la meta —OBJ-5, 70 % de las unidades— pero no es condición para que el
sistema funcione. Esto es lo que hace operacionalmente factible al proyecto: **el beneficio principal
(ahorro de horas y trazabilidad) se obtiene aunque ningún consorcista se registre**, porque depende
de que la administradora digitalice su proceso interno, no de que el vecino adopte la aplicación.

### 5.1.2 Impacto sobre los procesos y las personas

| Proceso | Cambio | Resistencia esperada | Tratamiento |
|---|---|---|---|
| Liquidación de expensas | Se reemplaza la planilla por el sistema | **Media-alta.** La responsable domina su planilla y desconfía de perder control sobre el cálculo | Ejecución en paralelo durante dos períodos, comparando resultados hasta que coincidan al centavo |
| Carga de gastos | Se digitaliza el comprobante al recibirlo, no al cierre | Baja | Es menos trabajo que hoy |
| Gestión de reclamos | Todo reclamo queda registrado con responsable y plazo | **Media.** Hace visible el trabajo pendiente y los tiempos de respuesta | Presentarlo como herramienta de descarga —evita reiteraciones— y no como control de desempeño |
| Rendición a copropietarios | Pasa de reactiva a permanente y autogestionada | Baja en la administración, positiva en los consorcios | Comunicar como diferencial en las asambleas |
| Reservas de espacios comunes | Pasan del cuaderno de portería al sistema | Baja | Se mantiene la carga por parte del encargado para quien no use la aplicación |

La resistencia identificada como media-alta en la liquidación es el punto operativo crítico: es el
proceso más delicado y depende de una única persona (D5 del FODA). La estrategia de operación en
paralelo tiene costo —duplica el trabajo durante dos meses— pero es la única forma de construir
confianza sobre un cálculo que involucra dinero de terceros.

### 5.1.3 Estructura de soporte

No se requiere personal técnico en la organización. El soporte durante los primeros tres meses queda
a cargo del equipo de desarrollo, con la modalidad definida en el punto 6. La operación posterior no
exige administración de infraestructura en la alternativa A; en la alternativa B, sí.

### 5.1.4 Conclusión

**El proyecto es operacionalmente factible.** El sistema es utilizable por el personal actual sin
incorporación de perfiles nuevos, resuelve las cinco causas identificadas en el punto 2 dentro del
alcance declarado en 2.6, y su beneficio principal no está condicionado a la adopción por parte de
los consorcistas. Las dos condiciones de éxito son la operación en paralelo de la liquidación durante
la transición y la capacitación prevista en el punto 17.

---

## 5.2 Factibilidad técnica

### 5.2.1 Disponibilidad de la tecnología

Ambas alternativas del punto 4 se apoyan en tecnologías maduras, con documentación abierta,
comunidades activas y versiones estables de larga vida. Ninguna depende de un producto experimental
ni de una única implementación posible.

| Componente requerido | Disponibilidad | Riesgo técnico |
|---|---|---|
| Entorno de ejecución web con renderizado en servidor | Amplia, con varias implementaciones equivalentes | Bajo |
| Motor de base de datos relacional | Amplia, con opciones administradas y autoalojadas | Bajo |
| Índice vectorial para búsqueda semántica sobre documentos | Disponible como extensión estándar del motor relacional elegido | **Medio.** Es la pieza menos habitual del conjunto y la que el equipo menos conoce |
| Almacenamiento de objetos para comprobantes | Amplia | Bajo |
| Servicio de envío de correo transaccional | Amplia, con capas gratuitas | Bajo |
| Servicios de extracción documental y clasificación de texto | Amplia, con varios proveedores intercambiables | **Medio.** Depende de terceros; mitigado por RNF-14 y RNF-15 |
| Generación de documentos descargables por unidad | Amplia | Bajo |

### 5.2.2 Capacidad del equipo

| Competencia | Nivel actual | Brecha | Plan |
|---|---|---|---|
| Desarrollo web con componentes y tipado estático | Avanzado | Ninguna | — |
| Modelado y consulta relacional | Avanzado | Ninguna | — |
| Mapeadores objeto-relacional y migraciones | Intermedio | Menor | Se cubre en la iteración 1 |
| Despliegue en plataforma gestionada | Intermedio | Menor | Se cubre en el diseño de arquitectura |
| Administración de servidores y endurecimiento | **Básico** | **Significativa, solo para la alternativa B** | Requeriría formación específica y dedicación permanente |
| Búsqueda semántica e índices vectoriales | **Básico** | **Significativa** | Prueba de concepto anticipada, prevista en el punto 11 |
| Consumo de servicios de extracción y clasificación | Básico-intermedio | Moderada | Prueba de concepto sobre comprobantes reales antes de comprometer la funcionalidad |

La brecha en administración de servidores es determinante: existe únicamente en la alternativa B y es
permanente, no se cierra una vez. La brecha en búsqueda semántica existe en ambas alternativas por
igual y se mitiga con pruebas de concepto tempranas.

### 5.2.3 Requerimientos técnicos de la organización

| Requisito | Situación actual en Grupo Delta | ¿Requiere inversión? |
|---|---|---|
| Equipos con navegador actualizado | 4 computadoras y 3 teléfonos con navegador vigente | No |
| Conexión a internet | Fibra óptica de 300 Mb en la oficina | No |
| Escáner o cámara para digitalizar comprobantes | Impresora multifunción con escáner; los teléfonos del personal | No |
| Servidor propio | No posee | No lo necesita en la alternativa A |
| Personal técnico | No posee | No lo necesita en la alternativa A |

### 5.2.4 Verificación de los requerimientos no funcionales críticos

| Requerimiento | ¿Alcanzable? | Fundamento |
|---|---|---|
| RNF-07: liquidar 100 unidades en menos de 30 segundos | Sí | El prorrateo es aritmética simple sobre 100 filas; el costo real está en generar los documentos, resoluble en proceso diferido |
| RNF-08: disponibilidad del 99 % | Sí en A, alcanzable con esfuerzo en B | La plataforma gestionada ofrece acuerdos de nivel de servicio superiores; en B depende de la operación del propio equipo |
| RNF-06: respuesta bajo 2 segundos en el 95 % de las consultas | Sí | Volumen de datos reducido —del orden de 10⁴ a 10⁵ registros anuales— con índices adecuados |
| RNF-14: degradación ante falla de servicios externos | Sí | Exige que ninguna función crítica dependa exclusivamente de un servicio de terceros; condiciona el diseño del punto 12 |

### 5.2.5 Conclusión

**El proyecto es técnicamente factible en ambas alternativas.** Ninguna tecnología requerida es
inaccesible ni experimental, el volumen de datos está muy por debajo de cualquier límite técnico, y
el equipo cubre las competencias centrales. Las dos brechas identificadas se resuelven de manera
distinta: la de búsqueda semántica con pruebas de concepto anticipadas, y la de administración de
infraestructura solo evitándola, lo que constituye un argumento técnico a favor de la alternativa A.

---

## 5.3 Factibilidad legal

### 5.3.1 Marco normativo aplicable a la actividad administrada

| Norma | Contenido relevante | Impacto sobre el sistema |
|---|---|---|
| **Ley 26.994 — Código Civil y Comercial de la Nación**, arts. 2037 a 2072 | Régimen de propiedad horizontal: unidades funcionales, expensas comunes y extraordinarias, obligaciones del administrador, asambleas y consejo de propietarios | El modelo de datos debe reflejar la unidad funcional como sujeto de la obligación de pago y su coeficiente como base del prorrateo. El certificado de deuda debe poder emitirse con el detalle que exige la ejecución de expensas |
| **CCyC art. 2067** | Obligaciones del administrador: rendir cuentas documentada, llevar libros, conservar documentación | Fundamenta RF-05 y RF-10: el respaldo documental de cada gasto debe ser conservable y exhibible |
| **Ley 27.551 y modificatorias** | Régimen de locaciones urbanas: distingue expensas ordinarias, a cargo del inquilino, de extraordinarias, a cargo del propietario | El sistema debe **clasificar cada gasto como ordinario o extraordinario** y exponer a cada usuario lo que le corresponde según su rol en la unidad. Es un requisito legal con impacto directo en el diseño |
| **Ordenanza Municipal de Rosario N.º 9679 y modificatorias** | Registro Público de Administradores; obligaciones de información y rendición hacia los copropietarios | Fundamenta el módulo de rendición y el acceso del consorcista a comprobantes y liquidaciones |
| **Ley 11.723** | Propiedad intelectual | Rige la titularidad del código fuente y de la documentación; se instrumenta en el contrato del punto 6 |

### 5.3.2 Protección de datos personales

El sistema trata datos personales de propietarios e inquilinos: nombre, documento, domicilio,
teléfono, correo electrónico y **situación de deuda**. Este último es el más sensible del conjunto,
porque su difusión indebida puede afectar la reputación crediticia de una persona.

| Obligación de la Ley 25.326 | Cómo se cumple |
|---|---|
| Licitud y finalidad determinada del tratamiento | Los datos se recogen para administrar el consorcio y no se utilizan para otro fin ni se ceden |
| Consentimiento informado | Aviso de privacidad aceptado en el alta de cada usuario |
| Calidad del dato: exacto, actualizado y pertinente | Rectificación autogestionada por el titular sobre sus datos de contacto |
| Derecho de acceso, rectificación y supresión | Función de exportación de los datos propios y procedimiento de baja documentado |
| Medidas de seguridad y confidencialidad | Tratadas en el punto 12 y en el punto 18 |
| Registro de la base de datos ante la autoridad de aplicación | Obligación de Grupo Delta como responsable del tratamiento; se la asiste en el trámite |
| Cesión y tratamiento por terceros | Ver el apartado siguiente |

**Sobre el listado de morosos.** El punto 1 registra que hoy circula informalmente y el proyecto
original de 2019 lo incluía como funcionalidad abierta a los consorcistas. Se corrige ese criterio:
la nómina nominada de deudores **solo es accesible al administrador y al consejo de propietarios en
ejercicio de sus funciones**. Al conjunto de los consorcistas se les expone el dato agregado —monto
total adeudado al consorcio y cantidad de unidades en mora— sin identificación de personas. Difundir
la nómina en cartelera o en la aplicación constituiría un tratamiento con finalidad sancionatoria no
consentido.

### 5.3.3 Tratamiento por parte de servicios de terceros

Tres componentes de la solución implican que datos del consorcio se procesen fuera de la
infraestructura de Grupo Delta: el proveedor de la plataforma de despliegue y base de datos, el
servicio de correo transaccional y los servicios de inteligencia artificial. La ley admite esta
tercerización bajo condiciones, que se instrumentan así:

| Medida | Aplicación concreta |
|---|---|
| Encargado del tratamiento identificado y obligado por contrato | Se contratan proveedores cuyos términos incluyan cláusulas de tratamiento por cuenta del responsable, con prohibición de uso para fines propios |
| Minimización de datos | A los servicios de inteligencia artificial se envía **el comprobante o el texto del reclamo, no la nómina de propietarios ni datos de deuda**. La documentación indexada para consulta es el reglamento y las actas, no los datos personales de los consorcistas |
| Trazabilidad | Cada invocación a un servicio externo queda registrada, con qué se envió y cuándo |
| Reversibilidad | La función asistida puede desactivarse por consorcio, volviendo el proceso a su forma manual sin pérdida de funcionalidad —RNF-14 |
| Transparencia | El aviso de privacidad informa expresamente que existen servicios de procesamiento de terceros y con qué finalidad |
| No decisión automatizada | Ninguna función asistida decide por sí sola: la extracción de comprobantes exige confirmación humana y la clasificación de reclamos es una sugerencia modificable. No se configura el supuesto de decisión individual automatizada |

Este último punto es central y condiciona el diseño: se decidió deliberadamente que **ninguna salida
de un servicio automático impacte en un dato económico sin validación de una persona**. Sostiene a la
vez el cumplimiento legal y la confianza del cliente en el sistema.

### 5.3.4 Licenciamiento del software utilizado

Todas las bibliotecas y herramientas previstas se distribuyen bajo licencias permisivas de código
abierto que admiten uso comercial. Se llevará un inventario de dependencias con su licencia,
verificado antes de cada entrega, para descartar componentes con licencias recíprocas fuertes que
obliguen a liberar el código del sistema.

### 5.3.5 Conclusión

**El proyecto es legalmente factible.** No existe impedimento normativo para su desarrollo ni para su
explotación comercial. Se identificaron tres exigencias que condicionan el diseño y que se
incorporaron como requisitos: la distinción entre expensas ordinarias y extraordinarias, la
restricción de acceso a la nómina de morosos, y la validación humana obligatoria de toda salida
automática con efecto económico.

---

## 5.4 Factibilidad económico-financiera para Grupo Delta

Se evalúa desde la perspectiva de **la organización donde se implementará el sistema**, tal como
exige la consigna. La evaluación del negocio para el equipo desarrollador corresponde al punto 6.

### 5.4.1 Situación de partida

| Concepto | Valor mensual | Valor anual |
|---|---:|---:|
| Masa de expensas administrada | $ 138.000.000 | $ 1.656.000.000 |
| Honorarios de administración, 8 % | $ 11.040.000 | $ 132.480.000 |
| Unidades funcionales | 418 | |
| Honorario promedio por unidad | $ 26.411 | $ 316.932 |

### 5.4.2 Costos para Grupo Delta

| Concepto | Momento | Importe |
|---|---|---:|
| Implementación inicial: parametrización, migración de datos de los 11 consorcios y capacitación | Año 0 | $ 4.850.000 |
| Horas internas dedicadas a la migración y validación, 40 h a $ 9.000 | Año 0 | $ 360.000 |
| **Total inversión inicial** | | **$ 5.210.000** |
| Abono mensual del servicio, según el esquema del punto 6 | Años 1 a 3 | $ 848.400 |
| **Costo operativo anual** | | **$ 10.180.800** |
| Abono adicional por unidades incorporadas, $ 1.800 por unidad | Desde el año 2 | Según crecimiento |

El abono incluye alojamiento, respaldos, actualizaciones y soporte. Grupo Delta no incurre en costos
de infraestructura ni de personal técnico.

### 5.4.3 Beneficios cuantificados

**B1 — Ahorro de horas administrativas.** Es el beneficio más directo y el mejor documentado, medido
sobre la línea de base del punto 2.7.

| Actividad | Horas mensuales actuales | Horas mensuales estimadas con el sistema | Ahorro |
|---|---:|---:|---:|
| Liquidación de expensas de los 11 consorcios | 38,0 | 10,0 | 28,0 |
| Atención de reclamos reiterados | 20,0 | 8,0 | 12,0 |
| Búsqueda de comprobantes en el archivo | 8,0 | 0,5 | 7,5 |
| **Total** | **66,0** | **18,5** | **47,5 h/mes** |

Valorizado a $ 9.000 la hora cargada: **$ 427.500 mensuales, $ 5.130.000 anuales**.

**B2 — Menor tiempo de gestión de cobranza.** Al disponer del estado de deuda actualizado por unidad
en lugar de reconstruirlo cada mes, se estiman 10 horas mensuales menos: **$ 1.080.000 anuales**.

**B3 — Reducción de honorarios incobrables.** La incobrabilidad definitiva sobre la masa liquidada se
estima en 1,5 % y se proyecta llevarla a 0,8 % mediante la detección temprana de la mora, que es lo
que habilita OBJ-4.1. Sobre $ 138.000.000 mensuales, 0,7 puntos porcentuales representan $ 966.000 de
expensas recuperadas por mes; el 8 % correspondiente a honorarios equivale a **$ 927.360 anuales**.

**B4 — Crecimiento sin ampliar la planta.** Las 47,5 horas mensuales liberadas por B1 equivalen a
aproximadamente el 30 % de una jornada completa, capacidad suficiente para administrar unas 100
unidades funcionales adicionales sin contratar personal. A un honorario de $ 26.411 por unidad, cien
unidades representan $ 31.693.200 anuales de honorarios adicionales. **Se computa solo el 50 % de ese
valor**, atribuyendo el resto a la gestión comercial, que es condición necesaria y ajena al sistema:
**$ 14.750.000 anuales a partir del año 2**, con un segundo tramo equivalente en el año 3.

### 5.4.4 Beneficios no cuantificados

Se enuncian pero **no se incorporan al flujo**, para no inflar la evaluación:

- Retención de consorcios en las renovaciones. Perder un consorcio promedio de 38 unidades cuesta
  $ 12.043.416 anuales de honorarios; el sistema reduce esa probabilidad pero no la elimina, y la
  atribución sería arbitraria.
- Reducción del riesgo de sanciones por incumplimientos formales de rendición.
- Eliminación de la dependencia de una única persona para la liquidación, que es un riesgo operativo
  con impacto potencial alto y probabilidad conocida.
- Mejora de la posición competitiva frente a administradoras que ya ofrecen aplicación.

### 5.4.5 Flujo de fondos incremental

Valores en miles de pesos constantes de marzo de 2026.

| Concepto | Año 0 | Año 1 | Año 2 | Año 3 |
|---|---:|---:|---:|---:|
| B1 Ahorro de horas administrativas | — | 5.130 | 5.130 | 5.130 |
| B2 Menor gestión de cobranza | — | 1.080 | 1.080 | 1.080 |
| B3 Reducción de incobrables | — | 927 | 927 | 927 |
| B4 Honorarios por crecimiento | — | — | 14.750 | 29.500 |
| **Total beneficios** | — | **7.137** | **21.887** | **36.637** |
| Inversión inicial | (5.210) | — | — | — |
| Abono del servicio | — | (10.181) | (10.181) | (10.181) |
| Abono adicional por crecimiento | — | — | (2.160) | (4.320) |
| **Total costos** | **(5.210)** | **(10.181)** | **(12.341)** | **(14.501)** |
| **Flujo neto** | **(5.210)** | **(3.044)** | **9.546** | **22.136** |
| Flujo descontado al 12 % | (5.210) | (2.718) | 7.610 | 15.756 |
| **Flujo acumulado sin descontar** | (5.210) | (8.254) | 1.292 | 23.428 |

### 5.4.6 Indicadores de rentabilidad

| Indicador | Valor | Lectura |
|---|---|---|
| **Valor Actual Neto (12 %)** | **$ 15.438.000** | Positivo: el proyecto crea valor para Grupo Delta |
| **Tasa Interna de Retorno** | **≈ 78 % anual** | Muy superior al costo de oportunidad del 12 % |
| **Período de recupero** | **22 meses** | Se recupera la inversión promediando el segundo año |
| **Relación beneficio-costo descontada** | 1,45 | Cada peso invertido retorna 1,45 |

**El año 1 es deficitario en $ 3.044.000.** Es un resultado esperable y no un error de estimación: la
inversión inicial y el abono se pagan desde el mes uno, mientras que el beneficio principal —el
crecimiento de la cartera— solo se materializa cuando la capacidad liberada se traduce en consorcios
nuevos, lo que requiere un ciclo comercial completo. Grupo Delta debe estar en condiciones de
financiar ese primer año, lo cual es viable frente a honorarios anuales de $ 132.480.000: el flujo
negativo representa el 2,3 % de su facturación.

### 5.4.7 Análisis de sensibilidad

Se evalúan escenarios sobre las dos variables de mayor incertidumbre: el ahorro de horas y la
capacidad efectiva de convertir esa capacidad en cartera nueva.

| Escenario | Supuesto | VAN | TIR | Recupero |
|---|---|---:|---:|---:|
| **Optimista** | Ahorro de horas 20 % superior; el crecimiento se atribuye al 70 % | $ 27.900.000 | 118 % | 17 meses |
| **Base** | Los supuestos de 5.4.3 | $ 15.438.000 | 78 % | 22 meses |
| **Pesimista** | Ahorro de horas 30 % inferior; el crecimiento se atribuye al 30 % | $ 2.190.000 | 20 % | 33 meses |
| **Crítico** | Se elimina íntegramente B4: la capacidad liberada no se convierte en cartera nueva | **($ 12.180.000)** | Negativa | No se recupera |

El escenario crítico es el hallazgo relevante de esta evaluación y conviene enunciarlo sin rodeos:
**si Grupo Delta no aprovecha comercialmente la capacidad que el sistema libera, el proyecto no se
justifica económicamente por sí solo.** Los ahorros de horas, por sí mismos —$ 7.137.000 anuales— no
cubren el abono de $ 10.181.000. La conclusión práctica es que la implantación debe ir acompañada de
una decisión comercial de captación de consorcios; el sistema es condición necesaria y no suficiente.
Este hallazgo se traslada al punto 11 como riesgo de negocio y al punto 6 como argumento para el
esquema de precios adoptado.

### 5.4.8 Conclusión

**El proyecto es económicamente factible en el escenario base y en el pesimista, con un valor actual
neto positivo y un período de recupero de 22 meses.** La factibilidad está condicionada a que la
organización convierta la capacidad liberada en cartera nueva, condición explicitada ante el cliente
y monitoreable con los propios indicadores del sistema.

---

## 5.5 Elección de la alternativa y justificación

### 5.5.1 Resultado de las cuatro factibilidades

| Factibilidad | Alternativa A | Alternativa B |
|---|---|---|
| Operacional | Factible | Factible: no hay diferencia para el usuario |
| Técnica | Factible sin brechas críticas | Factible **con una brecha permanente**: administración de infraestructura |
| Legal | Factible, con la salvedad de que los datos se alojan en la nube del proveedor | Factible, con mayor control sobre la localización de los datos |
| Económico-financiera | VAN $ 15.438.000, recupero 22 meses | VAN inferior: mayor costo operativo y mayor esfuerzo de construcción |

### 5.5.2 Decisión

> **Se adopta la Alternativa A: aplicación web integrada sobre plataforma en la nube gestionada.**

### 5.5.3 Justificación

**1. Es la única alternativa que no exige una capacidad que el equipo no tiene ni el cliente puede
proveer.** Grupo Delta no tiene área de sistemas —hallazgo del punto 1.3— y el equipo de desarrollo
tiene nivel básico en administración de servidores. La alternativa B introduce una obligación
operativa permanente de 6 a 8 horas mensuales que nadie está en condiciones de asumir de manera
sostenida. No es una diferencia de preferencia técnica: es una restricción estructural.

**2. El costo de infraestructura arranca en cero y crece con el uso.** Para una administradora de
esta escala y para un proyecto académico sin presupuesto, que el sistema pueda permanecer publicado
sin costo mientras el volumen sea el actual es determinante. La alternativa B exige un desembolso
mensual desde el primer día, antes de que exista siquiera una funcionalidad utilizable.

**3. Reduce el esfuerzo de construcción, que es el recurso más escaso del proyecto.** Con 24 horas
semanales de capacidad conjunta y fechas de cátedra improrrogables, evitar la duplicación entre
contrato de interfaz, implementación en el servidor y consumo en el cliente libera horas que se
destinan a las funcionalidades que generan el valor —liquidación, indicadores, funciones asistidas—
en lugar de a plomería de integración.

**4. Su desventaja principal es real pero acotada y mitigable.** La alternativa A cede control sobre
el entorno y sobre la localización de los datos. El análisis de sensibilidad del punto 4.4.3 muestra
que esa desventaja solo invertiría la decisión ante una exigencia normativa de radicación local, que
no existe para este dominio. Se mitiga eligiendo la región de alojamiento más próxima disponible,
contratando cláusulas de tratamiento por cuenta del responsable y manteniendo copias de respaldo
exportables que permitan migrar si la condición cambia.

**5. Favorece la continuidad del sistema después de la instancia académica.** El costo cero en la
capa gratuita permite que el prototipo siga publicado y en uso, condición que no se cumple si el
sistema depende de un servidor que alguien debe seguir pagando y administrando.

### 5.5.4 Condiciones que acompañan la decisión

La adopción de la alternativa A queda sujeta a tres condiciones, verificables durante la construcción:

| Condición | Verificación | Punto donde se trata |
|---|---|---|
| Ninguna función crítica del negocio puede depender exclusivamente de un servicio de terceros | Prueba de degradación por cada servicio externo | 12 y 15 |
| Los datos deben poder exportarse íntegramente en formato abierto en cualquier momento | Procedimiento de exportación probado antes de la puesta en marcha | 12 y 18 |
| La brecha en búsqueda semántica debe resolverse con prueba de concepto antes de comprometer RF-20 | Prueba de concepto sobre un reglamento de copropiedad real | 11 |

---

## Referencias

- Congreso de la Nación Argentina. (2000). *Ley N.º 25.326 de Protección de los Datos Personales*.
- Congreso de la Nación Argentina. (2001). *Ley N.º 25.506 de Firma Digital*.
- Congreso de la Nación Argentina. (2014). *Ley N.º 26.994. Código Civil y Comercial de la Nación*.
- Congreso de la Nación Argentina. (2020). *Ley N.º 27.551 de Alquileres*, y sus modificatorias.
- Municipalidad de Rosario. (2017). *Ordenanza N.º 9679 y sus modificatorias*.
- Sapag Chain, N., & Sapag Chain, R. (2014). *Preparación y evaluación de proyectos* (6.ª ed.).
  McGraw-Hill.
- Sommerville, I. (2016). *Software Engineering* (10.ª ed.). Pearson.
