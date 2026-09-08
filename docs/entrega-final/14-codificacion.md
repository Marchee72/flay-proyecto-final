# 14. Codificación

> **Requisito de la cátedra (Última entrega, punto 14):** *"Codificación. Elección del lenguaje de
> programación – Justificación. Elección de herramientas para la toma de decisiones. Justificación."*

> ⚠️ **Estado: esqueleto.** Las decisiones de fondo están tomadas en los puntos 4, 5 y 12; aquí se
> formalizan con la justificación que exige la consigna y se completan al codificar.

---

## 14.1 Elección del lenguaje de programación

### Criterios de evaluación

Los criterios provienen de las restricciones establecidas en los puntos anteriores:

| # | Criterio | Origen |
|---|---|---|
| 1 | Un solo lenguaje en cliente y servidor, para no duplicar esfuerzo en un equipo de dos personas | Punto 5.5, fundamento 3 |
| 2 | Tipado estático, para detectar en compilación los errores de cálculo económico | Punto 11, riesgo RT-01 |
| 3 | Ecosistema con biblioteca madura de aritmética decimal de precisión fija | Punto 12.6 |
| 4 | Soporte de primera clase en la plataforma de despliegue elegida | Punto 5.5, fundamento 2 |
| 5 | Experiencia previa del equipo | Punto 5.2.2 |
| 6 | Disponibilidad de mapeador objeto-relacional con migraciones versionadas | Punto 8.3.5 |

### Comparación

*A completar con la evaluación final.*

| Lenguaje y entorno | C1 | C2 | C3 | C4 | C5 | C6 | Observaciones |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| Lenguaje con tipado estático sobre entorno de ejecución de navegador y servidor | | | | | | | Alternativa A del punto 4.2 |
| Plataforma de servidor con lenguaje compilado | | | | | | | Alternativa B del punto 4.3 |
| Lenguaje interpretado de propósito general | | | | | | | No evaluado en el punto 4 |

### Decisión y justificación

*A completar.* La decisión debe ser consistente con la alternativa A adoptada en el punto 5.5 y
sostenerse en los seis criterios anteriores, no en preferencia.

### Bibliotecas y herramientas adoptadas

*A completar al cerrar la iteración 3.*

| Componente | Herramienta | Versión | Licencia | Justificación |
|---|---|---|---|---|
| Entorno de ejecución y renderizado | | | | |
| Mapeador objeto-relacional | | | | |
| Validación de esquemas | | | | |
| Autenticación | | | | |
| Derivación de contraseñas | | | | |
| Aritmética decimal | | | | |
| Generación de documentos descargables | | | | |
| Gráficos del panel de indicadores | | | | |
| Pruebas automatizadas | | | | |
| Análisis estático y formato | | | | |

El inventario de dependencias con su licencia se verifica antes de cada entrega, conforme al punto
5.3.4, para descartar componentes con licencias recíprocas fuertes.

## 14.2 Elección de herramientas para la toma de decisiones

### Alternativas evaluadas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| **Herramienta externa de inteligencia de negocios** | Constructor visual de tableros; no requiere programar cada indicador | Servicio adicional a contratar, operar y asegurar; exige exponer la base a un tercero, con implicancias sobre el punto 5.3.3; costo mensual que anula la ventaja de la capa gratuita |
| **Biblioteca de gráficos dentro de la propia aplicación, sobre vistas agregadas en la base** | Sin servicio adicional; los indicadores heredan la autorización por consorcio del sistema; costo cero; la agregación se resuelve donde están los datos | Cada indicador debe implementarse; no hay exploración ad hoc por parte del usuario |
| **Exportación a planilla de cálculo** | Familiar para el cliente | Reproduce el problema que el sistema viene a resolver: el dato vuelve a una planilla sin trazabilidad |

### Decisión preliminar y su justificación

Conforme al punto 12.9.1, se adopta la **segunda alternativa**. Los fundamentos:

1. **El volumen no justifica una herramienta externa.** Menos de 600.000 registros a cinco años
   —punto 7.5— se agregan sin dificultad en la propia base de datos.
