# Arreglos de documentación, reparto, morosidad y subida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seis arreglos de uso: el documento se ve en línea, se puede eliminar, el modal de carga se cierra, todas las subidas usan el mismo componente, el reparto sale del modal y el detalle de morosidad pasa a tooltip.

**Architecture:** Cambios en presentación más un caso de uso nuevo (`eliminarDocumento`) en `aplicacion/comunicacion/documentos.ts`. Sin migraciones.

**Tech Stack:** Next.js (App Router, Server Actions), Prisma, Vitest (`--project integracion`), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-arreglos-documentos-y-tablas-design.md`

## Global Constraints

- Idioma: español en código, textos y commits; commits citan el requerimiento (`RF-19`, `RF-06`, `RNF-01`, `FR-029`).
- Presentación no importa infraestructura; las dependencias salen de `@/aplicacion/dependencias` (decisión 5).
- Resultado de una acción: `conHecho(ruta, clave)` / `conError(ruta, texto)`; claves nuevas en `HECHO` de `src/app/aviso-en-url.ts` (decisión 24).
- Funciona en teléfono 390×844 (RNF-01) y pasa axe A/AA.
- Antes de pushear: `prettier --write .` y `npm run verificar`.
- Rama: `fix/documentos-y-tablas` desde `main`.

## Review Focus

- **Documento no PDF (imagen) al abrir:** no hay `<iframe>`; el botón «Descargar» tiene que seguir descargando → cubierto en Task 1 (la descarga sigue siendo `attachment`).
- **Borrar un documento que todavía se está indexando** (`procesando`): el trabajo de la cola encuentra la fila borrada y no debe lanzar → `manejadorIndexacion` ya hace `if (!documento) return`; Task 2 agrega la prueba.
- **Doble clic en «Eliminar»:** el segundo pedido no encuentra el documento → «no encontrado» como aviso, no traza → Task 2.
- **Subida que falla a mitad en el modal de documento:** el modal **no** se cierra y el mensaje queda visible → Task 3 (`alTerminar` solo en éxito).
- **Tooltip de morosidad en teléfono:** abrir por toque y cerrar tocando afuera, sin que quede pegado al pasar a otra fila → Task 6 (e2e teléfono).

---

### Task 1: El documento se ve en línea y se descarga aparte

**Files:**
- Modify: `src/aplicacion/comunicacion/documentos.ts:184-205` (`verDocumento`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/documentos/[id]/page.tsx`
- Test: `pruebas/integracion/comunicacion.spec.ts` (bloque `describe('documentos')`)

**Interfaces:**
- Produces: `verDocumento(...) : Promise<{ titulo: string; tipoContenido: string; vista: string; descarga: string }>` (reemplaza `direccion`).

- [ ] **Step 1: Write the failing test** en `describe('documentos')`:

