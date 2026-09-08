# 6. Definición del precio del sistema y forma de pago

> **Requisito de la cátedra (2° Entrega, punto 6):** *"Definición del precio del sistema y forma de
> pago adoptada por el cliente."*

---

## 6.1 Costo de desarrollo del sistema

El precio se construye a partir del costo, pero no se define por él. Primero se establece cuánto
cuesta producir el sistema.

### 6.1.1 Esfuerzo y distribución por rol

El esfuerzo total de **770 horas** proviene del cálculo de tamaño del punto 9. La distribución por rol
responde a la asignación preliminar del punto 4.5.3, ajustada al método formal de dimensionamiento.

| Rol | Valor hora | Horas | Subtotal |
|---|---:|---:|---:|
| Líder de proyecto | $ 106.000 | 70 | $ 7.420.000 |
| Analista funcional | $ 74.000 | 150 | $ 11.100.000 |
| Diseñador | $ 86.000 | 105 | $ 9.030.000 |
| Programador | $ 90.000 | 325 | $ 29.250.000 |
| Tester | $ 77.000 | 120 | $ 9.240.000 |
| **Subtotal costos propios** | | **770** | **$ 66.040.000** |

Valores hora tomados de la tabla de honorarios del Consejo Profesional de Ciencias Informáticas de la
Provincia de Santa Fe, referencial orientativa, actualizados a marzo de 2026.

### 6.1.2 Costos de terceros

| Concepto | Importe |
|---|---:|
| Auditoría de seguridad y prueba de penetración por empresa externa especializada, previa a la puesta en producción | $ 6.500.000 |
| **Costo total del proyecto** | **$ 72.540.000** |

La auditoría externa se contrata porque la seguridad es un requisito obligatorio de la cátedra y
porque el equipo no puede auditar con objetividad el código que escribió. El alcance contratado cubre
autenticación y autorización, aislamiento entre consorcios, tratamiento de archivos subidos y
verificación de las diez categorías de riesgo más frecuentes en aplicaciones web.

### 6.1.3 Costos operativos anuales por cliente

| Concepto | Costo anual |
|---|---:|
| Infraestructura: plataforma, base de datos, almacenamiento y correo, estimada en USD 45 mensuales al superar las capas gratuitas | $ 783.000 |
| Servicios de inteligencia artificial, dentro de la capa gratuita para este volumen | $ 0 |
| Soporte y mantenimiento correctivo, estimado en 20 horas anuales a $ 90.000 | $ 1.800.000 |
| **Total costo de servir a un cliente del tamaño de Grupo Delta** | **$ 2.583.000** |

---

## 6.2 Modelos de comercialización evaluados

### Modelo 1 — Venta de licencia única con desarrollo a medida

El cliente paga el costo completo del desarrollo más un margen, y recibe el sistema y su código
fuente.

| Concepto | Importe |
|---|---:|
| Costo total del proyecto | $ 72.540.000 |
| Margen del 35 % | $ 25.389.000 |
| **Precio de venta** | **$ 97.929.000** |

**Descartado.** El precio equivale al 74 % de los honorarios anuales de Grupo Delta. Ninguna
administradora de esta escala afronta ese desembolso, y el análisis del punto 5.4 muestra que el
beneficio anual del sistema es de un orden de magnitud menor. Además, entregar el sistema a un único
cliente impide amortizar el desarrollo, que es precisamente lo que vuelve viable a este producto: el
mismo software sirve a cualquier administradora de la ciudad sin modificaciones.

### Modelo 2 — Software como servicio con abono por unidad funcional

El cliente paga una implementación inicial y un abono mensual proporcional al tamaño de la cartera que
administra. El proveedor conserva la titularidad del código y presta el servicio.

**Adoptado.** Los fundamentos:

