# 14. Codificación

> **Requisito de la cátedra (Última entrega, punto 14):** *"Codificación. Elección del lenguaje de
> programación – Justificación. Elección de herramientas para la toma de decisiones. Justificación."*

> ✅ **Estado: completo.** El 14.1 y el 14.2 están decididos y ratificados; el 14.3 se decidió con
> las dos pruebas de concepto de la iteración 3 y su reemplazabilidad está verificada; el 14.4 rige
> desde el primer requerimiento; el 14.5 cierra con las métricas de las tres iteraciones.

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
(`engines` + `.nvmrc`). Generador: `create-next-app@15.3.4`. Correcciones del 2026-09-09 al instalar,
registradas en el acta del Paso 0: Next 15.5.25 (15.3.4 quedó deprecada por CVE-2025-66478), Auth.js
5.0.0-beta.32 (la 5.0.0 estable no existe), Playwright 1.63.0 (par exigido por Next y aviso <1.55.1) y
Vitest 3.2.7 (aviso crítico <=3.2.5). El motor pasa a PostgreSQL 18.6 con `pgvector` 0.8.6: es la
versión que ofrece la base administrada, y ninguna capacidad exigida aquí cambia entre 17 y 18, de
modo que desarrollo, verificación y demostración corren la misma. Las transitivas `postcss` 8.5.28 y
`sharp` 0.35.4 se fuerzan por
`overrides`, de modo que `npm audit --audit-level=high` cierra en cero.*

| Componente | Herramienta | Versión | Licencia | Justificación |
|---|---|---|---|---|
| Entorno de ejecución y renderizado | Next.js sobre Node.js | Next 15.5.25 / Node 22.21.0 | MIT | Interfaz y lógica de servidor en un mismo proyecto mediante acciones de servidor y manejadores de ruta, conforme al punto 4.2. Portable a cualquier alojamiento con Node.js, lo que acota la dependencia de una plataforma |
| Base de datos | PostgreSQL administrado, con extensión `pgvector` | PG 18.6 + pgvector 0.8.6 (`pgvector/pgvector:0.8.6-pg18`) | PostgreSQL License | `NUMERIC` de precisión arbitraria para C3, restricciones de exclusión para RN-09 y RN-10, disparadores para RN-15 e índice vectorial para RF-20, en un único motor |
| Mapeador objeto-relacional | Prisma | 6.7.0 | Apache-2.0 | Esquema tipado y migraciones versionadas (C6, punto 8.3.5). Su tipo `Decimal` es el vehículo de la medida 1 de contención |
| Validación de esquemas | Zod | 3.24.2 | MIT | Compensa el borrado de tipos en ejecución (C2): valida todo dato que cruza el límite de confianza |
| Autenticación | Auth.js | 5.0.0-beta.32 (`next-auth`) | ISC | Sesiones y control de acceso basado en roles, base de RNF-03 |
| Derivación de contraseñas | Argon2id | 2.0.2 (`@node-rs/argon2`) | MIT | Función resistente a fuerza bruta exigida por RNF-04 |
| Aritmética decimal | `decimal.js`, a través del tipo `Decimal` del mapeador | 10.4.3 | MIT | Contención del incumplimiento de C3 |
| Generación de documentos descargables | `@react-pdf/renderer` | 4.1.3 | MIT | Genera en el propio proceso, sin navegador sin interfaz: sostenible dentro de los límites de la capa gratuita para los 96 documentos del proceso diferido de RNF-07 |
| Gráficos del panel de indicadores | Recharts | 2.15.0 | MIT | Biblioteca de gráficos dentro de la aplicación, conforme a la decisión del punto 14.2: los indicadores heredan la autorización por consorcio |
| Almacenamiento de objetos | Vercel Blob (`@vercel/blob`) | 2.8.0 | Apache-2.0 | Comprobantes digitalizados de hasta 25 MB con subida directa del navegador al almacenamiento: la función de despliegue limita el cuerpo de un pedido muy por debajo de ese tamaño. Se consume tras una interfaz del dominio (punto 12.1.3), de modo que el acoplamiento con la plataforma queda en un solo archivo |
| Correo transaccional | Resend | 6.26.0 | MIT | Invitación de usuario de la iteración 1 y, más adelante, el despachador de RF-14. Se consume tras la interfaz `Notificador` del dominio |
| Servicios de procesamiento automático | Gemini API (`@google/genai`) | 2.22.0 | Apache-2.0 | Proveedor elegido en el punto 14.3 tras las dos pruebas de concepto de § 8.4.3. Se consume únicamente detrás de las cuatro interfaces del dominio de § 12.8.2, con una implementación determinística y una nula al lado (RNF-14, RNF-15); el archivo que lo importa es uno solo |
| Extracción de texto de PDF | `unpdf` | 1.8.1 | MIT | Texto por página de los documentos del consorcio para la indexación de RF-20, en el propio proceso y sin depender del proveedor externo: si el proveedor no está, el texto igual existe y la indexación se reintenta |
| Iconos de interfaz | Lucide (`lucide-react`) | 0.525.0 | ISC | Set abierto de trazo consistente 24px (urgencias, estados, navegación); se verifica contra `package-lock` junto al resto |
| Pruebas automatizadas | Vitest y Playwright | Vitest 3.2.7 + `@vitest/coverage-v8` 3.2.7 / Playwright 1.63.0 + `@axe-core/playwright` 4.9.0 | MIT y Apache-2.0 | Vitest ejercita el dominio sin base de datos (punto 8.3.3); Playwright cubre extremo a extremo y verifica RNF-01 sobre ventana de teléfono |
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

