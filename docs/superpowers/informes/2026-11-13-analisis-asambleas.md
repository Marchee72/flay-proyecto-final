Corregido en las ramas fix/asambleas-votacion, fix/asambleas-acta y fix/asambleas-sala (ver el plan 2026-11-13-correcciones-asambleas.md); fuera de alcance: B-6, B-7, B-9, B-11 y las mejoras 1 a 9.

# Análisis de asambleas — convocatoria, sala en vivo y acta

**Fecha:** 13/11/2026 · **Versión:** `main` @ `a00ab15` · **Alcance:** todo lo de 016 (RF-29 a RF-33): convocatoria, poderes, sala en vivo, votación, decisión provisoria y oposición, observaciones, notas, borrador con IA, firmas y PDF.
**Método:** lectura completa del código (`src/dominio/asambleas`, `src/aplicacion/asambleas`, las pantallas, las rutas y las migraciones `20261103120000_asambleas` y siguientes) y una reunión real de punta a punta con **siete sesiones en paralelo** (contextos aislados de Playwright, cada uno con su usuario). No se tocó código.

## Entorno

- `next dev` en `:3100` contra la **base Docker local** (`flay-db`, puerto 5434), con las variables del `.env` puestas en el proceso para pisar `.env.local`.
  - **Ojo:** `.env.local` apunta a la base **Neon de preview** y Next le da prioridad. El primer arranque de esta sesión fue contra Neon: ahí solo quedaron unos 5 registros de `IntentoInicioSesion` fallidos (cuatro con `asam.clara@flay.demo`, que no existe allá, y uno con `vecino1a@flay.demo`). No se escribió nada más.
- Ably configurado (`ABLY_API_KEY`), Gemini configurado (el borrador del acta es de Gemini), correo simulado y R2 del `.env`.
- Al estar en modo desarrollo, las latencias **no** son representativas de producción (ver M-9).

### Datos de prueba creados (base local)

En **Edificio Usabilidad** (9 unidades, 11,11 % cada una; la 1A tiene 11,12 %), clave `flay1234`:

| Unidad | Persona | Usuario | Rol |
|---|---|---|---|
| 1A | Pablo Prueba | `asam.pablo@flay.demo` | consorcista |
| 1B | Clara Consejo | `asam.clara@flay.demo` | consejo + consorcista (dirige) |
| 1C | Sofia Secretaria | `asam.sofia@flay.demo` | consorcista |
| 2A | Fede Firmante | `asam.fede@flay.demo` | consorcista |
| 2B | Gabi Garcia | `asam.gabi@flay.demo` | consorcista |
| 2C | Hugo Sincuenta | — (solo correo) | — |
| 3A | Ines Ausente | `asam.ines@flay.demo` | consorcista |
| 3B | Raul Representado | `asam.raul@flay.demo` | consorcista |
| 3C | (sin propietario) | — | — |

El consorcio quedó con regla de mayoría **totalidad** y anticipación de 1 día. Para poder abrir hoy, a las dos asambleas se les corrió `fecha_hora` al pasado con `session_replication_role = replica`, solo en la base local.

- **«Asamblea de prueba en vivo»** (`9d2fd0d4…`): convocada, poder de Raúl (3B) a Pablo, abierta, 7 acreditados, constituida en primera, tres puntos (absoluta, dos tercios y por opciones), observaciones, finalizada, acta con borrador de IA, enviada a firmar y firmada. **Quedó trabada en «a firmar» por el bug A-1.**
- **«Asamblea sin quórum»** (`17a933bd…`): abierta con 2 presentes. **Quedó en curso para siempre por el bug A-4.**

## Resumen

| Severidad | Cantidad | Confirmados en el navegador |
|---|---|---|
| Alta | 4 | 4 |
| Media | 7 | 7 |
| Baja / riesgo teórico | 12 | 4 |
| Mejoras | 9 | — |

---

## Alta severidad

### A-1. Si los dos últimos firmantes firman a la vez, el acta queda trabada para siempre ✅ confirmado