1. **Alinea el precio con la capacidad de pago y con el beneficio.** El abono es proporcional a las
   unidades administradas, que es exactamente la base sobre la cual el cliente cobra sus honorarios.
   Una administradora que crece paga más porque gana más; una que se achica paga menos.
2. **Elimina la barrera de entrada.** Un desembolso inicial de $ 4.850.000 es asumible; uno de
   $ 97.929.000 no lo es.
3. **Permite amortizar el desarrollo entre varios clientes**, que es la única forma de que un sistema
   de esta complejidad sea económicamente accesible para administradoras pequeñas.
4. **Incluye la infraestructura**, que en la alternativa elegida es administrada por el proveedor. Al
   cliente no le corresponde contratar ni operar servidores.
5. **Genera ingresos recurrentes** que financian la evolución del producto, incluidas las
   funcionalidades hoy excluidas del alcance.

---

## 6.3 Estructura de precios adoptada

### 6.3.1 Componentes

| Componente | Concepto | Precio |
|---|---|---:|
| **Implementación inicial** | Parametrización de la instancia, carga de consorcios, unidades y coeficientes, migración del histórico de los últimos 12 meses, carga de la documentación de cada consorcio y capacitación según el punto 17 | **$ 4.850.000**, pago único |
| **Abono mensual** | Uso del sistema, alojamiento, respaldos, actualizaciones, funciones asistidas y soporte | **$ 1.800** por unidad funcional y por mes, con un mínimo de **$ 60.000** por consorcio |
| **Consorcio incorporado con posterioridad** | Alta y parametrización de un consorcio nuevo | **$ 180.000** por consorcio |
| **Migración de histórico adicional** | Por cada 12 meses de histórico anteriores a los incluidos | **$ 320.000** por consorcio |
| **Capacitación adicional** | Más allá de las horas incluidas en la implementación | **$ 95.000** por hora |
| **Desarrollo a pedido** | Funcionalidades fuera del alcance estándar | **$ 110.000** por hora, con presupuesto previo |

El mínimo por consorcio existe porque el costo de servir a un consorcio de 12 unidades no es
proporcionalmente menor que el de uno de 96: la carga de datos, el soporte y la generación de
liquidaciones tienen un componente fijo por consorcio.

### 6.3.2 Aplicación a la cartera de Grupo Delta

| Tramo | Consorcios | Unidades | Base de cálculo | Importe mensual |
|---|---:|---:|---|---:|
| Consorcios por debajo del mínimo, de 12 a 28 unidades | 4 | 80 | Mínimo de $ 60.000 por consorcio | $ 240.000 |
| Consorcios por unidad, de 33 a 96 unidades | 7 | 338 | 338 × $ 1.800 | $ 608.400 |
| **Total** | **11** | **418** | | **$ 848.400** |

| Concepto | Importe |
|---|---:|
| Abono mensual | $ 848.400 |
| Abono anual | $ 10.180.800 |
| Costo por unidad funcional y por mes | $ 2.030 |
| **Peso sobre los honorarios de la administradora** | **7,7 %** |
| **Peso sobre la masa de expensas administrada** | **0,61 %** |

Ambos porcentajes son la referencia relevante en la negociación: el sistema cuesta menos de un peso
por cada ciento sesenta que el consorcio ya gasta, y el cliente puede optar por trasladarlo a los
consorcios como gasto ordinario de administración —$ 2.030 por unidad y por mes— o absorberlo contra
la mejora de su propia rentabilidad.

### 6.3.3 Verificación de la rentabilidad para el proveedor

| Concepto | Año 1 por cliente |
|---|---:|
| Implementación inicial | $ 4.850.000 |
| Abono anual | $ 10.180.800 |
| **Ingresos** | **$ 15.030.800** |
| Costo de servir, punto 6.1.3 | ($ 2.583.000) |
| **Margen de contribución** | **$ 12.447.800** |
| **Margen sobre ingresos** | **82,8 %** |

