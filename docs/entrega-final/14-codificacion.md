# 14. Codificación

> **Requisito de la cátedra (Última entrega, punto 14):** *"Codificación. Elección del lenguaje de
> programación – Justificación. Elección de herramientas para la toma de decisiones. Justificación."*

> ⚠️ **Estado: parcial.** El punto 14.1 —elección del lenguaje— está resuelto y justificado. El
> 14.2 tiene decisión preliminar tomada. Quedan abiertos el 14.3 —proveedor de servicios de
> procesamiento automático, diferido deliberadamente a la iteración 3—, el 14.4 y el 14.5, que se
> completan al codificar.

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

Se evalúan los tres candidatos anticipados, cada uno representado por su exponente más maduro.
Escala: **✔** cumple · **~** cumple parcialmente · **✘** no cumple.

| Lenguaje y entorno | C1 | C2 | C3 | C4 | C5 | C6 | Observaciones |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| **TypeScript** sobre entorno de ejecución de navegador y servidor | ✔ | ~ | ✘ | ✔ | ✔ | ✔ | Alternativa A del punto 4.2 |
| **C#** sobre plataforma de servidor con lenguaje compilado | ✘ | ✔ | ✔ | ~ | ~ | ✔ | Alternativa B del punto 4.3 |
| **Python** como lenguaje interpretado de propósito general | ✘ | ✘ | ✔ | ✔ | ~ | ✔ | No evaluado en el punto 4 |

Fundamento de cada celda:

| Criterio | TypeScript | C# | Python |
|---|---|---|---|
| **C1** Un solo lenguaje en cliente y servidor | Único candidato que lo cumple de forma completa: el mismo lenguaje, los mismos tipos y las mismas validaciones se comparten entre la vista y la acción de servidor | Exige TypeScript o JavaScript en el cliente de todos modos, salvo adoptando un entorno de ejecución en el navegador que el equipo no conoce | Exige TypeScript o JavaScript en el cliente |
| **C2** Tipado estático | Estructural y **borrado en tiempo de ejecución**: no protege el límite de entrada. Se compensa con validación de esquemas en ejecución sobre todo dato externo | Nominal y verificado en ejecución. Superior en este criterio | Anotaciones opcionales, sin verificación en ejecución. No cumple el criterio |
| **C3** Aritmética decimal de precisión fija | **No existe tipo decimal nativo.** El tipo numérico del lenguaje es punto flotante binario IEEE 754. Requiere biblioteca, y cualquier operación que se le escape vuelve silenciosamente a punto flotante | `decimal` nativo de 128 bits en base 10 | `decimal.Decimal` en la biblioteca estándar |
| **C4** Soporte de primera clase en la plataforma de despliegue | Caso de uso primario de las plataformas gestionadas con capa gratuita | Soportado, pero sin capa gratuita comparable: contradice el fundamento 2 del punto 5.5 | Soportado, con capa gratuita disponible |
| **C5** Experiencia previa del equipo | **Avanzado** en «desarrollo web con componentes y tipado estático», según el punto 5.2.2 | No declarado en el punto 5.2.2; además arrastra la brecha permanente de administración de infraestructura de la alternativa B | No declarado en el punto 5.2.2 |
| **C6** Mapeador objeto-relacional con migraciones versionadas | Disponible, con esquema tipado y migraciones versionadas | Disponible y maduro | Disponible y maduro |

### Decisión y justificación

> **Se adopta TypeScript**, sobre un entorno de renderizado en servidor que aloja interfaz y lógica
> en un mismo proyecto, conforme a la alternativa A del punto 4.2.

La decisión se apoya en cuatro criterios y reconoce que falla en un quinto:

**1. C5 es decisivo y no es una preferencia.** El punto 5.2.2 registra nivel *avanzado* en desarrollo
web con componentes y tipado estático, y no registra los otros dos lenguajes. Con 24 horas semanales
de capacidad conjunta y fechas improrrogables, elegir un lenguaje que el equipo domina menos consume
del recurso más escaso del proyecto para comprar una ventaja en un solo criterio.

**2. C1 materializa el fundamento 3 del punto 5.5.** Es el único candidato que evita la duplicación
entre contrato de interfaz, implementación en el servidor y consumo en el cliente. Ninguna de las
otras dos opciones elimina TypeScript del cliente: lo agregan como segundo lenguaje.