`firmar` (`src/aplicacion/asambleas/acta.ts:494`) decide si la firma es la última con una lectura previa y sin candado: `faltan = firmantes sin firmar distintos de mí`. Pablo y Fede firmaron a la vez y cada uno vio al otro pendiente, así que los dos tomaron la rama «no soy el último». Resultado en la base: **4 firmas, acta `a_firmar`, `documento_id` nulo y asamblea `finalizada`.**

No hay salida: ya no queda nadie que firme, `reemplazarFirmante` solo acepta pendientes y ningún disparador cierra el acta al completar las firmas. El recordatorio de los 10 días (`recordatorios.ts`) le va a pedir a quien dirigió que «reemplace a quien no pueda firmar», y eso no se puede.

**Arreglo sugerido:** dentro de la transacción, `SELECT … FOR UPDATE` sobre `ActaAsamblea` (como el candado de `confirmarPagoEnLinea`, nota 29) y recontar las firmas con `tx` después del candado. Como red, una acción idempotente «completar acta» que, con 4 firmas y estado `a_firmar`, genere el PDF y cierre. Generar el PDF fuera de la transacción ya obliga a esa segunda vuelta.

### A-2. Acreditar a mano vincula la unidad a *cualquier* titular con usuario, aunque el nombre no coincida ✅ confirmado

`acreditar` (`conducir.ts:223-231`):

```ts
titulares.find((t) => t.usuarioId && t.nombre.toLowerCase() === nombre.toLowerCase()) ??
titulares.find((t) => t.usuarioId)   // ← cae acá con cualquier nombre
```

Prueba: Clara acreditó la 2A a nombre de **«Pedro Hermano»** (un familiar presente). En la base, `representante_id` quedó apuntando al **usuario de Fede**, el titular, que no estaba. A partir de ahí:

- Fede **votó desde su casa** por la 2A, y el voto se contó.
- En «Presidente/Secretario» aparece «2A — Pedro Hermano (Fede Firmante)»: elegirlo designa a Fede.
- En el acta aparece «Pedro Hermano (2A)» como posible firmante. Elegido, **el firmante registrado es Fede** y Fede firmó.

Es un problema de legitimidad del voto y de la firma (Ley 25.506 art. 5: firma quien no estuvo). `votar` (`votar.ts:85`) y `ver.ts:424/531` repiten el mismo atajo para `representanteId` nulo, así que también está duplicado.

**Arreglo sugerido:** sacar el segundo `find`. Si el nombre no coincide con un titular con usuario, la acreditación queda sin usuario (vota por carga manual). Mejor todavía: que el formulario elija explícitamente «el titular X (con cuenta)» u «otra persona», en vez de deducirlo del texto.

### A-3. Quien llega tarde pierde el derecho de oposición, y su silencio deja de contar ✅ confirmado

La regla «ausente» se evalúa contra el padrón **al momento de leer**, no contra quién estaba **cuando se votó el punto**:

- `ver.ts:470` (`puedoOponerme`), `oposicion.ts:38` (`validar`) y el disparador `fn_oposicion_reglas` (migración, línea 727) exigen `presente = false` **hoy**.
- `provisoria.ts:39` salta las unidades `presente` al sumar el silencio como conformidad.

Prueba: el punto 1 se aprobó **provisorio** (4 de 7 presentes, 4 de 9 sobre el total). A Inés (3A, ausente) le llegó «Decisión provisoria… Podés oponerte desde Flay». Llegó tarde y se acreditó antes del punto 2. En la asamblea finalizada ve «Los ausentes pueden oponerse hasta el 28/11» pero **no tiene botón para oponerse**, y la base se lo rechazaría («Solo puede oponerse el propietario de una unidad ausente»). Su unidad tampoco suma como conformidad silenciosa. Las dos cosas pueden mover el resultado firme/caída.

**Arreglo sugerido:** congelar al cerrar el punto quiénes estaban ausentes con voto (por ejemplo, un arreglo `ausentesConVoto` en `conteo` o una tabla hija) y usar **eso** en `estadoDecision`, en `puedoOponerme`, en `validar` y en el disparador.

