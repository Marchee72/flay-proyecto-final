# 9. Cálculo del tamaño del sistema

> **Requisito de la cátedra (3° Entrega, punto 9):** *"Cálculo del tamaño del sistema."*

---

## 9.1 Método adoptado

Se aplica **Análisis de Puntos de Función** según el método IFPUG. Los fundamentos de la elección:

- Mide el tamaño desde la **funcionalidad entregada al usuario**, de manera independiente de la
  tecnología. Es el único método aplicable en esta etapa, cuando todavía no existe código.
- Se apoya en el modelo de datos del punto 7 y en los requerimientos del punto 4, ya elaborados.
- Permite recalcular el tamaño cuando el alcance cambia, que es lo que este documento necesita hacer.

El conteo es de tipo **proyecto de desarrollo**, sobre la totalidad de la funcionalidad a construir.

### Componentes y pesos

| Componente | Sigla | Descripción | Bajo | Medio | Alto |
|---|---|---|---:|---:|---:|
| Archivo lógico interno | ILF | Grupo lógico de datos mantenido dentro de la aplicación | 7 | 10 | 15 |
| Archivo de interfaz externa | EIF | Grupo lógico de datos referenciado pero mantenido por otra aplicación | 5 | 7 | 10 |
| Entrada externa | EI | Proceso que mantiene un archivo lógico interno | 3 | 4 | 6 |
| Salida externa | EO | Proceso que presenta información **con lógica de derivación** | 4 | 5 | 7 |
| Consulta externa | EQ | Proceso que recupera información **sin lógica de derivación** | 3 | 4 | 6 |

La complejidad de cada componente se determina cruzando la cantidad de tipos de registro (RET) y
tipos de dato elementales (DET) para los archivos, y la cantidad de archivos referenciados (FTR) y
DET para las transacciones, según las tablas estándar del método.

---

## 9.2 Conteo de archivos lógicos internos (ILF)

| # | Archivo lógico | Entidades que agrupa | RET | DET | Complejidad | PF |
|---:|---|---|---:|---:|---|---:|
| 1 | Estructura del consorcio | Consorcio, Unidad, CoeficienteHistorico | 3 | 28 | Media | 10 |
| 2 | Personas y accesos | Persona, Usuario, Ocupacion, Habilitacion | 4 | 35 | Media | 10 |
| 3 | Gastos | Gasto, Comprobante | 2 | 24 | Media | 10 |
| 4 | Rubros de gasto | RubroGasto | 1 | 5 | Baja | 7 |
| 5 | Proveedores | Proveedor | 1 | 9 | Baja | 7 |
| 6 | Liquidaciones | Periodo, Liquidacion, DetalleLiquidacion | 3 | 32 | Media | 10 |
| 7 | Cobranzas | Pago, PagoImputacion | 2 | 12 | Baja | 7 |
| 8 | Reclamos | Reclamo, ReclamoHistorial | 2 | 24 | Media | 10 |
| 9 | Espacios y reservas | EspacioComun, Reserva | 2 | 22 | Media | 10 |
| 10 | Novedades | Novedad | 1 | 8 | Baja | 7 |
| 11 | Documentación del consorcio | DocumentoConsorcio, FragmentoDocumento | 2 | 15 | Baja | 7 |
| 12 | Notificaciones | Notificacion | 1 | 11 | Baja | 7 |
| 13 | Auditoría | Auditoria | 1 | 10 | Baja | 7 |
| 14 | Asistencia automática | ExtraccionComprobante, SugerenciaReclamo, ConsultaDocumental | 3 | 30 | Media | 10 |
| | | | | | **Subtotal ILF** | **119** |

## 9.3 Conteo de archivos de interfaz externa (EIF)

**Subtotal EIF: 0 puntos de función.**

El sistema no lee ningún grupo lógico de datos mantenido por otra aplicación. Los servicios externos
que consume —correo transaccional, almacenamiento de objetos y servicios de procesamiento
automático— son servicios de proceso, no archivos de datos: no se recupera de ellos información
persistente que otra aplicación mantenga. Contabilizarlos como EIF sería un error de aplicación del
método.