| Indicador | Valor |
|---|---|
| Inversión a recuperar | $ 72.540.000 |
| Clientes necesarios para el punto de equilibrio en el primer año | **6 clientes** del tamaño de Grupo Delta |
| Clientes necesarios considerando solo el abono, sin implementación | 8 clientes |
| Mercado potencial estimado en Rosario | Más de 200 administradoras registradas |

El punto de equilibrio en seis clientes sobre un mercado de más de doscientas administradoras
registradas en el Registro Público municipal indica que el modelo es viable sin necesidad de capturar
una porción significativa del mercado.

### 6.3.4 Actualización de precios

En el contexto inflacionario descrito como amenaza A2 en el FODA, un precio nominal fijo se
desactualiza antes de completar el primer año. El contrato establece:

- **Actualización trimestral** del abono y de los servicios adicionales por el Índice de Precios al
  Consumidor publicado por el INDEC, aplicado sobre el trimestre calendario anterior.
- El abono es **proporcional a las unidades administradas**, de modo que el crecimiento nominal de
  las expensas no altera por sí mismo el precio: la base de cálculo es física, no monetaria.
- Notificación al cliente con treinta días de anticipación a cada actualización.
- El precio de la implementación inicial se mantiene firme por sesenta días desde la fecha de la
  propuesta.

---

## 6.4 Forma de pago adoptada por el cliente

### 6.4.1 Implementación inicial: pago contra entregables

Grupo Delta adopta un esquema de pago vinculado a la aceptación de entregables funcionales, no al
calendario. Cada pago se libera contra la aprobación formal del entregable correspondiente, y el
cliente dispone de diez días hábiles para observarlo. Si observa, el proveedor corrige y vuelve a
presentar sin costo adicional; la aceptación tácita opera vencido ese plazo sin observaciones.

| Cuota | Momento | Entregable asociado | Porcentaje | Importe |
|---|---|---|---:|---:|
| 1 | A la firma del contrato | Instancia parametrizada, usuarios creados y capacitación inicial iniciada | 30 % | $ 1.455.000 |
| 2 | Aceptación del entregable 1 | Consorcios, unidades y coeficientes cargados y validados; gastos y comprobantes en operación | 30 % | $ 1.455.000 |
| 3 | Aceptación del entregable 2 | Liquidación de expensas operativa y validada en paralelo contra la planilla durante un período completo | 25 % | $ 1.212.500 |
| 4 | Aceptación del entregable 3 | Reclamos, reservas, documentación, indicadores de gestión y funciones asistidas en operación | 15 % | $ 727.500 |
| | | **Total** | **100 %** | **$ 4.850.000** |

La tercera cuota está deliberadamente atada a la validación en paralelo de la liquidación: es el
proceso de mayor riesgo operativo según el punto 5.1.2, y ni el cliente debería pagarlo antes de
verificarlo ni el proveedor debería cobrarlo sin haberlo demostrado.

### 6.4.2 Abono mensual

| Aspecto | Condición |
|---|---|
| Inicio de la facturación | A partir de la aceptación del entregable 2, cuando el sistema entra en operación real |
| Período de facturación | Mensual, por mes adelantado |
| Vencimiento | Día 10 de cada mes |
| Medio de pago | Transferencia bancaria a la cuenta del proveedor |
| Base de cálculo | Unidades funcionales activas al primer día del mes |
| Mora | Interés equivalente a la tasa activa del Banco de la Nación Argentina para operaciones de descuento; a los 60 días de mora el proveedor puede suspender el acceso, previa intimación fehaciente con 15 días de anticipación |

### 6.4.3 Período de puesta a punto

Durante los **tres meses** posteriores a la aceptación del entregable 4:

- La corrección de defectos y el soporte funcional se prestan **sin cargo**.
- El tiempo de respuesta comprometido es de 24 horas hábiles para incidentes que impidan operar, y de
  72 horas hábiles para el resto.