```ts
it('la vista se pide en línea y la descarga como adjunto (RF-19)', async () => {
  const pedidos: { clave: string; enLinea?: boolean }[] = []
  const almacen = {
    async resolverLecturaAutorizada(clave: string, _s: number, op?: { enLinea?: boolean }) {
      pedidos.push({ clave, enLinea: op?.enLinea })
      return `https://almacen.test/${clave}?${op?.enLinea ? 'inline' : 'attachment'}`
    },
  }
  const { documentoId } = await cargar('Reglamento', true)
  const doc = await verDocumento(almacen, repo, RELOJ, { usuarioId: vecino, consorcioId, documentoId })
  expect(doc.vista).toMatch(/inline$/)
  expect(doc.descarga).toMatch(/attachment$/)
  expect(pedidos.map((p) => p.enLinea)).toEqual([true, undefined])
})
```

- [ ] **Step 2: Run:** `npx vitest run --project integracion pruebas/integracion/comunicacion.spec.ts -t "en línea"` → FAIL (`vista` undefined).
- [ ] **Step 3: Implement.** `verDocumento` pide dos direcciones (600 s): `{ enLinea: true }` para `vista`, sin opciones para `descarga` (mismo patrón que `verExtraccion`, `extraccion.ts:195-197`). La página usa `vista` en el `<iframe>` y `descarga` en el `<a download>`. Ajustar el `Pick<AlmacenObjetos, ...>` del parámetro si hace falta.
- [ ] **Step 4: Run** el mismo comando → PASS; `npm run typecheck` sin errores (otros llamadores de `.direccion`).
- [ ] **Step 5: Commit** `fix(documentos): el documento se abre en línea y la descarga va aparte (RF-19)`

### Task 2: Eliminar documentos (solo administrador)

**Files:**
- Modify: `src/aplicacion/comunicacion/documentos.ts` (caso de uso + error)
- Modify: `src/app/(panel)/comunicacion/acciones.ts` (acción)
- Modify: `src/app/aviso-en-url.ts` (`HECHO['documento-eliminado']`)
- Create: `src/app/(panel)/consorcios/[consorcio]/documentos/[id]/modal-eliminar.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/documentos/[id]/page.tsx`
- Test: `pruebas/integracion/comunicacion.spec.ts`

**Interfaces:**
- Produces:
  - `eliminarDocumento(almacen: Pick<AlmacenObjetos, 'eliminar'>, repositorio, reloj, datos: { usuarioId: string; consorcioId: string; documentoId: string }): Promise<void>`
  - `class DocumentoDeActa extends ErrorDeAplicacion` — mensaje: `'Este documento es el acta firmada de una asamblea y no se puede eliminar.'`, código `'RF-19'`.
  - `accionEliminarDocumento(datos: FormData): Promise<void>` (campos `consorcio`, `documento`).
  - `HECHO['documento-eliminado'] = 'Documento eliminado.'`

- [ ] **Step 1: Write the failing tests:**

```ts
it('el administrador elimina: se van la fila, los fragmentos y el objeto (RF-19)', async () => {
  const borrados: string[] = []
  const { documentoId } = await cargar('Reglamento', true)
  await prismaBase.fragmentoDocumento.create({ data: { documentoId, numeroFragmento: 1, contenido: 'Art. 1' } })
  await eliminarDocumento({ async eliminar(c) { borrados.push(c) } }, repo, RELOJ, { usuarioId: administrador, consorcioId, documentoId })
  expect(await prismaBase.documentoConsorcio.count({ where: { id: documentoId } })).toBe(0)
  expect(await prismaBase.fragmentoDocumento.count({ where: { documentoId } })).toBe(0)
  expect(borrados).toHaveLength(1)
})
it('consorcista y consejo no eliminan', async () => { /* rejects.toBeInstanceOf(RolInsuficiente) para vecino y consejo */ })
it('el acta firmada no se elimina', async () => { /* crear ActaAsamblea con documentoId → rejects.toBeInstanceOf(DocumentoDeActa) y la fila sigue */ })
it('si el almacén falla, la fila igual se borra', async () => { /* eliminar lanza → la promesa resuelve y count = 0 */ })
it('eliminar dos veces: la segunda es no encontrado', async () => { /* rejects.toBeInstanceOf(NoEncontrado) */ })
it('el trabajo de indexación de un documento borrado termina sin lanzar', async () => {
  // manejadorIndexacion(almacenDoble, vectoresDoble, extraerDoble)({ documentoId }) resolves
})
```

Para `ActaAsamblea` reusar las ayudas de `pruebas/integracion/asambleas-ayudas.ts`.

- [ ] **Step 2: Run:** `npx vitest run --project integracion pruebas/integracion/comunicacion.spec.ts -t "elimin|acta firmada|borrado"` → FAIL (no existe `eliminarDocumento`).
- [ ] **Step 3: Implement `eliminarDocumento`.** Dentro de `conAutorizacion` con `rolesPermitidos: ['administrador']` y `accion: 'eliminar documentos'`: `findFirst` aislado (si no, `NoEncontrado`); si `prisma.actaAsamblea.findFirst({ where: { documentoId } })` existe, `DocumentoDeActa`; `prisma.documentoConsorcio.delete`; **después** `almacen.eliminar(clave)` en `try/catch` que solo hace `console.error('[documentos] objeto huérfano', clave)`.
- [ ] **Step 4: Run** el mismo comando → PASS.
- [ ] **Step 5: UI.** `accionEliminarDocumento` llama con `ALMACEN`, y redirige con `conHecho('/consorcios/<id>/documentos', 'documento-eliminado')` o `conError` a la página del documento. `ModalEliminar`: `BotonModal` `variante="boton--peligro"`, etiqueta «Eliminar», título «Eliminar el documento», texto «Se borra el archivo y deja de aparecer en las consultas. No se puede deshacer.», `<form action={accionEliminarDocumento}>` con los dos campos ocultos y botón `boton--peligro` «Eliminar». Modelo: `espacios/modal-deshabilitar.tsx`. La página lo muestra solo si `rolesEn(...)` incluye `administrador`.
- [ ] **Step 6: E2E** en `pruebas/e2e/comunicacion.spec.ts`: el administrador abre un documento sembrado, elimina, vuelve al listado con «Documento eliminado.» y la fila ya no está; el consorcista no ve el botón.
- [ ] **Step 7: Run** `npx playwright test pruebas/e2e/comunicacion.spec.ts` → PASS.
- [ ] **Step 8: Commit** `feat(documentos): el administrador elimina documentos, salvo el acta firmada (RF-19)`

### Task 3: El modal de «Cargar documento» se cierra al terminar

**Files:**
- Modify: `src/app/(panel)/subida-directa.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/documentos/modal-documento.tsx`
- Test: `pruebas/e2e/comunicacion.spec.ts`

**Interfaces:**
- Produces: prop nueva `alTerminar?: () => void` en `SubidaDirecta`, llamada **solo** tras una confirmación sin `mensaje`, antes de `router.push(destino)` / del reset.

- [ ] **Step 1: Write the failing e2e:** el administrador carga un PDF chico (fixture de `pruebas/fixtures/`) con título «Reglamento interno 2026» → `expect(page.getByRole('dialog')).toBeHidden()`, el aviso «documento cargado» visible y la fila en la tabla. Con `FLAY_ALMACEN=memoria` como el resto de e2e.
- [ ] **Step 2: Run** `npx playwright test pruebas/e2e/comunicacion.spec.ts -g "se cierra"` → FAIL (el diálogo sigue abierto).
- [ ] **Step 3: Implement.** `SubidaDirecta` llama `alTerminar?.()` en el camino de éxito. `ModalDocumento` pasa a `children` función: `{(cerrar) => <SubidaDirecta … alTerminar={cerrar}>…</SubidaDirecta>}`.
- [ ] **Step 4: Run** → PASS. Verificar a mano que un `mensaje` de validación (sin título) deja el modal abierto con el error.
- [ ] **Step 5: Commit** `fix(documentos): el modal de carga se cierra al confirmar (RF-19)`

### Task 4: Un solo componente de subida (comprobante del gasto)

**Files:**
- Modify: `src/app/(panel)/subida-directa.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/documentos/modal-documento.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/gastos/asistida/cargador.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/gastos/[id]/adjuntar.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/gastos/acciones.ts:152-167`
- Test: e2e existente del comprobante (buscar con `grep -rl "Comprobante" pruebas/e2e`)

**Interfaces:**
- Consumes: `alTerminar` de Task 3.
- Produces:
  - En `SubidaDirecta`, `prefijo` se reemplaza por `permiso: { ruta: '/api/objetos/permiso' | '/api/comprobantes/permiso'; campos: Record<string, string> }`; el cuerpo del POST es `{ consorcio, tipoContenido, bytes, nombre, ...campos }`. El `id` del input pasa a `useId()`.
  - Documentos: `permiso={{ ruta: '/api/objetos/permiso', campos: { prefijo: 'documentos' } }}`; carga asistida: `campos: { prefijo: 'extracciones' }`; comprobante: `{ ruta: '/api/comprobantes/permiso', campos: { gasto: gastoId } }`.
  - `accionConfirmarComprobante(datos: FormData): Promise<{ mensaje: string; destino?: string }>`, que lee `consorcio`, `gasto` (oculto, lo pone el formulario) y `clave`.

- [ ] **Step 1: Implement** los cambios de firma de arriba. `adjuntar.tsx` queda como `SubidaDirecta` con `accept` igual al actual, `objeto="el comprobante"`, `ayuda="PDF, JPEG, PNG, WebP, HEIC o TIFF · hasta 25 MB"`, `etiquetaBoton="Subir"`, `exito="Comprobante subido."`, y un `<input type="hidden" name="gasto">` como hijo.
- [ ] **Step 2: Run** `npm run typecheck && npm run lint` → sin errores.
- [ ] **Step 3: Run** la e2e del comprobante y `pruebas/e2e/comunicacion.spec.ts` → PASS; si la del comprobante buscaba la etiqueta «Comprobante» del input viejo, se actualiza a la zona de arrastre (`setInputFiles` sobre el input oculto, como hace la de documentos).
- [ ] **Step 4: Commit** `refactor(gastos): el comprobante del gasto usa la misma subida que el resto (RF-06)`

### Task 5: El reparto entre unidades en la página del período

**Files:**
- Modify: `src/app/(panel)/consorcios/[consorcio]/periodos/[id]/page.tsx:150-230`
- Test: `pruebas/e2e/liquidar.spec.ts`

- [ ] **Step 1: Write the failing e2e** en `liquidar.spec.ts`: en la vista previa de un período abierto, `page.getByRole('link', { name: /Ver el reparto entre \d+ unidades/ })` lleva a `#reparto`, y `page.getByRole('region', { name: 'Reparto por unidad' })` es visible **sin** abrir un diálogo (`getByRole('dialog')` con count 0).
- [ ] **Step 2: Run** `npx playwright test pruebas/e2e/liquidar.spec.ts -g reparto` → FAIL.
- [ ] **Step 3: Implement.** Sacar `RepartoPorUnidad` del `BotonModal`; en su lugar, `<a className="boton boton--fantasma" href="#reparto">Ver el reparto entre N unidades</a>` en la fila de acciones. Debajo de la fila de acciones, `<section id="reparto" aria-labelledby="titulo-reparto"><h2 id="titulo-reparto">Reparto de {periodo} por unidad</h2><RepartoPorUnidad …/></section>`, con `TablaDesplazable` en lugar del `div.tabla-desplazable`. Si la sección queda sin `max-height` en escritorio, se usa la variante que la página de gastos ya usa para tablas largas. Borrar el import de `BotonModal` si queda sin uso. Actualizar el comentario de las líneas 147-149.
- [ ] **Step 4: Run** la e2e en escritorio y teléfono → PASS. Captura en 390×844 para el PR.
- [ ] **Step 5: Commit** `fix(liquidacion): el reparto por unidad sale del modal a la página del período (RNF-01)`