## 9.4 Conteo de entradas externas (EI)

| # | Entrada externa | FTR | DET | Compl. | PF |
|---:|---|---:|---:|---|---:|
| 1 | Alta de consorcio | 2 | 12 | Media | 4 |
| 2 | Modificación de consorcio | 2 | 12 | Media | 4 |
| 3 | Baja lógica de consorcio | 1 | 3 | Baja | 3 |
| 4 | Alta de unidad funcional | 2 | 9 | Media | 4 |
| 5 | Modificación de unidad funcional | 2 | 9 | Media | 4 |
| 6 | Baja lógica de unidad | 1 | 3 | Baja | 3 |
| 7 | Carga masiva de unidades y coeficientes | 3 | 10 | Alta | 6 |
| 8 | Alta o modificación de coeficiente con validación del 100 % | 2 | 6 | Media | 4 |
| 9 | Alta de persona | 1 | 8 | Baja | 3 |
| 10 | Modificación de persona | 1 | 8 | Baja | 3 |
| 11 | Alta de ocupación con verificación de solapamiento | 3 | 8 | Alta | 6 |
| 12 | Baja de ocupación | 2 | 4 | Media | 4 |
| 13 | Alta de usuario e invitación por correo | 3 | 9 | Alta | 6 |
| 14 | Alta o modificación de habilitación por consorcio | 2 | 6 | Media | 4 |
| 15 | Baja de usuario | 1 | 3 | Baja | 3 |
| 16 | Inicio de sesión con control de intentos | 1 | 4 | Baja | 3 |
| 17 | Cambio de contraseña | 1 | 4 | Baja | 3 |
| 18 | Restablecimiento de contraseña por correo | 2 | 5 | Media | 4 |
| 19 | Alta de rubro de gasto | 1 | 5 | Baja | 3 |
| 20 | Modificación de rubro de gasto | 1 | 5 | Baja | 3 |
| 21 | Alta de proveedor | 1 | 9 | Baja | 3 |
| 22 | Modificación de proveedor | 1 | 9 | Baja | 3 |
| 23 | Baja lógica de proveedor | 1 | 3 | Baja | 3 |
| 24 | Alta de gasto | 4 | 14 | Alta | 6 |
| 25 | Modificación de gasto con control de período liquidado | 4 | 14 | Alta | 6 |
| 26 | Baja de gasto | 2 | 5 | Media | 4 |
| 27 | Subida de comprobante con validación y huella | 2 | 8 | Media | 4 |
| 28 | Confirmación o corrección de la extracción asistida | 4 | 14 | Alta | 6 |
| 29 | Apertura de período | 1 | 5 | Baja | 3 |
| 30 | Cierre de período | 2 | 5 | Media | 4 |
| 31 | Ejecución de la liquidación de expensas | 5 | 20 | Alta | 6 |
| 32 | Anulación de liquidación con emisión de rectificativa | 3 | 8 | Alta | 6 |
| 33 | Registro de pago con imputación automática | 3 | 12 | Alta | 6 |
| 34 | Anulación de pago | 2 | 5 | Media | 4 |
| 35 | Alta de reclamo | 3 | 11 | Alta | 6 |
| 36 | Cambio de estado de reclamo con registro en historial | 3 | 8 | Alta | 6 |
| 37 | Asignación de responsable y proveedor al reclamo | 2 | 6 | Media | 4 |
| 38 | Cierre de reclamo | 2 | 6 | Media | 4 |
| 39 | Alta de espacio común con sus reglas | 2 | 11 | Media | 4 |
| 40 | Modificación de espacio común | 2 | 11 | Media | 4 |
| 41 | Solicitud de reserva con validación de reglas | 3 | 10 | Alta | 6 |
| 42 | Confirmación o cancelación de reserva | 2 | 6 | Media | 4 |
| 43 | Alta de novedad | 1 | 7 | Baja | 3 |
| 44 | Modificación o baja de novedad | 1 | 7 | Baja | 3 |
| 45 | Carga de documento del consorcio con indexación | 2 | 9 | Media | 4 |
| 46 | Baja de documento del consorcio | 1 | 4 | Baja | 3 |
| 47 | Marcado de notificación como leída | 1 | 3 | Baja | 3 |
| 48 | Registro de consulta documental en lenguaje natural | 3 | 7 | Alta | 6 |
| | | | | **Subtotal EI** | **201** |