### A-4. Si no hay quórum, la asamblea no se puede cancelar desde la sala ✅ confirmado

El dominio permite `en_curso → cancelada` sin constituir (`estado.ts:60-61`, `fn_asamblea_reglas`), y el error de finalizar lo indica: «Si no alcanzó el quórum, se cancela». Pero el botón «Cancelar» solo existe con la asamblea **convocada** (`page.tsx:182`); la sala (`direccion.tsx`) no lo ofrece. En la prueba, «Asamblea sin quórum» quedó en curso **sin ninguna acción posible** salvo esperar la segunda convocatoria y constituir con cualquier presente. Si no aparece nadie, queda «En curso» para siempre, con la sala sondeando.

**Arreglo sugerido:** en el paso 1 de la sala, mientras no esté constituida, un «Cancelar por falta de quórum» que llame a `accionCancelar` (con `conAviso`).

---

## Media severidad

### M-1. Notas del acta: el último que guarda pisa al otro ✅ confirmado

Quien dirige y el secretario/a escriben en el mismo `notas` del punto abierto (`notas-acta.tsx`), con un `textarea` no controlado y guardado automático cada 1 s. Clara escribió «se presentaron tres presupuestos…» y Sofía «Gabi pidió pintura lavable». En la base quedó **solo lo de Sofía**, y Clara no se entera, porque su campo sigue mostrando su texto. Esas notas son la fuente del borrador de IA.
**Sugerencia:** notas por autor (`notas` de dirección y de secretaría por separado), o anexar en lugar de reemplazar, o un control de versión (`actualizadoEn` esperado) que avise «otra persona cambió las notas».

### M-2. Abrir la asamblea no llega en vivo a quien espera en la pantalla ✅ confirmado

`accionAbrir` no pasa por `conAviso`, y `SalaEnVivo` se monta solo con `estado === 'en_curso'` (`page.tsx:67`). Raúl tenía la asamblea convocada abierta: **15 s después** de que Clara la abrió, seguía viendo «Convocada» con el botón «Revocar». Al tocarlo recibió «La asamblea ya se abrió». Pasa lo mismo con «Cancelar» de una convocada.
**Sugerencia:** montar la escucha también en `convocada` (un sondeo lento alcanza) y publicar en `accionAbrir` y `accionCancelar`.

### M-3. Las opciones se separan por coma: una opción con coma se parte ✅ confirmado

«Brillo S.A., Limpiar, Inc., Higiene Total» quedó guardado como **cuatro** opciones («Limpiar» e «Inc.» por separado), y así se votó. Razones sociales con coma («Limpiar, Inc.», «Pérez, Gómez y Asoc.») son comunes.
**Sugerencia:** una opción por renglón, o una lista de campos con «Agregar opción».

### M-4. Los botones de la sala no tienen estado «enviando»: el doble clic da error ✅ confirmado

«Verificar quórum y constituir», «Designar», «Abrir el punto», «Acreditar» y «Cargar voto» usan `useTransition` pero no deshabilitan el botón. En la prueba, la primera pulsación constituyó, la pantalla tardó en refrescar, y la segunda devolvió el toast rojo «La asamblea ya está constituida.». En una reunión real, con conexión de teléfono, esto confunde a quien dirige.
**Sugerencia:** `disabled={pendiente}` con el mismo `BotonEnviar` que ya usa «Finalizar».

### M-5. En la sala, una decisión provisoria se ve como «Aprobado» a secas ✅ confirmado

Durante la reunión, el orden del día (`avance-orden.tsx`) muestra el punto 1 como «Aprobado». Recién en la asamblea finalizada aparece «Aprobado · Provisoria». Los presentes se van creyendo que quedó firme.
**Sugerencia:** la etiqueta «Provisoria» también en la sala, con el plazo.

### M-6. El borrador de IA sale sin tildes y con cifras en tono de planilla ✅ confirmado