### Ratificación al iniciar el paquete 5.5

Se **ratifica** la decisión preliminar al abrir la construcción de los indicadores (iteración 3,
septiembre de 2026). La herramienta de graficación es **Recharts 2.15.0**, instalada desde la
iteración 1 y fijada en la tabla de § 14.1, contra el criterio de la sección:

| Criterio | Cómo lo cumple Recharts |
|---|---|
| Sin servicio adicional | Es una biblioteca dentro de la aplicación; el gráfico se dibuja en el navegador con los datos que ya autorizó la capa de aplicación |
| Hereda la autorización por consorcio | Recibe lo que devuelve el caso de uso, que leyó las vistas con el consorcio activo (research R-11 de `004-servicios`); no tiene acceso a la base |
| El dato no sale del sistema | Ninguna llamada externa; los importes viajan como cadena hasta el componente y se convierten a número sólo para la escala del dibujo |
| Accesible | Cada gráfico lleva debajo una tabla con los mismos datos, para lectores de pantalla y para quien prefiere el número (RNF-11) |

No se rectifica nada: las alternativas descartadas arriba siguen descartadas por las mismas razones.

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

Evaluación hecha al abrir la iteración 3 (septiembre de 2026), sobre la documentación pública de
cada proveedor en esa fecha. Se comparan los tres candidatos con oferta multimodal y capa gratuita o
costo marginal: **Google (Gemini API)**, **Mistral (La Plateforme)** y **Anthropic (Claude API)**,
este último combinado con **Voyage AI** para los vectores, que es el proveedor que la propia
documentación de Anthropic indica. OpenAI queda fuera en la primera fila: no tiene capa gratuita.
Escala: **✔** cumple · **~** cumple con condición · **✘** no cumple.