## 9.5 Conteo de salidas externas (EO)

Se clasifican como EO los procesos que aplican lógica de derivación: cálculo, agregación, comparación
contra un valor histórico o generación de un documento.

| # | Salida externa | FTR | DET | Compl. | PF |
|---:|---|---:|---:|---|---:|
| 1 | Documento descargable de liquidación por unidad | 5 | 22 | Alta | 7 |
| 2 | Resumen de liquidación del consorcio con control de cuadratura | 4 | 16 | Alta | 7 |
| 3 | Estado de cuenta de la unidad con saldo e intereses | 3 | 14 | Media | 5 |
| 4 | Certificado de deuda de la unidad | 3 | 12 | Media | 5 |
| 5 | Informe de morosidad por consorcio | 3 | 14 | Media | 5 |
| 6 | Informe nominado de morosidad por unidad | 3 | 12 | Media | 5 |
| 7 | Evolución mensual de la morosidad | 2 | 8 | Media | 5 |
| 8 | Gasto por rubro y período | 3 | 10 | Media | 5 |
| 9 | Detección de desvíos de gasto contra promedio móvil | 3 | 12 | Media | 5 |
| 10 | Ordenamiento de proveedores por costo y recurrencia | 3 | 11 | Media | 5 |
| 11 | Tiempo medio de resolución de reclamos | 2 | 9 | Media | 5 |
| 12 | Ocupación de espacios comunes | 2 | 8 | Media | 5 |
| 13 | Panel de indicadores consolidado | 6 | 20 | Alta | 7 |
| 14 | Aviso por correo de liquidación publicada | 3 | 10 | Media | 5 |
| 15 | Aviso por correo de cambio de estado de reclamo | 3 | 8 | Media | 5 |
| 16 | Aviso por correo de vencimiento próximo | 3 | 8 | Media | 5 |
| 17 | Respuesta a consulta documental con citas | 3 | 10 | Media | 5 |
| 18 | Informe de precisión de la asistencia automática | 3 | 10 | Media | 5 |
| 19 | Exportación completa de los datos del consorcio | 6 | 20 | Alta | 7 |
| | | | | **Subtotal EO** | **103** |

## 9.6 Conteo de consultas externas (EQ)

| # | Consulta externa | FTR | DET | Compl. | PF |
|---:|---|---:|---:|---|---:|
| 1 | Listado de consorcios | 1 | 8 | Baja | 3 |
| 2 | Consulta de un consorcio | 1 | 10 | Baja | 3 |
| 3 | Listado de unidades del consorcio | 2 | 9 | Media | 4 |
| 4 | Consulta de unidad con sus ocupantes | 3 | 12 | Alta | 6 |
| 5 | Listado de personas y usuarios | 2 | 10 | Media | 4 |
| 6 | Listado de gastos con filtros por período y rubro | 4 | 14 | Alta | 6 |
| 7 | Consulta de gasto con su comprobante | 3 | 12 | Alta | 6 |
| 8 | Descarga de comprobante | 2 | 5 | Baja | 3 |
| 9 | Listado de rubros | 1 | 5 | Baja | 3 |
| 10 | Listado de proveedores | 1 | 9 | Baja | 3 |
| 11 | Consulta de proveedor con histórico de trabajos | 3 | 11 | Alta | 6 |
| 12 | Listado de períodos y su estado | 2 | 7 | Media | 4 |
| 13 | Listado de liquidaciones del consorcio | 2 | 10 | Media | 4 |
| 14 | Descarga de la liquidación de la unidad | 2 | 6 | Media | 4 |
| 15 | Listado de pagos de una unidad | 2 | 9 | Media | 4 |
| 16 | Bandeja de reclamos con filtros | 3 | 13 | Alta | 6 |
| 17 | Consulta de reclamo con su historial | 3 | 12 | Alta | 6 |
| 18 | Agenda de reservas de un espacio común | 3 | 10 | Alta | 6 |
| 19 | Listado de reservas propias | 2 | 8 | Media | 4 |
| 20 | Listado de novedades del consorcio | 2 | 8 | Media | 4 |
| 21 | Listado de documentos del consorcio | 2 | 8 | Media | 4 |
| 22 | Descarga de documento | 2 | 5 | Baja | 3 |
| 23 | Listado de notificaciones del usuario | 1 | 8 | Baja | 3 |
| 24 | Consulta de la bitácora de auditoría | 2 | 11 | Media | 4 |
| | | | | **Subtotal EQ** | **103** |