Texto real de Gemini: «Se trato la pintura del hall y la mocion resulto aprobada… contando con 7 presentes con voto y **0 no votaron**», o «**1 no votaron**». El prompt de `gemini.ts:485-495` está escrito sin acentos («Redactas… del dia… reunion») y el modelo lo copia. Además se coló **«Gabi pidió…»**: la nota 32 dice que al redactor no le llegan personas, pero las notas y las observaciones son texto libre y traen nombres.
**Sugerencia:** prompt con ortografía correcta y la instrucción explícita de usar tildes y omitir «0 no votaron». Pedirle que reemplace los nombres propios de las notas por fórmulas impersonales, o documentar que el texto libre puede traerlos.

### M-7. La unidad sin propietario cuenta en la base total y como «silencio conforme» ⚠️ observado en el conteo

La 3C no tiene titular: nadie puede acreditarla ni oponerse, y no se le notifica nada. Igual suma a `baseTotal` (el conteo guardado dice 9 unidades) y, vencido el plazo, `estadoDecision` la cuenta **a favor** por silencio. Con regla «totalidad», eso puede tanto impedir una aprobación directa como volver firme una provisoria. Puede ser lo correcto según el reglamento, pero hoy es implícito.
**Sugerencia:** decidirlo explícitamente (¿una unidad sin titular cuenta en la base?) y, como mínimo, avisarle a quien convoca qué unidades no tienen a quién notificar (hoy solo se avisa de los propietarios sin contacto).

---

## Baja severidad y riesgos teóricos

| # | Hallazgo | Dónde | Estado |
|---|---|---|---|
| B-1 | **Cierre de punto contra voto en vuelo:** `cerrarPunto` lee los votos fuera de la transacción y sin candado. Un voto que entra entre esa lectura y el `UPDATE` queda guardado (el disparador ve el punto abierto) pero no contado: el acta listaría un voto que no está en el conteo. | `conducir.ts:411-475` | código |
| B-2 | **Carga manual contra voto propio:** `cargarVoto` lee el previo y después hace `upsert`. Si la unidad vota en ese intervalo, la carga manual pisa el voto propio (FR-022). El disparador no protege `origen`. | `votar.ts:112-117` | código |
| B-3 | **Acreditar «como apoderado» por nombre no verifica que exista un poder.** Basta escribir un nombre. | `conducir.ts:213-246` | código |
| B-4 | **«Tomar la dirección» no pide confirmación ni avisa** a quien dirigía. Cualquier consejero se la saca en medio de un punto, y el modal que el otro tenía abierto falla con «No dirigís». | `direccion.tsx:250`, `conducir.ts:497` | código |
| B-5 | **Reemplazar firmante** acepta a cualquier presente con usuario, también apoderados (`designarFirmantes` exige propietarios), y mantiene el rol: un «presidente» reemplazado por quien no presidió sigue figurando como «Presidente». | `acta.ts:587-599` | código |
| B-6 | **El PDF final se regenera desde la vista actual** en la última firma. La huella firmada es la del PDF de contenido; el documento final son otros bytes, armados después. La hoja de firmas cita la huella, pero nada garantiza que el cuerpo sea idéntico. | `acta.ts:505-519` | código |
| B-7 | **`verificarHuella` descarga los dos PDF en cada visita** a la pantalla del acta. | `acta/page.tsx:72-77` | código |
| B-8 | La observación sin guardar se pierde al finalizar, y **solo se le advierte a quien dirige**: a Gabi, que estaba escribiendo, nadie le avisó. | `direccion.tsx:521` | ✅ |
| B-9 | Un toast de error viejo («La asamblea ya se abrió…») **sigue en pantalla** durante toda la reunión, porque `?error=` queda en la dirección y el problema no se va solo (nota 24). En la sala confunde. | sala | ✅ |
| B-10 | En «Presidente/Secretario», quien representa varias unidades aparece con la etiqueta de la **última**: «3B — Pablo Prueba (Raul Representado)». | `direccion.tsx:269-275` | ✅ |
| B-11 | Quien otorgó un poder igual ve «Estoy presente (3B)» y compite con su apoderado («gana el primero»). En la sala el poder ya no se muestra. | `ver.ts`, `sala.tsx` | ✅ |
| B-12 | El comentario de `accionObservacion` dice «se guarda sola mientras se escribe» y es un botón; además publica un aviso en vivo a toda la sala por cada guardado. Medido: sin impacto visible (el sondeo base ya hace unos 2 refrescos cada 12 s). | `acciones.ts:327` | ✅ |

