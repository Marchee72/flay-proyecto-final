# Revisión cruzada del plan de construcción

**Etapa 3 de 4 del plan de construcción — Tarea T3.**
Revisor contra: constitución (5 principios), definición de terminado (§ 8.3.4),
grafo de `analisis-insumos.md` § 2, § 8.3.1, RNF-06/RNF-07 y ejecutabilidad de `001-andamiaje`.
Leído: `analisis-insumos.md`, `plan-etapas.md`, los cuatro `spec.md`,
constitución, § 8.3, § 12.1, § 12.6 y § 14.1.
Este documento es SOLO DE DEFECTOS y no modifica ningún `spec.md` ni `plan-etapas.md`.

**Veredicto de severidad máxima: no se encontró ningún defecto BLOQUEANTE.**
Ninguna etapa pone al dominio dependiendo de infraestructura ni hace imposible probar la
liquidación sin base de datos. Los dos puntos que más se acercan a bloqueante (I-01, I-04) se
señalan en su ficha. Total: **0 BLOQUEANTE · 12 IMPORTANTE · 10 MENOR**.

Formato de cada hallazgo: severidad | archivo y sección | qué está mal | por qué es un defecto |
qué habría que hacer.

---

## Defectos IMPORTANTES

### I-01 — La puerta única `verificar` exige una variable que ningún FR define

IMPORTANTE | `001-andamiaje/spec.md` FR-016 (guion `db:drift`) y FR-008 (`.env.example`) |
El guion `db:drift` usa `$env:SHADOW_DATABASE_URL`, pero FR-008 fija el contenido de
`.env.example` en exactamente cuatro nombres (`DATABASE_URL`, `AUTH_SECRET`,
`BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`) y ningún otro FR crea ni documenta
`SHADOW_DATABASE_URL`. En una máquina limpia, `npm run verificar` —la puerta única que
`plan-etapas.md` § 7.1 declara obligatoria— falla en el paso `db:drift` por variable
indefinida. | Es un defecto porque rompe el criterio SC-004 de la propia etapa y toda la
verificación etapa por etapa que cuelga de ese comando. | Agregar `SHADOW_DATABASE_URL` a
FR-008 (con valor local por defecto en `.env.local`), al servicio de base del flujo FR-018 y a
la comprobación de secretos si corresponde.

### I-02 — FR-010 opera sobre un rol de base que ningún paso crea

IMPORTANTE | `001-andamiaje/spec.md` FR-010, paso 5 |
El paso 5 ordena `REVOKE ... FROM <usuario_aplicacion>` con un marcador en lugar de un rol
real, y ningún FR de la etapa crea los roles de base (propietario vs. usuario de aplicación),
sus credenciales ni qué cadena de conexión usa cada entorno. | Es un defecto porque FR-010 no
es ejecutable tal como está escrito: quien lo sigue debe inventar el diseño de roles, y dos
ejecutores inventarán dos distintos, con implicancia directa en RNF-12 y en SC-006. |
Agregar un FR que defina los dos roles, dónde se crean (local, demostración), qué conexión usa
la aplicación y cuál el propietario, y referenciarlo desde FR-010 en lugar del marcador.

### I-03 — Las versiones se "fijan" después de instalar sin fijar nada

IMPORTANTE | `001-andamiaje/spec.md` FR-005 y FR-023; hueco H-02 |
FR-005 instala dependencias sin versión (`npm install prisma @prisma/client zod ...`) y FR-023
recién después "completa la columna Versión con los valores leídos de `package-lock.json`".
Dos ejecutores que corran FR-005 en momentos distintos obtienen árboles distintos; lo registrado
en FR-023 describe lo que tocó, no lo que el plan decidió. | Es un defecto porque H-02 exige
reproducibilidad y el inventario de licencias de § 5.3.4, y este orden no los da: la primera
instalación ya es irreproducible. | Fijar las versiones **antes** de instalar (rango exacto en
FR-005 o archivo de versiones referenciado) y dejar FR-023 como verificación contra el
bloqueo, no como descubrimiento.

### I-04 — La regla de capas no prohíbe el acoplamiento directo más probable del dominio