## 9.7 Puntos de función sin ajustar

| Componente | Puntos de función |
|---|---:|
| Archivos lógicos internos (ILF) | 119 |
| Archivos de interfaz externa (EIF) | 0 |
| Entradas externas (EI) | 201 |
| Salidas externas (EO) | 103 |
| Consultas externas (EQ) | 103 |
| **Puntos de función sin ajustar (UFP)** | **526** |

Distribución: las entradas externas concentran el 38 % del tamaño, lo que es consistente con un
sistema de gestión administrativa cuyo trabajo principal es registrar y mantener información.

## 9.8 Factor de ajuste

Se evalúan las catorce características generales del sistema en una escala de 0 —sin influencia— a 5
—influencia fuerte y permanente—.

| # | Característica general | Grado | Fundamento |
|---:|---|:---:|---|
| 1 | Comunicación de datos | 4 | Aplicación web accedida desde múltiples ubicaciones y dispositivos |
| 2 | Procesamiento distribuido | 2 | Servicios externos de correo, almacenamiento y procesamiento automático |
| 3 | Rendimiento | 3 | RNF-06 y RNF-07 fijan tiempos de respuesta explícitos |
| 4 | Configuración fuertemente utilizada | 1 | Volumen reducido, sin restricciones de infraestructura |
| 5 | Tasa de transacciones | 2 | Carga concentrada en el cierre mensual, moderada el resto del mes |
| 6 | Entrada de datos en línea | 5 | La totalidad de las entradas son en línea |
| 7 | Eficiencia del usuario final | 4 | RNF-01, RNF-10 y RNF-11; usuarios no técnicos y heterogéneos |
| 8 | Actualización en línea | 5 | Todos los archivos lógicos se actualizan en línea, con control de concurrencia sobre liquidaciones |
| 9 | Procesamiento complejo | 4 | Prorrateo por coeficiente, intereses por mora, imputación de pagos, detección de desvíos y búsqueda semántica |
| 10 | Reusabilidad | 3 | El sistema se comercializa a múltiples administradoras sin modificaciones |
| 11 | Facilidad de instalación | 2 | Despliegue automatizado; la conversión de datos es el punto de esfuerzo |
| 12 | Facilidad de operación | 4 | Sin personal técnico en el cliente: respaldos, recuperación e inicio deben ser automáticos |
| 13 | Múltiples sitios | 3 | Instancia única multiempresa, con aislamiento por consorcio y por administradora |
| 14 | Facilidad de cambio | 4 | RNF-15 exige que el proveedor de servicios automáticos sea reemplazable; reglas de negocio parametrizables por consorcio |
| | **Total de grados de influencia (TDI)** | **46** | |

```
VAF = 0,65 + (0,01 × TDI) = 0,65 + (0,01 × 46) = 1,11
```

```
AFP = UFP × VAF = 526 × 1,11 = 583,86 ≈ 584 puntos de función ajustados
```

## 9.9 Conversión a esfuerzo