---

## Mejoras (no son defectos)

1. **Acreditar antes de la hora.** Hoy no se puede abrir (y por lo tanto acreditar) antes de `fechaHora`. En la práctica la acreditación arranca 15–30 min antes. Se podría abrir la acreditación antes, y que el reloj decida solo la constitución, como ya hace.
2. **Notas fuera de los puntos.** Las notas solo se escriben con un punto abierto. Lo que pasa en la constitución o entre puntos (mociones de orden, quién se retiró) no tiene dónde ir.
3. **Resultados en vivo durante la votación.** Todos ven el conteo parcial mientras se vota, lo que puede inducir el voto. Es una decisión de producto; podría ser configurable o mostrarse recién al cerrar.
4. **Retiros de la sala.** La presencia solo va de ausente a presente; quien se va antes sigue contando para la base de los puntos siguientes. Hoy no hay forma de registrarlo.
5. **Apoderados posibles** incluye a los administradores (aparece «Administrador de plataforma»). Muchos reglamentos prohíben que la administración sea mandataria; convendría excluirla o advertirlo.
6. **Texto de la convocatoria:** «Un propietario no tiene cuenta en Flay: **les** llega…» (concordancia) y no dice cuál es.
7. **Latencia en vivo:** en `next dev`, con 7 sesiones, un punto abierto tardó entre 8 y 25 s en aparecer en todos los teléfonos. Hay que medirlo con `next build` antes de sacar conclusiones, pero conviene un objetivo explícito (por ejemplo, p95 < 3 s).
8. **Vista de teléfono de la sala:** no se probó en 390×844 en esta pasada. El panel de asistentes abierto por defecto probablemente estorbe en el teléfono.
9. **Firma sin contraseña:** `firmar` exige `claveDerivada`. Si algún usuario entra solo por enlace (RF-03) y no tiene clave, verá «contraseña incorrecta» sin explicación. Conviene confirmar si ese caso existe.

---

## Lo que funcionó bien

- **Poderes:** el otorgamiento, el aviso a los dos, el bloqueo de la revocación con mensaje claro una vez abierta, y la carrera propietario/apoderado («gana el primero», con aviso al que perdió).
- **Quórum:** el mensaje de rechazo es preciso («Hay 22,22 %… A partir de las 15:06 se puede constituir en segunda»).
- **Cómputo doble:** absoluta, dos tercios y pluralidad dieron lo esperado. El empate por unidades dio «Sin decisión» aunque una opción ganaba por coeficiente (11,12 % de la 1A).
- **Decisión provisoria:** se detectó bien al cerrar y la notificación llegó al ausente con el plazo correcto (15 días).
- **Inmutabilidad:** los disparadores sostienen el padrón congelado, los votos, el orden del día y el acta. La huella SHA-256 se verifica como «Íntegra».
- **En vivo:** acreditaciones, votos y cierres se propagan solos a todas las sesiones. Lo que alguien está escribiendo (observaciones) no se pierde con el refresco.
- **El borrador de IA** respeta los números recibidos y aclara la decisión provisoria.

## Qué no se probó

Unidades sin voto por mora (hace falta deuda liquidada), constitución en segunda convocatoria, oposición en papel, el recordatorio diario de firmas, el reemplazo de firmante, el `.ics`, la vista de teléfono y la asamblea con la administración no invitada.

## Para limpiar

Los datos viven en la base local. Para volver atrás: borrar las dos asambleas (caen en cascada, ver nota 30, aunque el acta y los votos tienen disparadores que impiden borrar hijos sueltos), las 8 personas `asam.*@flay.demo` con sus usuarios, ocupaciones y habilitaciones, y devolver el consorcio a `presentes` / 15 días. También se puede dejar todo para reproducir A-1, A-3 y A-4.