| Criterio | Google — Gemini API | Mistral — La Plateforme | Anthropic — Claude API + Voyage AI |
|---|---|---|---|
| C1 Capa gratuita suficiente | ~ Existe (modelos `flash` y `gemini-embedding` sin cargo, cuota diaria visible sólo en la consola del proyecto), **pero es incompatible con C3**: en la capa gratuita el contenido se usa para mejorar los productos | ~ Plan *Experiment* gratuito con límite de ~1 solicitud/s y ~1.000 millones de tokens/mes; la documentación lo declara "para evaluación, no para producción" | ✘ Sin capa gratuita. El volumen del punto 4.2 (900 comprobantes y 70 reclamos mensuales, ~1,5 M de tokens de entrada) cuesta del orden de **USD 2 a 8 por mes** según el modelo; Voyage ofrece 200 M de tokens de vectores sin cargo, más que suficiente |
| C2 Reemplazabilidad | ✔ REST y JSON con esquema | ✔ REST compatible con el formato de mensajes más difundido | ✔ SDK oficial y REST; las cuatro interfaces del punto 12.8.2 lo aíslan igual que a los otros dos |
| C3 Términos de tratamiento | ~ Sólo en la capa **paga** el contenido no se usa para mejorar productos; el tratamiento por cuenta del responsable requiere aceptar el anexo de protección de datos | ~ El plan gratuito comparte datos para entrenamiento salvo exclusión; los planes pagos permiten "sin telemetría" y retención cero | ✔ Los términos comerciales prohíben entrenar con el contenido de la API sin permiso expreso; retención máxima de 30 días y retención cero disponible por contrato |
| C4 Procesamiento de imágenes y documentos | ✔ Imágenes y PDF en línea | ✔ Imágenes y PDF en línea, más un modelo de OCR dedicado | ✔ Imágenes y PDF en línea, hasta 100 páginas |
| C5 Vectores semánticos | ✔ `gemini-embedding`, propio | ✔ `mistral-embed`, propio | ~ No tiene modelo propio; se combina con Voyage AI (`voyage-4`), que el criterio admite explícitamente |
| C6 Jurisdicción | ~ Procesamiento en EE. UU. por defecto | ✔ Empresa y procesamiento en la Unión Europea, que la autoridad argentina reconoce con nivel adecuado de protección (Ley 25.326, Disp. 60-E/2016) | ~ Procesamiento en EE. UU. por defecto; el parámetro de geografía de inferencia permite fijar región, con costo adicional |
| Límites de uso declarados | Por proyecto: solicitudes/minuto, tokens/minuto y solicitudes/día, visibles en la consola, no publicados | Por espacio de trabajo: solicitudes/segundo y tokens por minuto y por mes, visibles en la consola | Por organización, por nivel de gasto acumulado; el primer nivel alcanza para el volumen previsto |
| Costo al superar la capa gratuita | `gemini-2.5-flash`: USD 0,30 entrada / 2,50 salida por millón de tokens; vectores USD 0,20 por millón | `mistral-small`: USD 0,20 / 0,60 por millón; vectores USD 0,10 por millón | `claude-haiku-4-5`: USD 1 / 5 por millón; `claude-sonnet-5`: USD 2 / 10; Voyage `voyage-4`: USD 0,06 por millón |

Lo que la tabla deja claro antes de medir nada: **ningún candidato cumple C1 y C3 a la vez con su
capa gratuita**. En Google y en Mistral la gratuidad se paga con los datos, que es exactamente lo
que el punto 5.3.3 prohíbe para comprobantes con CUIT y reclamos con nombre y unidad. La
consecuencia es que C1 se reinterpreta como *costo marginal compatible con el precio del punto 6*
(del orden de USD 5 mensuales para toda la cartera), y con esa lectura los tres candidatos quedan
en pie y la decisión pasa a depender de las dos pruebas de concepto de § 8.4.3, que están en
`poc/` con sus juegos de datos en `datos-cliente/`.

### Decisión y justificación

**Se elige Google — Gemini API, en su capa paga**, para las cuatro interfaces del punto 12.8.2:
`gemini-3.5-flash` (o el `flash` vigente) como `ExtractorDocumental` y `ClasificadorTexto`,
`gemini-embedding-001` como `GeneradorVectores` y el mismo modelo de texto como
`GeneradorRespuesta`. El fundamento no es la tabla sola sino las dos pruebas de concepto de § 8.4.3,
ejecutadas el 11 de septiembre de 2026 contra los juegos de `datos-cliente/` y cuyo detalle por
comprobante y por pregunta queda en `poc/resultados/`:

| Prueba de concepto | Criterio | Resultado | Detalle |
|---|---|---|---|
| Extracción de comprobantes (30 archivos: 20 PDF digitales, 10 fotos y tickets con defectos) | ≥ 80 % de campos correctos sin corrección humana | **149 de 150 campos = 99,3 %** | Proveedor, CUIT, fecha e importe: 30 de 30. Rubro: 29 de 30; el fallo es una reja de portón clasificada como mantenimiento general en lugar de reparación extraordinaria de frentes, ambigüedad que la confirmación humana de RN-14 resuelve. Mediana 7,7 s por comprobante; 42.000 tokens de entrada en total |
| Búsqueda semántica (reglamento de 72 artículos, 20 preguntas) | ≥ 85 % con el artículo correcto entre los tres primeros | **20 de 20 = 100 %**, 19 en primer lugar | La línea de base léxica sin proveedor (TF-IDF) da 16 de 20; las cuatro que pierde son las preguntas formuladas con otras palabras que el reglamento («soy inquilino…», «se cortó el agua…»), que es exactamente lo que se compra con los vectores |