**3. C4 materializa los fundamentos 2 y 5 del punto 5.5.** El costo de infraestructura arranca en
cero y el prototipo puede permanecer publicado después de la instancia académica.

**4. C6 se cumple sin concesiones**, con esquema tipado y migraciones versionadas conforme al punto
8.3.5.

**5. C3 no se cumple, y es el criterio más importante de los seis.** Esto se declara en lugar de
disimularse: el lenguaje adoptado es el único de los tres sin aritmética decimal nativa, y este
sistema administra dinero de terceros. La decisión se sostiene igualmente porque el defecto es
*acotable por diseño*, mientras que la brecha de C5 sería permanente. Las medidas de contención se
detallan a continuación y son verificables.

#### Contención del incumplimiento de C3

| # | Medida | Verificación |
|---|---|---|
| 1 | Los importes se almacenan en `NUMERIC` de la base de datos y se transportan como decimal de precisión arbitraria provisto por el mapeador objeto-relacional. **En ninguna capa un importe existe como número de punto flotante** | Revisión del esquema y de los tipos generados |
| 2 | Ninguna firma pública del dominio acepta ni devuelve el tipo numérico nativo para dinero. El compilador rechaza el intento | Prueba de compilación negativa |
| 3 | La serialización hacia la interfaz transporta importes como cadena, nunca como número. La interfaz solo los formatea, nunca opera con ellos | Prueba de extremo a extremo sobre un importe con más de quince dígitos significativos |
| 4 | Regla de análisis estático que prohíbe los operadores aritméticos sobre expresiones de tipo monetario | Verificación automática en cada envío al repositorio |
| 5 | El desarrollo guiado por pruebas es obligatorio en liquidación, prorrateo, intereses e imputación, conforme al punto 8.3.3, con casos de coeficientes que suman 100 % sobre 96 unidades | Suite de pruebas del dominio, ejecutable sin base de datos gracias al punto 12.1 |

La medida 5 es la que cierra el riesgo: la independencia del dominio respecto de la infraestructura
—Principio III de la constitución del proyecto— es lo que permite ejercitar exhaustivamente el
cálculo económico a costo bajo. El punto débil del lenguaje se compensa con la fortaleza del diseño.

### Bibliotecas y herramientas adoptadas

*Selección comprometida. Versiones fijadas en el acta del Paso 0 (2026-09-09); FR-023 de
`001-andamiaje` las verifica contra `package-lock.json`. Runtime: Node.js 22.21.0 LTS + npm 11.12.1
(`engines` + `.nvmrc`). Generador: `create-next-app@15.3.4`.*

| Componente | Herramienta | Versión | Licencia | Justificación |
|---|---|---|---|---|
| Entorno de ejecución y renderizado | Next.js sobre Node.js | Next 15.3.4 / Node 22.21.0 | MIT | Interfaz y lógica de servidor en un mismo proyecto mediante acciones de servidor y manejadores de ruta, conforme al punto 4.2. Portable a cualquier alojamiento con Node.js, lo que acota la dependencia de una plataforma |
| Base de datos | PostgreSQL administrado, con extensión `pgvector` | PG 17.4 + pgvector 0.8.0 (`pgvector/pgvector:pg17`) | PostgreSQL License | `NUMERIC` de precisión arbitraria para C3, restricciones de exclusión para RN-09 y RN-10, disparadores para RN-15 e índice vectorial para RF-20, en un único motor |
| Mapeador objeto-relacional | Prisma | 6.7.0 | Apache-2.0 | Esquema tipado y migraciones versionadas (C6, punto 8.3.5). Su tipo `Decimal` es el vehículo de la medida 1 de contención |
| Validación de esquemas | Zod | 3.24.2 | MIT | Compensa el borrado de tipos en ejecución (C2): valida todo dato que cruza el límite de confianza |
| Autenticación | Auth.js | 5.0.0 (`next-auth`) | ISC | Sesiones y control de acceso basado en roles, base de RNF-03 |
| Derivación de contraseñas | Argon2id | 2.0.2 (`@node-rs/argon2`) | MIT | Función resistente a fuerza bruta exigida por RNF-04 |
| Aritmética decimal | `decimal.js`, a través del tipo `Decimal` del mapeador | 10.4.3 | MIT | Contención del incumplimiento de C3 |
| Generación de documentos descargables | `@react-pdf/renderer` | 4.1.3 | MIT | Genera en el propio proceso, sin navegador sin interfaz: sostenible dentro de los límites de la capa gratuita para los 96 documentos del proceso diferido de RNF-07 |
| Gráficos del panel de indicadores | Recharts | 2.15.0 | MIT | Biblioteca de gráficos dentro de la aplicación, conforme a la decisión del punto 14.2: los indicadores heredan la autorización por consorcio |
| Iconos de interfaz | Lucide (`lucide-react`) | 0.525.0 | ISC | Set abierto de trazo consistente 24px (urgencias, estados, navegación); se verifica contra `package-lock` junto al resto |
| Pruebas automatizadas | Vitest y Playwright | Vitest 3.0.5 + `@vitest/coverage-v8` 3.0.5 / Playwright 1.50.1 + `@axe-core/playwright` 4.9.0 | MIT y Apache-2.0 | Vitest ejercita el dominio sin base de datos (punto 8.3.3); Playwright cubre extremo a extremo y verifica RNF-01 sobre ventana de teléfono |
| Análisis estático y formato | ESLint y Prettier | ESLint 9.20.0 + Prettier 3.4.2 + `eslint-config-prettier` 10.0.1 + `@typescript-eslint` 8.20.0 | MIT | Verificación automática en cada envío (punto 8.3.5) y sede de la medida 4 de contención |