### Task 6: El detalle de morosidad como tooltip

**Files:**
- Create: `src/app/(panel)/consorcios/[consorcio]/morosidad/detalle-periodos.tsx` (`'use client'`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/morosidad/page.tsx:131-150`
- Modify: `src/app/globals.css` (bloque `.tooltip`, junto a `.modal`)
- Test: `pruebas/e2e/morosidad.spec.ts`

**Interfaces:**
- Produces: `DetallePeriodos({ resumen, periodos }: { resumen: string; periodos: { periodo: string; vence: string; saldo: string }[] })`, con textos ya formateados en el servidor (los importes llegan como cadena, § 14.1).

- [ ] **Step 1: Write the failing e2e** en `morosidad.spec.ts`: en la fila de un deudor, `getByRole('button', { name: /\d+ períodos?/ })`; hover (escritorio) o tap (teléfono) → `getByRole('tooltip')` visible con «venció» y el importe; `Escape` lo cierra; ya no hay `details` en la tabla.
- [ ] **Step 2: Run** `npx playwright test pruebas/e2e/morosidad.spec.ts -g tooltip` → FAIL.
- [ ] **Step 3: Implement.** Un `<button type="button" popovertarget={id} aria-describedby={id}>` con el texto `resumen`, y un `<div id={id} popover="auto" role="tooltip" className="tooltip">` con la lista de períodos (`ul.lista-simple`, mismo marcado que el `<details>`). `onMouseEnter`/`onFocus` → `showPopover()`; `onMouseLeave`/`onBlur` → `hidePopover()`, cada uno en `try` (lanza si ya está en ese estado). `useId()` para el id. Posición: CSS de anclaje con `position-anchor` y, si no lo soporta el navegador, centrado debajo del botón con `position: fixed` calculado en `showPopover` desde `getBoundingClientRect()`. Estilo con los tokens de `.modal` (superficie, sombra, radio). La página pasa los textos ya formateados (`plural`, `fechaParaMostrar`, `importeParaMostrar`). Actualizar el comentario de las líneas 19-20 (`<details>` → tooltip).
- [ ] **Step 4: Run** la e2e en escritorio y teléfono y `npm run test:a11y` → PASS.
- [ ] **Step 5: Commit** `fix(morosidad): el detalle por deudor pasa a tooltip (FR-029, RNF-01)`

### Task 7: Cierre

- [ ] `prettier --write .` y `npm run verificar` → todo verde.
- [ ] `npm audit --omit=dev --audit-level=high` sin hallazgos.
- [ ] Manual de usuario: si `docs/entrega-final/16-manual-usuario.md` describe la documentación o el reparto, actualizar el párrafo (eliminar, vista en línea, reparto en la página).
- [ ] PR `fix/documentos-y-tablas` → `main`, con capturas en teléfono del reparto y del tooltip.