Tres observaciones de la ejecución pesan tanto como los porcentajes:

1. **La capa gratuita no sirve ni para la propia prueba de concepto.** La cuota diaria de cada
   modelo se agotó a mitad de corrida —tres veces, en tres modelos— y hubo que completar los 30
   comprobantes repartidos entre `gemini-3.5-flash` (C01 a C20), `gemini-3.8-flash` (C21 a C27) y
   `gemini-3.5-flash-lite` (C28 a C30). Confirma la lectura de C1 de la tabla: en producción se usa
   la capa paga, que además es la única que cumple C3. Con ~1.400 tokens de entrada por
   comprobante, los 900 mensuales del punto 4.2 cuestan del orden de **USD 2 a 3 por mes** para
   toda la cartera.
2. **La latencia es variable y a veces larga**: mediana de 7,7 s, pero hasta 86 s bajo carga del
   proveedor, con reintentos. La extracción no puede ser sincrónica con la carga del comprobante;
   entra por la cola de trabajos pendientes que ya existe desde la iteración 1, y el operador
   confirma cuando la propuesta está lista (RN-14).
3. **Los comprobantes son ficticios.** Grupo Delta es una organización construida para el
   ejercicio, así que los 30 archivos se generaron a partir del índice con tipografía de impresora
   y defectos simulados (inclinación, desenfoque, sombra, sello, total manuscrito). Una foto real
   de un ticket arrugado con luz de cocina va a rendir peor. El 99,3 % es un techo, no una
   estimación; el margen sobre el 80 % es lo que absorbe esa diferencia, y el indicador I-5 (campos
   corregidos por el operador) es la medición de verdad, sobre datos reales, desde el primer día de
   uso.

Los otros dos candidatos de la tabla no se midieron: no se contaba con credenciales y el primero
medido superó ambos umbrales con margen. Medirlos no cambia la decisión de construir `RF-06` y
`RF-20` completos, que es lo que la prueba de concepto tenía que decidir; podría cambiar el
proveedor, y para eso el diseño del punto 12.8.2 deja el costo del cambio en una implementación por
interfaz, sin tocar la lógica de negocio.

Con este resultado, **`RF-06`, `RF-12` y `RF-20` se construyen completos** (FR-002 de
`004-servicios` no se activa) y el riesgo RT-02 y el RT-03 del punto 11 quedan con su detonante
verificado en negativo.

La elección se difirió deliberadamente hasta esta etapa, y no se comprometió en la documentación de
análisis, por dos razones: porque es exactamente el punto donde la consigna la solicita, y porque el
diseño del punto 12.8.2 hace que la decisión sea reversible: la lógica de negocio depende de cuatro
interfaces del dominio, no de un proveedor. Comprometer un proveedor durante el análisis habría
introducido una dependencia que el diseño está construido para evitar.

### Verificación de la reemplazabilidad

Las tres implementaciones del punto 12.8.2 existen, y son exactamente tres archivos en
`src/infraestructura/asistencia/`:

| Archivo | Implementación | Qué hace |
|---|---|---|
| `gemini.ts` | La del proveedor | `@google/genai`: extracción con salida estructurada por esquema y `temperature 0`, clasificación, vectores de 768 dimensiones (`gemini-embedding-001`) y respuesta con citas. Un reintento ante 429/503 y después «no disponible» con motivo. Toda salida pasa por Zod antes de entrar al dominio |
| `determinista.ts` | La de pruebas | Expresiones regulares para CUIT, fecha e importe; rubro y urgencia por palabras; bolsa de palabras proyectada por hash como vector; cita el fragmento que comparte más palabras con sentido o se abstiene. Mismo texto, misma salida, sin red |
| `nula.ts` | La de degradación | Cada método responde «no disponible» con un motivo legible y nada lanza |

