# Sugerencias en su propia pantalla y marca visual de la IA — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sacar las sugerencias de configuración del pie de cada documento a una pantalla
`documentos/sugerencias` a la que se llega por un aviso en Documentación, y darle a todo lo que
produce la IA una misma marca (ícono destellos + gradiente azul → lila → violeta, tratamiento «Fuerte»).

**Architecture:** El caso de uso `listarSugerencias` se generaliza a todo el consorcio (documento
opcional). La marca vive en tokens y clases de `globals.css` más un único componente `IconoIA`;
cada pantalla solo suma una clase y cambia el ícono. Nada cambia en dominio, cola ni RN-14.

**Tech Stack:** Next.js (app router, componentes servidor), Prisma con extensión de aislamiento,
lucide-react, Vitest (integración), Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-11-18-sugerencias-y-marca-ia-design.md`

## Global Constraints

- Solo el administrador ve la pantalla de sugerencias, el aviso y el «N sugerencias» (`SOLO_ADMINISTRADOR`).
- Sin filtro de `consorcio_id` a mano: `SugerenciaConfiguracion` se lee por la extensión (invariante 1, `filtro-unico.spec.ts`).
- El gradiente es exclusivo de la IA: no se usa para estados ni para nada que no salga de la IA.
- La marca va en lo que todavía es propuesta o respuesta de la IA; no en un gasto confirmado, un acta guardada ni un reclamo ya resuelto.
- Contraste AA de todo texto sobre los tokens nuevos; `npm run test:a11y` sin infracciones.
- Teléfono 390×844 sin desborde horizontal (`desbordaALoAncho`).
- Commits en español con códigos: `RF-19`, `RN-14`, `RNF-01`, `RNF-10` según corresponda.
- Antes de pushear: `prettier --write .` y `npm run verificar`.

### Valores fijos de la marca

```css
--ia-1: #2563eb;  --ia-2: #7c3aed;  --ia-3: #9333ea;          /* blanco encima ≥ 5:1 */
--ia-gradiente: linear-gradient(120deg, var(--ia-1), var(--ia-2) 55%, var(--ia-3));
--ia-tinta: linear-gradient(120deg, #1d4ed8, #6d28d9 55%, #7e22ce); /* texto pintado ≥ 6:1 sobre --ia-palido */
--ia-palido: linear-gradient(120deg, #eaf1fe, #f1ecfe 55%, #f8f0ff);
--ia-texto: #4c1d95;   /* texto liso sobre --ia-palido (etiquetas) */
```

Los colores de las maquetas (`#3b82f6 … #c084fc`) no pasan AA con texto blanco; por eso son estos,
más oscuros. **Decisión del plan.**

## Review Focus

1. **Documento borrado con sugerencias revisadas** → la pantalla nueva no puede romperse ni mostrar un grupo sin título. Se cubre en la Tarea 1 (prueba «agregado: …»).
2. **Dos documentos con pendientes** → el aviso nombra a los dos y el conteo es la suma; cada grupo tiene su ancla. Tarea 2 (e2e) y Tarea 1.
3. **Aplicar desde la pantalla nueva con el modal de reservas afectadas** → el formulario dentro de `BotonModal` sigue llevando `documento` y vuelve a la pantalla nueva, no a la del documento. Tarea 2 (`sobreSugerencias` y e2e).
4. **Consorcista que entra directo a `documentos/sugerencias`** → `RolInsuficiente` como pantalla de error, nunca la lista. Tarea 2 (e2e, final).
5. **Ícono en gradiente con trazos rectos** → las cruces chicas de `Sparkles` son trazos de ancho cero: con `gradientUnits="objectBoundingBox"` no se pintan. El gradiente va en `userSpaceOnUse` (0,0 → 24,24). Tarea 2, paso de `IconoIA`, verificado en la captura.

---

### Task 1: `listarSugerencias` para todo el consorcio

**Files:**
- Modify: `src/aplicacion/comunicacion/sugerencias.ts:418-530` (`SugerenciaVisible`, `listarSugerencias`)
- Test: `pruebas/integracion/sugerencias-configuracion.spec.ts`

**Interfaces:**
- Produces:
  - `SugerenciaVisible` suma `documentoId: string` y `documento: string` (título del documento).
  - `listarSugerencias(repositorio, reloj, datos: { usuarioId: string; consorcioId: string; documentoId?: string }): Promise<SugerenciaVisible[]>` — sin `documentoId`, las de todo el consorcio. Orden: pendientes primero (como hoy), después por título de documento, después `creadoEn`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En el `describe('aplicar y descartar sugerencias (RN-14)')`, con un segundo documento `otroId`
(«Acta de marzo», tipo `acta`) creado como el primero y una sugerencia pendiente en cada uno:

```ts
it('agregado: sin documento trae las del consorcio entero, con el documento de cada una', async () => {
  await sugerir('instrucciones_pago', { texto: 'Alias flay.mitre' })            // en documentoId
  await sugerirEn(otroId, 'asambleas', { anticipacionDias: 20 })
  const lista = await listarSugerencias(repo, RELOJ, { usuarioId: administrador, consorcioId })
  expect(lista.map((s) => [s.documento, s.titulo])).toEqual([
    ['Acta de marzo', 'Reglas de asamblea'],
    [TITULO_DOCUMENTO, 'Instrucciones de pago'],
  ])
  expect(lista.every((s) => s.documentoId === (s.documento === 'Acta de marzo' ? otroId : documentoId))).toBe(true)
})

it('agregado: no trae sugerencias de otro consorcio', async () => {
  // reutilizar el armado de 'sugerencia de otro consorcio: NoEncontrado'
  const lista = await listarSugerencias(repo, RELOJ, { usuarioId: administrador, consorcioId })
  expect(lista.map((s) => s.id)).not.toContain(idDelOtroConsorcio)
})

it('agregado: consorcista es RolInsuficiente', async () => {
  await expect(listarSugerencias(repo, RELOJ, { usuarioId: consorcista, consorcioId }))
    .rejects.toBeInstanceOf(RolInsuficiente)
})
```

`sugerirEn` es `sugerir` con el documento como parámetro (generalizar la ayuda existente;
`sugerir` queda como `sugerirEn(documentoId, …)`). `TITULO_DOCUMENTO` es el título con que el
`beforeEach` ya crea el documento. Si el `beforeEach` borra documentos, que el de esta prueba se
cree dentro de ella.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run pruebas/integracion/sugerencias-configuracion.spec.ts -t agregado`
Expected: FAIL (tipo: falta `documentoId`; o `documento` undefined).

- [ ] **Step 3: Implementar**

`where: datos.documentoId ? { documentoId: datos.documentoId } : {}`; `include: { documento: { select: { titulo: true } } }`;
`orderBy: [{ resueltaEn: { sort: 'desc', nulls: 'first' } }, { documento: { titulo: 'asc' } }, { creadoEn: 'asc' }]`.
La relación `documento` existe en el modelo (verificar el nombre en `prisma/schema.prisma:1031+`). Actualizar el JSDoc.

- [ ] **Step 4: Correr el archivo entero**

Run: `npx vitest run pruebas/integracion/sugerencias-configuracion.spec.ts`
Expected: PASS, incluida `listar: pendientes primero…` sin cambios.

- [ ] **Step 5: Commit**

```bash
git add src/aplicacion/comunicacion/sugerencias.ts pruebas/integracion/sugerencias-configuracion.spec.ts
git commit -m "feat(documentos): las sugerencias se listan para todo el consorcio (RF-19, RN-14)"
```

---

### Task 2: Marca de IA base, pantalla de sugerencias y aviso en Documentación

**Files:**
- Modify: `src/app/globals.css` (tokens en `:root`; clases nuevas junto a `.aviso`, `.etiqueta`, `.boton--fantasma` y `.sugerencias` en `:2580`)
- Create: `src/app/(panel)/icono-ia.tsx`
- Modify: `src/app/layout.tsx` (definición del gradiente SVG, una vez)
- Create: `src/app/(panel)/consorcios/[consorcio]/documentos/sugerencias/page.tsx`
- Create: `src/app/(panel)/consorcios/[consorcio]/documentos/aviso-sugerencias.tsx`
- Move: `src/app/(panel)/consorcios/[consorcio]/documentos/[id]/sugerencias.tsx` → `src/app/(panel)/consorcios/[consorcio]/documentos/sugerencias/sugerencias.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/documentos/page.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/documentos/[id]/page.tsx`
- Modify: `src/app/(panel)/comunicacion/acciones.ts:164-185` (`sobreSugerencias`)
- Test: `pruebas/e2e/comunicacion.spec.ts:157-234`, `pruebas/e2e/servicios.a11y.spec.ts:136-167`

**Interfaces:**
- Consumes: `listarSugerencias` sin `documentoId` y `SugerenciaVisible.documento/documentoId` (Tarea 1); `listarDocumentos(...).sugerenciasPendientes`.
- Produces:
  - Clases CSS: `.tarjeta--ia`, `.aviso--ia`, `.boton--ia` (contorno), `.boton--ia-lleno` (relleno), `.etiqueta--ia`, `.titulo-ia`. Tokens de «Valores fijos».
  - `IconoIA({ className }: { className?: string })` — `Sparkles` con `stroke="url(#ia-trazo)"`, `aria-hidden`, clase por defecto `icono`.
  - `AvisoDeSugerencias({ href, cantidad, documentos }: { href: string; cantidad: number; documentos: string[] })` — `null` si `cantidad === 0`.
  - Ruta `/consorcios/[consorcio]/documentos/sugerencias`, grupos con `id="documento-<id>"`.

- [ ] **Step 1: Reescribir la e2e de sugerencias (falla)**

En `comunicacion.spec.ts`, el test `las sugerencias de configuración de un reglamento…` queda así
(lo que no se lista, igual que hoy):

1. En la página del documento: click «Buscar configuración»; esperar `getByRole('status')` con «Estamos leyendo el documento».
2. Esperar (timeout 25 s) el aviso: `getByRole('region', { name: /La IA encontró 2 cambios de configuración/ })`; click en su enlace «Revisar».
3. `toHaveURL(/\/documentos\/sugerencias#documento-<id>$/)`; `getByRole('heading', { name: 'Sugerencias de configuración', level: 1 })`.
4. La sección del documento: `getByRole('region', { name: 'Reglamento interno de espacios' })`; adentro, el `article` «Nuevo espacio: SUM» con las mismas aserciones de hoy (Propuesto, fila de horario, cita) y `desbordaALoAncho` falso.
5. En `/documentos`: el aviso dice «en «Reglamento interno de espacios»»; el enlace «2 sugerencias» lleva a `/documentos/sugerencias#documento-<id>`.
6. Aplicar SUM → toast «Configuración aplicada.» **y** `toHaveURL(/\/documentos\/sugerencias/)`; descartar mora → «Sugerencia descartada.»; `article` 0; `details` «Ya revisadas (2)» con «Aplicada», «Descartada» y el título del documento.
7. En `/documentos` ya no hay aviso: `getByRole('region', { name: /La IA encontró/ })` cuenta 0.
8. Consorcista: en la página del documento no hay «Buscar configuración» ni aviso; `goto('/documentos/sugerencias')` muestra el texto de `RolInsuficiente` y ningún `article`.

En `servicios.a11y.spec.ts`, en `DEL_ADMINISTRADOR`, sumar
`{ nombre: 'sugerencias de configuración', ruta: (e) => `/consorcios/${e.consorcioId}/documentos/sugerencias` }`
y renombrar la de la página del documento a `'documento con aviso de sugerencias'`.

- [ ] **Step 2: Correr y ver que falla**

Run: `npx playwright test pruebas/e2e/comunicacion.spec.ts -g "sugerencias de configuración"`
Expected: FAIL en el paso 2 (no hay aviso).

- [ ] **Step 3: Tokens, clases e `IconoIA`**

- Tokens de «Valores fijos» en `:root`.
- `.tarjeta--ia`, `.aviso--ia`: `background: var(--ia-palido) padding-box, var(--ia-gradiente) border-box; border: 1.5px solid transparent`. `.aviso--ia` con `color: var(--tinta)` y su texto apilado en teléfono (`flex-wrap: wrap`).
- `.boton--ia`: como `.boton--fantasma` pero con borde en gradiente sobre `--superficie`. `.boton--ia-lleno`: `background: var(--ia-gradiente); color: #fff; border: 0`.
- `.etiqueta--ia`: `background: var(--ia-palido); color: var(--ia-texto)`.
- `.titulo-ia`: `background: var(--ia-tinta); background-clip: text; -webkit-background-clip: text; color: transparent`, y `@media (forced-colors: active) { .titulo-ia { background: none; color: CanvasText } }` para que no desaparezca en alto contraste.
- En `layout.tsx`, dentro de `<body>`, un `<svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>` con `<linearGradient id="ia-trazo" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24">` y paradas `#2563eb` / `#7c3aed` 55 % / `#9333ea`. **`userSpaceOnUse` es obligatorio** (Review Focus 5). Va en el layout raíz porque `IconoIA` se usa en el panel y el asistente.
- `icono-ia.tsx` sin `'use client'` (lo usan servidor y cliente).

- [ ] **Step 4: `AvisoDeSugerencias` y la pantalla nueva**

`aviso-sugerencias.tsx`: `<section className="aviso aviso--ia" aria-labelledby=…>` con `IconoIA`, un
`<strong className="titulo-ia" id=…>` «La IA encontró {plural(cantidad, 'cambio de configuración', 'cambios de configuración')}»,
debajo «en «A» y «B». Nada se aplica sin tu clic.» (lista con `Intl.ListFormat('es', { type: 'conjunction' })`), y
`<Link className="boton boton--ia-lleno" href={href}><Sparkles/>Revisar</Link>` (ícono blanco: `Sparkles` liso, no `IconoIA`).
El nombre accesible de la región es el texto del `strong`.

`sugerencias/page.tsx` (título «Sugerencias de configuración — Flay»): `conConsorcio(consorcioId, 'Sugerencias de configuración')`,
`Volver` a `documentos`, `h1` «Sugerencias de configuración» con `IconoIA`, bajada «Lo que la IA leyó en la documentación y
difiere de la configuración. Nada se aplica sin tu clic.». Llama `listarSugerencias` sin documento dentro del `try`
(el `catch` con `AvisoDeError` cubre al consorcista). Sin pendientes: `.vacio` con `IconoIA` y «No hay sugerencias para revisar.».

`sugerencias.tsx` (movido): recibe `consorcioId` y la lista entera; agrupa las pendientes por `documentoId` en
`<section id={`documento-${id}`} aria-labelledby=…>` con `<h2>` = título del documento enlazado a su página; cada `article`
pasa a `tarjeta tarjeta--ia` y su `h3` lleva `IconoIA` + `className="titulo-ia"`. El hidden `documento` de cada formulario
sale de `s.documentoId`. «Ya revisadas» al pie, una sola lista, cada ítem con su documento. Se quita la prop `analizando`
y el aviso «Estamos leyendo…» (queda en la página del documento).

- [ ] **Step 5: Documentación, documento y acciones**

- `documentos/page.tsx` (solo `administra`): `AvisoDeSugerencias` entre la cabecera y la tabla, con `cantidad` = suma de
  `sugerenciasPendientes` y `documentos` = títulos de los que tienen; el enlace «N sugerencias» de la fila pasa a
  `documentos/sugerencias#documento-${d.id}` con clase `etiqueta etiqueta--ia`; «Preguntarle a la documentación» pasa a
  `boton boton--ia` con `IconoIA` (sale `MessageCircleQuestion`).
- `documentos/[id]/page.tsx`: sale `<Sugerencias>`. Si `analisis?.analizando`, `<p className="aviso aviso--ia" role="status">`
  con `IconoIA` y «Estamos leyendo el documento: las sugerencias aparecen en un momento.» (sigue el `EnVivo`). Si no, el
  `AvisoDeSugerencias` con las pendientes de ese documento (`listarSugerencias` con `documentoId`, contar `pendiente`) y
  `href` a su ancla. «Buscar configuración» pasa a `boton boton--ia` con `IconoIA`.
- `sobreSugerencias`: `ruta` = `/consorcios/${consorcioId}/documentos/sugerencias`, sin ancla (`conHecho` arma la
  consulta al final de la cadena y un `#` en el medio la rompería); actualizar el JSDoc. El hidden `documento` deja de
  usarse ahí: sacarlo de `campos(s)`.

**Decisión del plan:** la pantalla nueva no lleva `EnVivo`. El análisis se dispara en la página del documento, que sí sondea
y muestra «Estamos leyendo…»; un análisis encolado por una subida aparece al próximo pedido (decisión 21). Agregarlo exige
contar trabajos `sugerir_configuracion` del consorcio entero.

- [ ] **Step 6: Correr e2e y a11y**

Run: `npx playwright test pruebas/e2e/comunicacion.spec.ts pruebas/e2e/servicios.a11y.spec.ts`
Expected: PASS. Si axe marca `color-contrast` como incompleto sobre `.titulo-ia`, no es infracción; si marca infracción, corregir el token, no ignorar la regla.

- [ ] **Step 7: Mirarlo**

Con `npm run dev` y la semilla: captura de `/documentos`, `/documentos/sugerencias` y la página del reglamento, en
escritorio y 390×844. Verificar que las cruces chicas del ícono se ven pintadas (Review Focus 5) y que el aviso apila
texto y botón en teléfono.

- [ ] **Step 8: Commit**

```bash
git add src/app pruebas/e2e/comunicacion.spec.ts pruebas/e2e/servicios.a11y.spec.ts
git commit -m "feat(documentos): pantalla de sugerencias con aviso en Documentación y marca de IA (RF-19, RN-14, RNF-01)"
```

---

### Task 3: La marca de IA en el resto de la aplicación

**Files:**
- Modify: `src/app/(panel)/asistente/asistente.tsx:245-270, 324, 355` y `src/app/globals.css:3805-3860`
- Modify: `src/app/(panel)/consorcios/[consorcio]/gastos/page.tsx:105-111`
- Modify: `src/app/(panel)/consorcios/[consorcio]/gastos/asistida/page.tsx:82, 101`
- Modify: `src/app/(panel)/consorcios/[consorcio]/gastos/asistida/[id]/page.tsx:128-134`
- Modify: `src/app/(panel)/consorcios/[consorcio]/reclamos/[id]/page.tsx:96-99`
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/acta/page.tsx:147-149`
- Modify: `src/app/(panel)/consorcios/[consorcio]/documentos/consultar/formulario.tsx:51`

**Interfaces:**
- Consumes: clases y `IconoIA` de la Tarea 2.

Ningún texto cambia: las e2e existentes que buscan «Carga asistida», «Sugerencia automática», «Borrador de IA, revisalo» y
«Abrir asistente» siguen valiendo y son la prueba de regresión de esta tarea.

- [ ] **Step 1: Aplicar la marca**

| Dónde | Cambio |
|---|---|
| Asistente, lanzador | `Bot` → `Sparkles` (blanco); `.asistente__lanzador` con `background: var(--ia-gradiente)` |
| Asistente, cabecera | `Bot` → `Sparkles` (blanco); `.asistente__cabeza` con `background: var(--ia-gradiente)` |
| Asistente, respuestas | `.asistente__msg:not(.asistente__msg--usuario)` con `background: var(--ia-palido)`, `padding: var(--e2) var(--e3)`, `border-radius: var(--radio-chico)`; la tarjeta de confirmación (`tarjeta asistente__msg`) suma `tarjeta--ia` |
| Gastos, botón «Carga asistida» | `boton--fantasma` → `boton--ia`; `ScanSearch` → `IconoIA` |
| Carga asistida, `h1` | `IconoIA` antes del texto; el vacío usa `IconoIA` en lugar de `ScanSearch` |
| Revisión del comprobante | solo la rama «Propuesta automática…»: `aviso--atencion` → `aviso--ia`, `TriangleAlert` → `IconoIA`. Las ramas de no disponible / no confiable quedan ámbar: son advertencias, no propuestas |
| Reclamo, «Sugerencia automática» | `section.tarjeta` suma `tarjeta--ia`; `h2` con `className="titulo-ia"`; `Sparkles` → `IconoIA` |
| Acta, «Borrador de IA, revisalo» | `etiqueta--pendiente` → `etiqueta--ia` con `IconoIA` (la etiqueta con ícono no dibuja el punto) |
| Consulta documental, respuesta | `section.tarjeta` suma `tarjeta--ia`; antes del texto, `<p className="etiqueta etiqueta--ia"><IconoIA/>Respuesta de IA</p>` |

Contraste: el texto `--tinta-clara` sobre el gradiente de la cabecera del asistente debe dar ≥ 4,5:1 contra `--ia-3`
(`#9333ea`): si no, usar `#fff`.

- [ ] **Step 2: Correr las suites que tocan estas pantallas**

Run: `npx playwright test pruebas/e2e/asistente.spec.ts pruebas/e2e/asistente.a11y.spec.ts pruebas/e2e/asistencia.spec.ts pruebas/e2e/asambleas.spec.ts pruebas/e2e/servicios.a11y.spec.ts`
Expected: PASS.

- [ ] **Step 3: Mirarlo**

Capturas en escritorio y 390×844 del asistente abierto con una respuesta, la carga asistida, la revisión de un
comprobante, un reclamo con sugerencia y un acta con borrador.

- [ ] **Step 4: Commit**

```bash
git add src/app
git commit -m "feat(asistencia): todo lo que propone la IA lleva la misma marca (RN-14, RNF-10)"
```

---

### Task 4: Documentación y verificación completa

**Files:**
- Modify: `CLAUDE.md:424-436` (nota 33)
- Modify: `docs/guia-estilos-ejemplo.html` (si lista los tokens de color: sumar los `--ia-*` y la regla de uso)

- [ ] **Step 1: Nota 33**

Agregar al final: las sugerencias se revisan en `documentos/sugerencias`, todas juntas y agrupadas por documento;
Documentación y la página del documento solo avisan (`AvisoDeSugerencias`). Y una línea nueva: «La marca de IA
(`IconoIA`, clases `--ia`) va solo en lo que la IA propone o responde y todavía no confirmó una persona; el gradiente
no es un color de estado.»

- [ ] **Step 2: Gate completo**

Run: `prettier --write . && npm run verificar && npm run test:a11y`
Expected: todo en verde.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/guia-estilos-ejemplo.html
git commit -m "docs: nota 33 con la pantalla de sugerencias y la marca de IA (RF-19, RN-14)"
```