### 9.9.1 Verificación mediante COCOMO y motivo de su descarte

Se realizó la conversión a líneas de código para aplicar el modelo COCOMO como contraste. Tomando una
razón de 40 líneas por punto de función para lenguajes de alto nivel con tipado estático, el tamaño
resulta de aproximadamente 23,4 KLOC. Aplicando COCOMO básico en modo orgánico:

```
E = 2,4 × (23,4)^1,05 ≈ 66 personas-mes ≈ 10.000 horas
```

**El resultado se descarta por falta de calibración.** COCOMO fue calibrado sobre proyectos
industriales de los años ochenta y noventa, con procesos formales, documentación extensa,
equipos de decenas de personas y sin los entornos de desarrollo actuales, que resuelven de fábrica
enrutamiento, validación, acceso a datos, autenticación y componentes de interfaz. Aplicarlo aquí
sobreestima el esfuerzo en un orden de magnitud. Se lo documenta porque el contraste es parte del
análisis y porque descartar un método con fundamento es preferible a omitirlo.

### 9.9.2 Razón de productividad adoptada

Se adopta la conversión directa mediante razón de productividad, calibrada para el entorno
tecnológico elegido en el punto 5.5:

| Factor | Efecto sobre la productividad |
|---|---|
| El entorno provee enrutamiento, renderizado, manejo de formularios y validación | Reduce el esfuerzo de las entradas y consultas |
| El mapeador objeto-relacional genera acceso a datos y migraciones a partir del esquema | Reduce el esfuerzo asociado a los archivos lógicos |
| Biblioteca de componentes de interfaz preexistente | Reduce el esfuerzo de las consultas y salidas |
| Lenguaje único en cliente y servidor, con tipos compartidos | Elimina el esfuerzo de sincronizar contratos entre capas |
| Alrededor del 55 % de las entradas y consultas son mantenimiento estándar de datos | Alta proporción de trabajo repetitivo y previsible |
| Contrapeso: equipo con experiencia parcial en búsqueda semántica y servicios de procesamiento automático | Aumenta el esfuerzo de la iteración 3 |
| Contrapeso: la lógica de liquidación exige desarrollo guiado por pruebas, según el punto 8.3.3 | Aumenta el esfuerzo de la iteración 2 |

> **Razón adoptada: 1,6 horas por punto de función ajustado.**

Es una razón exigente comparada con las referencias generales de la industria, que ubican entre 2 y 8
horas por punto de función según el entorno. Se justifica por el peso del entorno tecnológico y por
la alta proporción de funcionalidad repetitiva, y se contrasta contra la capacidad real en el
apartado siguiente. La razón se recalibra al cierre de cada iteración con las horas efectivamente
insumidas, conforme al punto 8.3.2.

### 9.9.3 Esfuerzo del alcance completo

```
Esfuerzo = 584 PF × 1,6 h/PF = 934 horas
```

## 9.10 Contraste con la capacidad disponible

| Concepto | Valor |
|---|---:|
| Inicio del proyecto | 9 de marzo de 2026 |
| Límite de entrega del prototipo | 18 de diciembre de 2026 |
| Semanas disponibles | 41 |
| Capacidad semanal del equipo, 2 personas por 12 horas | 24 h |
| **Capacidad total** | **984 horas** |
| Esfuerzo del alcance completo | 934 horas |
| **Holgura** | **50 horas, equivalentes al 5 %** |

**Una holgura del 5 % es inaceptable** para un proyecto con dos brechas técnicas identificadas en el
punto 5.2.2, con fechas de entrega improrrogables y ejecutado por un equipo de dos personas que
además cursa otras obligaciones. Cualquier desvío —una prueba de concepto que falla, una semana
perdida por otra materia, un defecto en la liquidación— consume la holgura completa. La práctica
habitual sitúa la reserva de contingencia entre el 15 % y el 25 % del esfuerzo estimado.

Este es el hallazgo principal del dimensionamiento y obliga a una decisión de alcance, que es
precisamente para lo que sirve calcular el tamaño antes de planificar.