Las cuatro interfaces del dominio (`ExtractorDocumental`, `ClasificadorTexto`,
`GeneradorVectores`, `GeneradorRespuesta`, en `src/dominio/contratos/asistencia.ts`) devuelven
`Resultado<T>`: `{ disponible: true, valor }` o `{ disponible: false, motivo }`. Ningún caso de
uso conoce cuál de las tres corre: la elige una sola vez `src/aplicacion/dependencias.ts` según el
entorno (`FLAY_ASISTENCIA=determinista` → pruebas; `GEMINI_API_KEY` → proveedor; ninguna → nula).

La verificación es una prueba y no una afirmación: `pruebas/integracion/asistencia-implementaciones.spec.ts`
cuenta los archivos del directorio (exactamente tres), comprueba que cada uno expone las cuatro
interfaces, que la nula responde «no disponible» en los cuatro métodos sin lanzar y que la
determinista es idempotente (SC-012). Reemplazar el proveedor es escribir un cuarto archivo con la
misma forma y cambiar una línea en `dependencias.ts`; el resto del sistema, incluidas las pruebas
de extremo a extremo que corren con la determinista, no se entera.

## 14.4 Estándares de codificación

*Definidos al abrir la iteración 1 (FR-024 de `001-andamiaje`). Rigen desde el primer RF; lo escrito
después no los reabre.*

| Aspecto | Definición |
|---|---|
| Nomenclatura | Español en dominio y código de negocio (`Consorcio`, `liquidarPeriodo`, `coeficiente`); inglés solo para términos técnicos del framework (`route`, `middleware`). Archivos en minúsculas con guiones. Commits `RF-nn` + verbo. |
| Estructura de carpetas por capa | `src/app` (presentación) → `src/aplicacion` → `src/dominio` (+`contratos`) → `src/infraestructura`; transversal `src/compartido`. Dominio solo importa dominio/contratos/compartido (Principio III, FR-006/FR-012 de 001). |
| Manejo de errores | Mensajes comprensibles para usuario final (RNF-10): qué pasó, magnitud exacta y qué hacer. Nada de volcados técnicos en interfaz. Códigos de trazabilidad (`RF-`, regla `RN-`) en logs, no en pantalla. |
| Tratamiento de importes | Aritmética decimal de precisión fija en todo el sistema, conforme al punto 12.6. **Prohibido el uso de punto flotante para dinero**. Dominio: `Prisma.Decimal`, sin `number`; redondeo solo al final; serialización a interfaz como cadena. |
| Precisión de los coeficientes | Ocho decimales es la **capacidad** de la columna, no una obligación de escribir ocho: la suma tiene que dar exactamente `100.00000000` y un padrón de dos decimales la da igual. La pantalla usa los menos decimales que alcancen —tres unidades son `33.34 / 33.33 / 33.33`— y muestra los que el padrón tenga, sin ceros de relleno. |
| Sobrante de un reparto parejo | Va entero a la unidad de mayor coeficiente, la misma regla que el redondeo de una liquidación (§ 12.6). Se ofrece **sólo** si esa unidad no se mueve más de un **1 %** de su coeficiente: por encima de eso no es redondeo sino un padrón mal transcripto, y moverlo falsearía un dato del reglamento. Con 96 unidades y dos decimales, el sobrante sería `0.16 %` sobre una sola —un 15 % de lo suyo—, y por eso ahí la pantalla baja a más decimales en vez de ofrecer el ajuste. |
| Registro de eventos | JSON por línea con momento, usuario, consorcio, operación y resultado; sin datos personales fuera de lo necesario (Ley 25.326). Niveles info/aviso/error; el error incluye causa exacta y magnitud (p. ej. diferencia de coeficientes). |
| Comentarios | Solo el porqué no obvio y la referencia a regla (`RN-07 §7.2`, `RNF-06`). Nada de comentar el qué evidente. |
| Análisis estático y formato | Prettier + ESLint en cada envío (`verificar`): frontera de capas, sin aritmética monetaria (`flay/sin-aritmetica-monetaria`), sin cliente crudo fuera de infraestructura. `.editorconfig` `end_of_line = lf`. |

## 14.5 Métricas de la construcción

Las tres iteraciones están cerradas.