- El cliente puede solicitar ajustes menores de configuración y de textos sin costo. Los cambios que
  impliquen funcionalidad nueva se presupuestan como desarrollo a pedido.

### 6.4.4 Soporte y mantenimiento posteriores

Vencido el período de puesta a punto, el soporte queda incluido en el abono con el siguiente alcance:

| Incluido en el abono | No incluido, se presupuesta aparte |
|---|---|
| Corrección de defectos del sistema | Desarrollo de funcionalidades nuevas |
| Actualizaciones y mejoras del producto | Integraciones con sistemas de terceros |
| Alojamiento, respaldos y monitoreo | Migración de datos adicional |
| Soporte funcional por correo y teléfono en horario hábil | Capacitación más allá de la inicial |
| Restauración de copias de respaldo | Personalizaciones exclusivas para el cliente |

### 6.4.5 Condiciones contractuales relevantes

| Cláusula | Contenido |
|---|---|
| **Plazo** | Doce meses, con renovación automática por períodos iguales salvo aviso en contrario con sesenta días de anticipación |
| **Propiedad intelectual** | El código fuente y la arquitectura permanecen en titularidad del proveedor, conforme a la Ley 11.723. El cliente recibe una licencia de uso no exclusiva e intransferible mientras el contrato esté vigente |
| **Propiedad de los datos** | **Los datos cargados son propiedad exclusiva del cliente.** El proveedor los trata por cuenta y orden de aquel y no los utiliza para ningún otro fin |
| **Portabilidad** | Ante la terminación del contrato por cualquier causa, el proveedor entrega la totalidad de los datos en formato abierto y documentado dentro de los quince días, y conserva una copia por treinta días adicionales antes de eliminarla definitivamente |
| **Confidencialidad** | Recíproca, con vigencia de dos años posteriores a la terminación |
| **Protección de datos personales** | El proveedor actúa como encargado del tratamiento en los términos de la Ley 25.326, con las obligaciones detalladas en el punto 5.3 |
| **Nivel de servicio** | Disponibilidad mensual del 99 % en horario hábil, medida sobre el mes calendario. Por cada punto porcentual de incumplimiento se bonifica el 5 % del abono del mes |
| **Limitación de responsabilidad** | La responsabilidad del proveedor se limita al importe abonado en los últimos doce meses, salvo dolo o culpa grave |
| **Rescisión sin causa** | Cualquiera de las partes con sesenta días de preaviso. La implementación inicial no se reintegra |

---

## 6.5 Síntesis

| Concepto | Valor |
|---|---:|
| Costo de desarrollo del sistema | $ 72.540.000 |
| Precio para Grupo Delta, implementación inicial | $ 4.850.000 |
| Precio para Grupo Delta, abono mensual | $ 848.400 |
| Precio para Grupo Delta, primer año | $ 15.030.800 |
| Costo mensual por unidad funcional | $ 2.030 |
| Peso sobre los honorarios del cliente | 7,7 % |
| Punto de equilibrio del proveedor | 6 clientes de tamaño equivalente |
| Modelo de pago de la implementación | Cuatro cuotas contra aceptación de entregables |
| Actualización del abono | Trimestral por IPC del INDEC |

---

## Referencias

- Congreso de la Nación Argentina. (1933). *Ley N.º 11.723 de Régimen Legal de la Propiedad
  Intelectual*.
- Congreso de la Nación Argentina. (2000). *Ley N.º 25.326 de Protección de los Datos Personales*.
- Consejo Profesional de Ciencias Informáticas de la Provincia de Santa Fe. *Tabla de honorarios
  profesionales, referencial orientativa*.
- Kotler, P., & Keller, K. L. (2016). *Dirección de marketing* (15.ª ed.). Pearson.
- Sapag Chain, N., & Sapag Chain, R. (2014). *Preparación y evaluación de proyectos* (6.ª ed.).
  McGraw-Hill.