2. **La autorización es el problema central de este sistema.** Los indicadores implementados dentro
   de la aplicación heredan automáticamente el filtro por consorcio de la capa de acceso a datos. Una
   herramienta externa con acceso directo a la base sortea ese control y reintroduce el riesgo RT-04
   por una puerta lateral.
3. **Un servicio menos que operar**, conforme al criterio del punto 5.5.
4. **Exponer la base a un tercero** activa obligaciones adicionales bajo la Ley 25.326 que la
   alternativa adoptada evita, porque el dato no sale del sistema.

La contrapartida —el usuario no puede construir sus propios tableros— es aceptable: el punto 12.9
define seis indicadores, cada uno vinculado a una decisión concreta de la administración, y no un
entorno de exploración libre de datos.

*A completar con la herramienta de graficación finalmente utilizada y su justificación.*

## 14.3 Elección del proveedor de servicios de procesamiento automático

### Criterios

Los criterios están fijados desde el punto 4 y no se negocian al momento de elegir:

| # | Criterio | Requerimiento |
|---|---|---|
| 1 | Debe existir una capa gratuita suficiente para el volumen previsto: alrededor de 900 comprobantes y 70 reclamos mensuales | Punto 4.2 |
| 2 | El proveedor debe ser reemplazable sin modificar la lógica de negocio | RNF-15 |
| 3 | Los términos de servicio deben admitir el tratamiento por cuenta del responsable y prohibir el uso de los datos para fines propios | Punto 5.3.3 |
| 4 | Debe permitir procesar imágenes y documentos, además de texto | RF-06 |
| 5 | Debe ofrecer generación de vectores semánticos, o admitir combinarlo con otro proveedor | RF-20 |
| 6 | Debe existir una región de procesamiento cuya jurisdicción sea compatible con las obligaciones del punto 5.3 | Punto 5.3.3 |

### Comparación

*A completar con la evaluación efectiva al momento de la construcción, en la iteración 3.*

| Criterio | Opción 1 | Opción 2 | Opción 3 |
|---|---|---|---|
| C1 Capa gratuita suficiente | | | |
| C2 Reemplazabilidad | | | |
| C3 Términos de tratamiento | | | |
| C4 Procesamiento de imágenes | | | |
| C5 Vectores semánticos | | | |
| C6 Jurisdicción | | | |
| Límites de uso declarados | | | |
| Costo al superar la capa gratuita | | | |

### Decisión y justificación

*A completar.*

La elección se difirió deliberadamente hasta esta etapa, y no se comprometió en la documentación de
análisis, por dos razones: porque es exactamente el punto donde la consigna la solicita, y porque el
diseño del punto 12.8.2 hace que la decisión sea reversible: la lógica de negocio depende de cuatro
interfaces del dominio, no de un proveedor. Comprometer un proveedor durante el análisis habría
introducido una dependencia que el diseño está construido para evitar.

### Verificación de la reemplazabilidad

*A completar.* Debe acreditarse que existen las tres implementaciones previstas en el punto 12.8.2:
la del proveedor seleccionado, la determinística para pruebas y la nula para degradación.

## 14.4 Estándares de codificación

*A completar al cerrar la iteración 1.*

| Aspecto | Definición |
|---|---|
| Nomenclatura | |
| Estructura de carpetas por capa | |
| Manejo de errores | |
| Tratamiento de importes | Aritmética decimal de precisión fija en todo el sistema, conforme al punto 12.6. **Prohibido el uso de punto flotante para dinero** |
| Registro de eventos | |
| Comentarios | |
| Análisis estático y formato | |

## 14.5 Métricas de la construcción

*A completar al cierre.*

| Métrica | Planificado | Real | Desvío |
|---|---:|---:|---:|
| Esfuerzo total | 770 h | | |
| Esfuerzo de la iteración 1 | 221 h | | |
| Esfuerzo de la iteración 2 | 194 h | | |
| Esfuerzo de la iteración 3 | 243 h | | |
| Razón de productividad | 1,6 h/PF | | |
| Reserva de contingencia consumida | 214 h disponibles | | |

La comparación entre la razón planificada y la real es el dato que valida o refuta el método de
estimación del punto 9, y debe informarse aunque el resultado sea desfavorable.

---

## Referencias

*A completar.*