Ninguna de las licencias listadas es recíproca fuerte, conforme exige el punto 5.3.4. La verificación
del inventario completo, incluidas las dependencias transitivas, se realiza antes de cada entrega.

### Condición sobre la capa gratuita

La justificación 5 del punto 5.5 afirma que el prototipo puede permanecer publicado sin costo. Esa
afirmación se sostiene para el uso académico y demostrativo, pero **las capas gratuitas de las
plataformas gestionadas suelen excluir el uso comercial**. Si Grupo Delta pasara a operar el sistema
de manera productiva, correspondería un plan pago, cuyo costo ya está previsto entre los costos
operativos del punto 6. Se deja asentado para no sostener en la defensa una ventaja que no aplica al
escenario comercial.

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

*Definidos al abrir la iteración 1 (FR-024 de `001-andamiaje`). Rigen desde el primer RF; lo escrito
después no los reabre.*

| Aspecto | Definición |
|---|---|
| Nomenclatura | Español en dominio y código de negocio (`Consorcio`, `liquidarPeriodo`, `coeficiente`); inglés solo para términos técnicos del framework (`route`, `middleware`). Archivos en minúsculas con guiones. Commits `RF-nn` + verbo. |
| Estructura de carpetas por capa | `src/app` (presentación) → `src/aplicacion` → `src/dominio` (+`contratos`) → `src/infraestructura`; transversal `src/compartido`. Dominio solo importa dominio/contratos/compartido (Principio III, FR-006/FR-012 de 001). |
| Manejo de errores | Mensajes comprensibles para usuario final (RNF-10): qué pasó, magnitud exacta y qué hacer. Nada de volcados técnicos en interfaz. Códigos de trazabilidad (`RF-`, regla `RN-`) en logs, no en pantalla. |
| Tratamiento de importes | Aritmética decimal de precisión fija en todo el sistema, conforme al punto 12.6. **Prohibido el uso de punto flotante para dinero**. Dominio: `Prisma.Decimal`, sin `number`; coeficientes 8 decimales = `100.00000000`; redondeo solo al final; serialización a interfaz como cadena. |
| Registro de eventos | JSON por línea con momento, usuario, consorcio, operación y resultado; sin datos personales fuera de lo necesario (Ley 25.326). Niveles info/aviso/error; el error incluye causa exacta y magnitud (p. ej. diferencia de coeficientes). |
| Comentarios | Solo el porqué no obvio y la referencia a regla (`RN-07 §7.2`, `RNF-06`). Nada de comentar el qué evidente. |
| Análisis estático y formato | Prettier + ESLint en cada envío (`verificar`): frontera de capas, sin aritmética monetaria (`flay/sin-aritmetica-monetaria`), sin cliente crudo fuera de infraestructura. `.editorconfig` `end_of_line = lf`. |

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