IMPORTANTE | `001-andamiaje/spec.md` FR-006, FR-012 y US-2 escenario 1; roza el Principio III |
La frontera se verifica con `no-restricted-imports` sobre importaciones relativas
(`@/infraestructura/...`, cliente crudo de Prisma) y la fixture es "un archivo en
`src/dominio/` que importa `@/infraestructura/...`". Un `import { PrismaClient } from
'@prisma/client'` (o `next-auth`, o el SDK de almacenamiento) **dentro de `src/dominio/`**
no coincide con ninguno de esos patrones y pasaría el linter. Además, ningún FR exige que el
dominio exponga sus puertos (repositorios, reloj, etc.) en `src/dominio/contratos`: las únicas
interfaces obligadas allí son las cuatro de IA (`004` FR-025) y la de almacenamiento
(`002` FR-019). | Es un defecto porque el Principio III queda guardado solo contra la forma
canónica de violarlo; la vía directa (importar el proveedor en el dominio) no está cerrada y
ningún puerto de repositorio está especificado. No llega a BLOQUEANTE porque ninguna etapa
**ordena** al dominio depender de infraestructura. | Extender FR-012 con una zona que prohíba
en `src/dominio` las importaciones de `@prisma/client`, proveedores y entorno web, agregar la
fixture negativa correspondiente a FR-022, y exigir un FR (en `001` o `002`) que declare los
puertos de repositorio del dominio en `src/dominio/contratos`.

### I-05 — La contención del dinero no cubre los indicadores, que también agregan dinero

IMPORTANTE | `004-servicios/spec.md` FR-017 a FR-020; `plan-etapas.md` § 7.3 |
La tabla de `plan-etapas.md` § 7.3 asigna la señal "un importe en punto flotante" a `002`
SC-009 y `003` SC-001/SC-003, y a ninguna verificación de `004`. Pero `004` FR-017 a FR-020
construyen agregaciones monetarias (morosidad, gasto por rubro, promedios móviles de 12
períodos, mediana y percentil 90) sin fijar dónde se calculan (vista `NUMERIC` en base vs.
JavaScript) ni con qué tipo viajan al panel. El promedio móvil de I-2, además, divide importes
y el plan no fija su redondeo ni su precisión. | Es un defecto porque el Principio II rige "en
cualquier capa, sin excepción" y los indicadores son la capa donde un `number` de JavaScript o
un `float` de agregación entraría sin que ningún SC lo detecte. | Fijar en `004` que los
cálculos de indicadores usan decimal de precisión fija en todos sus pasos (o `NUMERIC` en
vistas y cadena hacia la interfaz), extender la regla `flay/sin-aritmetica-monetaria` a ese
código, y agregar un SC de cuadratura decimal para I-1 a I-3.

### I-06 — La "exportación abierta" se verifica sin que ningún FR la construya

IMPORTANTE | `004-servicios/spec.md` FR-033; condición de § 5.5.4 |
FR-033 ordena que "las tres condiciones de verificación de § 5.5.4 —degradación ante fallas de
terceros, exportación abierta de los datos y prueba de concepto de `RF-20`— DEBEN quedar
verificadas y registradas". La degradación cuelga de RNF-14 y la PoC de SC-001, pero la
exportación abierta no tiene ningún FR que la construya en ninguna de las cuatro etapas:
ningún requisito produce el mecanismo exportador. | Es un defecto porque se verifica algo que
no se construye; el SC-018 correspondiente pasaría en el vacío. | Agregar el FR que construye
la exportación (formato, alcance por consorcio, autorización) en la etapa que corresponda, o
registrar explícitamente que la condición se satisface por otro medio ya construido y cuál es.

### I-07 — RNF-06 sin arnés: dos SC citan "p95" sin herramienta, entorno ni volumen

IMPORTANTE | `002-nucleo/spec.md` SC-006; `004-servicios/spec.md` SC-010; `001-andamiaje` sin FR |
Criterios textuales: *"el listado filtrado de `RF-10` responde en **menos de 2 segundos en el
percentil 95** sobre 100 consultas (RNF-06)"* y *"responde en **menos de 2 segundos en el
percentil 95** sobre 100 cargas (RNF-06)"*. Ningún FR de `001-andamiaje` instala herramienta
de medición (ni guion propio ni dependencia), ninguno fija el entorno de medición (local con
contenedor vs. demostración en capa gratuita, cuyos tiempos difieren) ni el volumen sembrado
al medir (10.800 gastos en `002`; ~600.000 registros en `004`). Además RNF-06 rige el 95 % de
**las consultas**, pero solo dos lecturas tienen SC; estado de cuenta, listados de reclamos y
agenda de reservas quedan sin presupuesto verificado. | Es un defecto porque el presupuesto de
rendimiento queda enunciado pero no ejecutable: cada medición futura elegirá su propio método.
| Agregar en `001` un FR con el arnés (guion `medir:p95`, entorno, semilla de volumen,
umbral como puerta), y en `002`/`004` extender el SC a las lecturas principales o declarar
cuáles quedan fuera y por qué.

### I-08 — La generación diferida de documentos no tiene ningún presupuesto temporal

IMPORTANTE | `003-liquidacion/spec.md` SC-007 y FR-016; RNF-07 |
Criterio textual: *"La emisión sobre 96 unidades produce **96** documentos, ni uno menos"*.
RNF-07 excluye los documentos del presupuesto de 30 s (decisión 5 de § 12.1.3) y el plan no
les pone ningún otro: ni tiempo máximo del trabajo diferido, ni observabilidad (progreso,
reintento, alerta), ni conducta ante el caso RT-05 si no cierra. SC-006 tampoco fija entorno
ni juego de datos de la medición de 30 s. | Es un defecto porque el trabajo más pesado del
sistema (96 documentos por liquidación) queda sin SLO: puede tardar horas sin violar ningún
criterio. | Fijar el presupuesto del trabajo diferido, el entorno y la semilla de medición de
SC-006, y un SC de completitud temporal con reintento observable para SC-007.

### I-09 — "Verificación automática de WCAG" citada sin herramienta que la ejecute

IMPORTANTE | `002-nucleo/spec.md` SC-011; `003-liquidacion/spec.md` SC-016; `004` cierre cond. 4 |
Criterio textual: *"pasan la **verificación automática de WCAG 2.1 AA** sin infracciones de
nivel A o AA (RNF-11)"*. `001-andamiaje` FR-015 configura Playwright pero no instala ningún
analizador de accesibilidad (p. ej. `axe-core`) ni define el guion que lo corre dentro de
`verificar`. | Es un defecto porque tres etapas cuelgan su condición 4 de una capacidad que la
etapa 0 no construye: el SC no es ejecutable con lo que `001` entrega. | Agregar a `001`
FR-015/FR-016 la dependencia del analizador, su guion y su umbral (0 infracciones A/AA en
pantallas del consorcista), o rebajar los SC a revisión manual con método explícito.

### I-10 — El cierre de `004` afirma teléfono y auditoría sin respaldo medible

IMPORTANTE | `004-servicios/spec.md`, tabla "Cierre contra la definición de terminado" |
Condición 4, textual: *"El reclamo y la reserva son los flujos que el consorcista usa desde el
teléfono; **se verifican a 390 px con WCAG 2.1 AA** (RNF-01, RNF-11)"* — no existe ningún SC
de `004` que mida 390 px ni WCAG (la serie SC-001 a SC-019 no los menciona). Condición 7:
*"FR-032"* — cita un requisito de trabajo, no un resultado medible; a diferencia de `002`
SC-007 y `003` SC-012, `004` no cuenta asientos por operación en sus tablas nuevas. | Es un
defecto porque la tabla de cierre certifica dos condiciones sin evidencia definida: el cierre
pasa aunque nadie mida. | Agregar un SC de teléfono/WCAG para reclamo y reserva (apoyado en
I-09) y un SC de auditoría que cuente un asiento por operación sobre cada tabla económica
nueva de la etapa.

### I-11 — La condición 3 de `002` verifica consorcio pero no rol

IMPORTANTE | `002-nucleo/spec.md` SC-002 y FR-002 |
FR-002 exige autorización por **par (rol, consorcio)** en cada operación, pero SC-002 solo
mide la dimensión consorcio: *"un usuario sin habilitación vigente obtiene **cero filas**,
tanto por listado como por identificador directo"*. Ningún SC de la etapa verifica que un
usuario habilitado **no ejecute acciones fuera de su rol** (p. ej. un consorcista invocando
alta de gasto o administración de usuarios). | Es un defecto porque la mitad de la condición 3
("por rol") queda sin prueba en la etapa que construye los roles, y es exactamente la
condición que la constitución declara no negociable. | Agregar un SC de matriz rol×acción
sobre las operaciones de escritura de la etapa (denegación por rol con habilitación vigente).

### I-12 — `001` arranca con una decisión sin tomar que condiciona todo el bloque B

IMPORTANTE | `001-andamiaje/spec.md` FR-001 y Assumptions |
FR-001 fija cinco proveedores concretos pero su nota y la Assumption aclaran que *"requieren
ratificación explícita del equipo antes de contratar"*; todo el bloque B (proyecto, CI,
entornos, despliegue FR-019) cuelga de esa ratificación. | Es un defecto de ejecutabilidad
porque el primer bloque de la primera etapa no puede correrse sin una decisión que el plan
declara pendiente, y el plan no fija ni el momento ni el mecanismo de ratificación. No es
BLOQUEANTE porque la propuesta existe y la aplicación es portable. | Fijar el paso 0 de la
etapa (quién ratifica, cuándo, y regla por defecto: la propuesta rige si no hay objeción en
la reunión de arranque), incluyendo las cláusulas de Ley 25.326 de § 5.5.4 en la ratificación.

---

## Defectos MENORES

### M-01 — FR-001 numera etapas que no existen en el plan

MENOR | `001-andamiaje/spec.md` FR-001, tabla de correo |
Dice que el correo es *"necesario ya en la **etapa 2** para la invitación"* y que el
despachador general llega *"en la **etapa 4**"*. El plan numera etapas 0 a 3
(`plan-etapas.md` § 1): la invitación vive en `002` (etapa 1) y el despachador en `004`
(etapa 3). | Desvío de un número con consecuencia de calendario: contratar el correo "en la
etapa 2" lo pondría una etapa tarde respecto de `002` FR-006/H-06. | Corregir a "etapa 1" y
"etapa 3 (`004-servicios`)".

### M-02 — Dependencia RF-09 → RF-08 sin fundamento, que serializa pagos tras documentos

MENOR | `analisis-insumos.md` § 2 (fila RF-09 y diagrama) y `plan-etapas.md` § 3 (fila RF-09) |
Ambos listan a RF-09 dependiendo de RF-08, pero la imputación necesita `DetalleLiquidacion`
(RF-07), no los documentos descargables (RF-08). Dentro de `003`, el orden 4.2 → 4.3 → 4.4
deja los pagos después de la generación documental. | Si la generación (riesgo RT-05) se
atrasa, los pagos se atrasan sin necesitarla. | Justificar la arista o quitarla y permitir
4.4 en paralelo a 4.3 tras 4.2.

### M-03 — La columna "Depende de" del plan no coincide con el grafo

MENOR | `plan-etapas.md` § 3 vs. `analisis-insumos.md` § 2 |
La fila RF-14 del plan lista `RF-07, RF-11, RF-16, RF-18` mientras el grafo lista además
RF-08 y RF-13; la fila RF-16 lista `RF-15, RF-09` mientras el grafo agrega RF-02 y RF-03. |
Dos fuentes del mismo plan dicen dependencias distintas para el mismo RF; el implementador no
sabe cuál es contractual. | Unificar el criterio de la columna (directas vs. transitivas) y
alinear ambas tablas, en particular RF-14 con RF-13 (avisos de cambio de estado, FR-013).

### M-04 — `002` prueba RN-03 contra un estado "liquidado" que aún no existe

MENOR | `002-nucleo/spec.md` FR-017 |
Como `003` aún no construyó la máquina de estados, FR-017 prueba el rechazo *"con un período
marcado como liquidado por la propia prueba"*. | El contrato real (enum, transiciones, quién
puede marcar) se definirá después; la prueba de `002` puede pasar contra un estado fabricado
que no coincida con el de `003`. | Definir ya en `002` el contrato mínimo del estado en
`src/dominio/contratos` (valores y transiciones válidas) y que ambas etapas lo compartan.

### M-05 — Saldo a favor y tasa aplicada: importes sin campo asignado

MENOR | `003-liquidacion/spec.md` FR-025 y FR-026; tabla Key Entities |
FR-026 ordena que el excedente *"quede a favor de la unidad"* sin decir en qué entidad o
campo vive; FR-025 ordena que la tasa *"quede registrada junto al cálculo"* sin asignarle
campo (el coeficiente sí tiene el suyo por RN-02/FR-012). | Dos importes económicos sin
residencia definida: cada implementador inventará la suya y la reconstrucción de RN-02 queda
incompleta para intereses. | Asignar entidad y campo a ambos (p. ej. campo en `Unidad` o
`Pago` para el saldo; campo en `DetalleLiquidacion` para la tasa).

### M-06 — La secuencia de `001` no es re-ejecutable ni fija el runtime

MENOR | `001-andamiaje/spec.md` FR-003 a FR-008 |
Tres gaps chicos: (a) FR-004 usa `create-next-app@latest` sin fijar versión; (b) FR-007 falla
si el contenedor `flay-db` ya existe y FR-008 duplica líneas de `.gitignore` y sobrescribe
`.env.local` (con secretos) al re-ejecutarse; (c) FR-003 exige Node 22/npm 10 pero nada lo
fija (`engines`, `.nvmrc`, versión en el flujo FR-018). | La historia promete "sin tomar
ninguna decisión" y SC-001 "menos de 30 minutos", pero un segundo ejecutor o una re-ejecución
divergen o rompen. | Fijar la versión del generador, agregar guardas idempotentes
(`--replace`/verificación previa, `.env.local` solo si no existe) y fijar el runtime en
`engines` + `.nvmrc` + `setup-node`.

### M-07 — Concurrencia de SC-011 sin método de prueba

MENOR | `003-liquidacion/spec.md` SC-011 |
*"Un segundo intento de liquidar un período ya liquidado falla en el **100 %** de los casos,
**incluida la ejecución concurrente**"*. | Ningún FR ni arnés describe cómo se ejerce la
concurrencia (disparo paralelo, barrera, aislamiento de la prueba). | Fijar el método (p. ej.
dos ejecuciones concurrentes contra el mismo período en prueba de integración) o acotar el SC
al caso secuencial.

### M-08 — "0 datos reales" sin método de verificación

MENOR | `004-servicios/spec.md` SC-019 |
Criterio textual: *"con datos ficticios (§ 13.4) y **0** datos reales de personas"*. | El
cero es verificable en intención pero el plan no dice cómo (auditoría de semillas, búsqueda
de patrones, revisión). | Fijar el método (p. ej. la demostración corre solo sobre la semilla
ficticia versionada y se registra su hash).

### M-09 — FR-019 describe el despliegue sin cableado ni plan de fallo

MENOR | `001-andamiaje/spec.md` FR-019 |
Ordena aplicar `db:deploy` y publicar "ninguna acción manual", sin decir de dónde salen los
secretos del entorno de demostración, qué pasa si la migración falla a mitad de despliegue,
ni cómo se verifica "sin tráfico hasta migrar" (US-3 escenario 3). | El flujo quedará a
criterio del implementador en el punto más riesgoso del pipeline. | Completar FR-019 con
origen de secretos, orden migrar-antes-de-servir y conducta ante migración fallida
(deploy bloqueado, alerta, sin rollback manual sobre la base).

### M-10 — FR-011 queda sin SC propio dentro de `001`

MENOR | `001-andamiaje/spec.md` FR-011; cierre cond. 3 |
El mecanismo de aislamiento "y su prueba" se promete en el cierre de la condición 3, pero
ningún SC de `001` (SC-001 a SC-012) lo nombra: su verificación real aparece recién en `002`
SC-003. | La etapa que entrega el mecanismo no lo mide; si el mecanismo nace roto, `001` cierra
igual. | Agregar un SC en `001` (falla sin contexto de consorcio; suites en verde sobre
modelos de prueba) o declarar explícitamente el diferimiento a `002`.