| Métrica | Planificado | Real | Desvío |
|---|---:|---:|---:|
| Esfuerzo total | 770 h | ≈ 40 h † | −730 h (−95 %) |
| Esfuerzo de la iteración 1 | 221 h | ≈ 16 h † | −205 h (−93 %) |
| Esfuerzo de la iteración 2 | 194 h | ≈ 4 h † | −190 h (−98 %) |
| Esfuerzo de la iteración 3 | 243 h | ≈ 20 h † | −223 h (−92 %) |
| Razón de productividad | 1,6 h/PF | ≈ 0,09 h/PF de reloj † | no comparable |
| Reserva de contingencia consumida | 214 h disponibles | 0 h | |

† No es una medición de horas persona: es tiempo transcurrido. Ver «Esfuerzo de la iteración 1».

La comparación entre la razón planificada y la real es el dato que valida o refuta el método de
estimación del punto 9, y debe informarse aunque el resultado sea desfavorable.

### Esfuerzo de la iteración 1 (§ 9, § 10)

El equipo **no llevó parte de horas**. La única medida que el repositorio conserva es el tiempo
transcurrido entre el primer y el último commit de cada etapa: es tiempo de reloj de sesiones de
trabajo continuas, no horas persona registradas. Se informa como lo que es —una aproximación, y por
arriba— porque la alternativa era no informar nada.

| Etapa | Planificado | Transcurrido | Ventana |
|---|---:|---:|---|
| `001-andamiaje` | 34 h | ≈ 4 h 45 | 2026-09-09 07:45 → 12:29 |
| `002-nucleo` | 187 h | ≈ 11 h | 2026-09-09 13:16 → 2026-09-10 (cierre) |
| **Iteración 1** | **221 h** | **≈ 16 h** | |

El desvío no refuta el método de estimación del punto 9: lo que cambió no es la productividad del
equipo sino el modo de construcción. La estimación por puntos función supone dos estudiantes
escribiendo el código a mano; la construcción se hizo en sesiones continuas asistidas, con la
especificación y las pruebas como entrada. La razón de 1,6 h/PF **no queda ni validada ni
refutada** por esta cifra, y las iteraciones 2 y 3 conservan su estimación original hasta poder
medirse del mismo modo.

Lo que la cifra sí dice es que el riesgo de cronograma de la iteración 1 no se materializó y que la
reserva de contingencia (214 h) sigue entera.

### Tiempo de la liquidación y de los documentos (RNF-07, SC-006, SC-007)

Medido el 2026-09-10 contra la base administrada en San Pablo, con `npm run medir:liquidacion` y con
la prueba de integración de documentos, ambas dentro de la puerta única.

| Medición | Corridas | Resultado | Límite |
|---|---:|---:|---:|
| Liquidación de **100 unidades**, sin documentos | 5 | 1.155 · 752 · 734 · 807 · 767 ms | 30.000 ms |
| Generación de los **96 documentos** del consorcio B | 1 | 38 s, en dos disparos | 10 min |

La liquidación cierra en menos de un segundo y medio en la peor corrida, veinticinco veces por debajo
del límite. Lo que la mantiene ahí es una decisión y no una casualidad: los cien detalles y sus
líneas de interés se escriben con **dos sentencias**, no con doscientas (decisión R-09). El mismo
bucle de a uno, contra una base remota, ya había hecho fallar la carga del padrón de 96 unidades:
noventa y seis idas y vueltas no entran en el tope de cinco segundos de una transacción interactiva.

Los documentos van por la cola de trabajos, en disparos acotados a veinte segundos: cada uno cierra
unos sesenta contra la base remota, y el administrador vuelve a apretar. Es el diseño (R-02), y los
96 salieron en dos disparos.

### Esfuerzo de la iteración 2

| Etapa | Planificado | Transcurrido | Ventana |
|---|---:|---:|---|
| `003-liquidacion` | 194 h | ≈ 4 h de reloj | 2026-09-10, de la clarificación al cierre |

Mismo criterio que la iteración 1: es tiempo transcurrido de sesiones asistidas, no horas persona,
y no valida ni refuta la razón de 1,6 h/PF del punto 9.

### Esfuerzo de la iteración 3