## 9.11 Decisión de alcance

Se difiere a una **fase posterior a la entrega académica** un conjunto de funcionalidades
seleccionadas con tres criterios: que no formen parte de los requisitos obligatorios de la cátedra
—soporte a la decisión y seguridad—, que no impidan operar el sistema, y que puedan resolverse
transitoriamente por vía manual o de soporte.

| # | Funcionalidad diferida | Tipo | PF | Cómo se resuelve mientras tanto |
|---:|---|---|---:|---|
| 1 | Certificado de deuda | EO | 5 | Se emite manualmente a partir del estado de cuenta |
| 2 | Exportación completa de los datos del consorcio | EO | 7 | Obligación contractual atendida por soporte, con volcado de la base |
| 3 | Informe de precisión de la asistencia automática | EO | 5 | El dato se registra igualmente; se consulta por base de datos |
| 4 | Ocupación de espacios comunes | EO | 5 | Indicador secundario, no vinculado a un objetivo del punto 3 |
| 5 | Aviso de vencimiento próximo | EO | 5 | Se cubre con el aviso de liquidación publicada |
| 6 | Carga masiva de unidades y coeficientes | EI | 6 | Carga unitaria durante la implementación inicial |
| 7 | Anulación de liquidación con rectificativa | EI | 6 | Procedimiento asistido por soporte, con registro en auditoría |
| 8 | Anulación de pago | EI | 4 | Ídem anterior |
| 9 | Alta de rubro de gasto | EI | 3 | Los rubros se precargan en la implementación |
| 10 | Modificación de rubro de gasto | EI | 3 | Ídem anterior |
| 11 | Baja lógica de consorcio | EI | 3 | Se resuelve por soporte; es una operación excepcional |
| 12 | Baja lógica de unidad | EI | 3 | Ídem anterior |
| 13 | Baja de usuario | EI | 3 | Se cubre con la desactivación de la habilitación |
| 14 | Baja lógica de proveedor | EI | 3 | Ídem anterior |
| 15 | Baja de documento del consorcio | EI | 3 | Ídem anterior |
| 16 | Modificación o baja de novedad | EI | 3 | Se republica una novedad nueva |
| 17 | Marcado de notificación como leída | EI | 3 | Las notificaciones llegan por correo; no hay centro de notificaciones |
| 18 | Modificación de espacio común | EI | 4 | Se resuelve por soporte |
| 19 | Consulta de proveedor con histórico | EQ | 6 | Se cubre parcialmente con el ordenamiento de proveedores, RF-24 |
| 20 | Consulta de la bitácora de auditoría | EQ | 4 | El registro se produce igual; se consulta por base de datos |
| 21 | Listado de rubros | EQ | 3 | Los rubros aparecen en los selectores de carga |
| 22 | Descarga de comprobante como transacción independiente | EQ | 3 | Se descarga desde la consulta del gasto |
| 23 | Listado de notificaciones del usuario | EQ | 3 | Ídem punto 17 |
| | **Total diferido** | | **93** | |

### Tamaño y esfuerzo del alcance comprometido

| Concepto | Valor |
|---|---:|
| Puntos de función sin ajustar, alcance completo | 526 |
| Puntos de función diferidos | (93) |
| **Puntos de función sin ajustar, alcance comprometido** | **433** |
| Factor de ajuste (VAF) | 1,11 |
| **Puntos de función ajustados** | **481** |
| Razón de productividad | 1,6 h/PF |
| **Esfuerzo comprometido** | **770 horas** |

| Verificación | Valor |
|---|---:|
| Capacidad total disponible | 984 h |
| Esfuerzo comprometido | 770 h |
| **Reserva de contingencia** | **214 h, equivalentes al 21,7 %** |

La reserva resultante se ubica dentro del rango recomendado y da margen para absorber el fracaso de
una prueba de concepto, la corrección de defectos en la liquidación y las interrupciones propias del
cursado.