| Etapa | Planificado | Transcurrido | Ventana |
|---|---:|---:|---|
| `004-servicios` | 243 h | ≈ 20 h de reloj | 2026-09-11 17:24 → 2026-09-12 (cierre), en dos jornadas |

Mismo criterio que las anteriores: tiempo transcurrido de sesiones asistidas, no horas persona. La
iteración fue la más larga de las tres en reloj y la que más código dejó —cinco historias, cuatro
interfaces con doce implementaciones, seis indicadores, dos pruebas de concepto contra el proveedor
real—, y aun así cerró en menos de un décimo de lo planificado. La razón de 1,6 h/PF del punto 9
queda **sin validar** por este proyecto: mide otra forma de construir. Lo que sí queda validado es
el orden de magnitud relativo entre iteraciones (la 3 costó más que la 1 y que la 2, como el plan
preveía) y que la reserva de contingencia no se tocó.

### Duración de la puerta de verificación (FR-018 de `001`)

`npm run verificar` encadena análisis estático, pruebas de dominio, migraciones, deriva, pruebas de
integración, compilación y pruebas de extremo a extremo. El compromiso es cerrar en menos de diez
minutos: por encima de eso deja de correrse antes de cada envío, que es para lo que existe.

| Entorno | Base de datos | Duración | Límite |
|---|---|---:|---:|
| Local (Windows 11, Node 22.21) | Neon `sa-east-1`, con latencia de red | **3 min 49 s** | 10 min |
| Integración continua (`ubuntu-latest`) | PostgreSQL 18.6 en el mismo runner | **2 min 33 s** | 10 min |

Correrla **local contra la base administrada** no es redundante con la corrida remota: encontró un
defecto que la remota no puede encontrar. `TrabajoPendiente.proximo_intento` lo escribía el proceso
—el cliente de datos resuelve el valor por omisión en la aplicación— y se compara contra el reloj de
la base; en integración continua aplicación y base comparten máquina y el desfase es cero, pero
contra una base administrada son décimas de segundo y el trabajo recién encolado quedaba vencido en
el futuro. La cola escribe ahora la hora con el reloj de la base (SC-013b).

### Tiempo de respuesta del listado de gastos (RNF-06, SC-006)

Medido con `npm run medir:p95 /gastos` sobre el volumen anual completo —**10.800 gastos** cargados
por `npm run semilla:volumen`, repartidos en doce períodos de los dos consorcios de § 13.4—, contra
la base administrada en San Pablo. El arnés entra por el formulario de ingreso, como una persona:
sin sesión mediría la redirección, que es rápida y no dice nada.

| Medición | Muestras | p50 | p95 | Límite |
|---|---:|---:|---:|---:|
| `/gastos` **en caliente** | 50 | 287 ms | **363 ms** | 2.000 ms |
| `/gastos?pagina=5` en caliente | 50 | 287 ms | 353 ms | 2.000 ms |
| `/gastos` **en frío** (primer pedido tras el arranque) | 5 | 473 ms | 862 ms | informativo |
| `/api/salud` | 50 | 43 ms | 50 ms | 2.000 ms |

El objetivo de RNF-06 se cumple con margen: el percentil 95 en caliente está **cinco veces y media
por debajo** del límite. El arranque en frío se informa por separado, como exige SC-006b, y también
queda debajo del límite, aunque no es la cifra que RNF-06 compromete.

Que el listado paginado cueste lo mismo en la página 5 que en la primera es efecto del índice
`(consorcio_id, periodo_id, rubro_id)`: el filtro por consorcio que impone el aislamiento entra por
la cabecera del índice y no obliga a recorrer la tabla.

---

## Referencias

- Google. (2026). *Gemini API reference*. <https://ai.google.dev/api>
- Vercel. (2026). *Next.js documentation*. <https://nextjs.org/docs>
- Prisma. (2026). *Prisma ORM documentation*. <https://www.prisma.io/docs>
- pgvector. (2026). *Open-source vector similarity search for Postgres*.
  <https://github.com/pgvector/pgvector>
- Microsoft Research. (2024). *Playwright*. <https://playwright.dev>
- Deque Systems. (2026). *axe-core rules*. <https://github.com/dequelabs/axe-core>
- Fowler, M. (2002). *Patterns of Enterprise Application Architecture*. Addison-Wesley.