### Verificación de que no se afectan los requisitos obligatorios

| Requisito obligatorio | Estado tras la reducción |
|---|---|
| Herramientas para la toma de decisiones basadas en datos del sistema | **Intacto.** Se conservan los seis indicadores de RF-21 a RF-25 y el panel consolidado. Solo se difiere el indicador de ocupación de espacios comunes, que no responde a ningún objetivo del punto 3 |
| Buenas prácticas de seguridad | **Intacto.** Se conserva el registro completo de auditoría; solo se difiere su pantalla de consulta |
| Objetivos OBJ-1 a OBJ-5 del punto 3 | **Todos conservados.** Ninguna funcionalidad diferida es la única que satisface un objetivo |

## 9.12 Distribución del esfuerzo

### Por etapa del ciclo de vida

| Etapa | Porcentaje | Horas |
|---|---:|---:|
| Análisis y relevamiento | 14 % | 108 |
| Diseño | 16 % | 123 |
| Construcción | 46 % | 354 |
| Pruebas | 15 % | 116 |
| Documentación, capacitación y despliegue | 9 % | 69 |
| **Total** | **100 %** | **770** |

### Por rol

| Rol | Horas | Valor hora | Subtotal |
|---|---:|---:|---:|
| Líder de proyecto | 70 | $ 106.000 | $ 7.420.000 |
| Analista funcional | 150 | $ 74.000 | $ 11.100.000 |
| Diseñador | 105 | $ 86.000 | $ 9.030.000 |
| Programador | 325 | $ 90.000 | $ 29.250.000 |
| Tester | 120 | $ 77.000 | $ 9.240.000 |
| **Total** | **770** | | **$ 66.040.000** |

Estos valores son los que se utilizan en el punto 6 para determinar el precio.

### Por iteración

| Iteración | PF ajustados | Horas | Semanas a 24 h |
|---|---:|---:|---:|
| Iteración 1 — Núcleo | 138 | 221 | 9,2 |
| Iteración 2 — Liquidación | 121 | 194 | 8,1 |
| Iteración 3 — Servicios y análisis | 152 | 243 | 10,1 |
| Análisis, diseño y cierre, transversales | 70 | 112 | 4,7 |
| **Total** | **481** | **770** | **32,1** |

## 9.13 Comparación con la estimación preliminar

| Estimación | Método | Horas | Desvío |
|---|---|---:|---:|
| Preliminar, punto 4.5.3 | Analogía y juicio experto | 655 | — |
| Formal, alcance completo | Puntos de función IFPUG | 934 | +42,6 % |
| Formal, alcance comprometido | Puntos de función IFPUG | 770 | +17,6 % |

La estimación preliminar subestimaba el esfuerzo en un 42,6 % respecto del alcance completo. El
desvío se concentra en tres áreas que el juicio experto tiende a minimizar: la cantidad de
transacciones de mantenimiento —que individualmente parecen triviales pero suman 201 puntos de
función—, la complejidad de las salidas con lógica de derivación, y el peso de las funciones
asistidas. Esta comparación es la justificación empírica de por qué la consigna exige calcular el
tamaño antes de elaborar el cronograma definitivo.

---

## Referencias

- Albrecht, A. J. (1979). Measuring Application Development Productivity. *Proceedings of the Joint
  SHARE/GUIDE/IBM Application Development Symposium*, 83–92.
- Boehm, B. W., Abts, C., Brown, A. W., Chulani, S., Clark, B. K., Horowitz, E., Madachy, R., Reifer,
  D. J., & Steece, B. (2000). *Software Cost Estimation with COCOMO II*. Prentice Hall.
- International Function Point Users Group. (2010). *Function Point Counting Practices Manual*,
  versión 4.3.1.
- Jones, C. (2007). *Estimating Software Costs* (2.ª ed.). McGraw-Hill.
- Pressman, R. S., & Maxim, B. R. (2020). *Ingeniería del software: un enfoque práctico* (9.ª ed.).
  McGraw-Hill.
