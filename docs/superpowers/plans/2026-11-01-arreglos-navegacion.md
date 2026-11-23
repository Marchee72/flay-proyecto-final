# Arreglos de navegación — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los doce hallazgos de la revisión de navegación hecha sobre `main` (`5ed0964`) el 2026-11-01, en cuatro partes que se integran por separado.

**Architecture:** Cada parte es una rama desde `main` y un PR con revisión del otro integrante. La lógica nueva que se puede probar sin navegador vive en módulos puros (`src/compartido/`, `src/app/aviso-en-url.ts`, `consorcio-activo.ts`) con su spec en `pruebas/dominio/`; lo que solo se ve navegando se fija con una prueba de Playwright en el spec existente de esa pantalla.

**Tech Stack:** Next.js 15.5 (App Router, Server Actions, `src/middleware.ts`), React 19, TypeScript, Vitest (proyecto `dominio`, sin base), Playwright (escritorio + `telefono` 390×844).

**Spec:** la revisión de esta conversación (12 hallazgos). El enlace roto «Ver los gastos del período» (`expensas/[detalle]/page.tsx:255`) **no** entra acá: ya lo arregla `21bf55d` en `feat/vencimientos-validacion-formulario`, que tiene su propio PR.

## Global Constraints

- Idioma del código, comentarios, commits y textos: español; commits con código de trazabilidad (`RNF-10`, `RNF-01`, …) y el pie `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Una rama por parte, desde `main`; si la parte anterior todavía no se mergeó y esta la consume, se ramifica encima de ella.
- Antes de pushear cada parte: `npx prettier --write .` y `npm run verificar` en verde (necesita la base local de `CLAUDE.md`). Ninguna parte toca dependencias, así que `docs:versiones` no cambia.
- Presentación no importa infraestructura (§ 12.1.2); un módulo con `'use client'` no exporta valores que lea un componente servidor (decisión 19).
- Ningún destino de redirección se arma con texto del usuario sin pasar por `destinoSeguro` (no hay redirección abierta).
- Al terminar cada parte, actualizar en `CLAUDE.md` la decisión que contradiga (se indica en la tarea).

## Review Focus

1. **Volver a la misma URL dos veces seguidas** (cerrar dos períodos uno tras otro): el segundo aviso tiene que salir. Lo fija la Tarea 1 (dos llamadas a `conHecho` dan cadenas distintas).
2. **`?desde=` hostil** (`//evil.test`, `/\\evil.test`, `https://evil.test`, `/ingresar`): tiene que terminar en `/`. Lo fija la Tarea 6 en `destinos.spec.ts`.
3. **Parámetros de filtro escritos a mano** (`?periodo=x`, `?mes=2026-13`): la pantalla se dibuja, sin 500. Lo fija la Tarea 7 en `navegacion.spec.ts`.
4. **Abrir el menú «Más» y tocar una sección en el teléfono**: el menú se cierra. Lo fija la Tarea 3.
5. **`vuelta` de otro consorcio en el alta de pago** (`/consorcios/<otro>/…`): se ignora y vuelve a `/pagos` del propio. Lo fija la Tarea 6 (`destinoSeguro` con prefijo) y lo usa la Tarea 8.

---

## Parte 1 — `fix/avisos-repetidos`

### Tarea 1: el aviso viaja con un valor único y el texto vive en un módulo sin cliente

**Files:**
- Create: `src/app/aviso-en-url.ts`
- Modify: `src/app/avisos.tsx` (borrar `HECHO`, importarlo del módulo nuevo)
- Modify: todas las redirecciones que hoy escriben `?hecho=` o `?error=` a mano. La lista sale de `grep -rn "hecho=\|?error=" src/app` (son 30; incluye `comunicacion/acciones.ts:123`, que devuelve `destino` en vez de redirigir, y `(sesion)/acciones.ts:52`).
- Modify: `src/app/(panel)/consorcios/[consorcio]/pagos/page.tsx:27-35,142-154` (sacar los dos banners de éxito y el campo `registrado`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/pagos/modal-pago.tsx:6-9` (el comentario que habla de `?registrado=1`)
- Test: `pruebas/dominio/aviso-en-url.spec.ts`

**Interfaces:**
- Produces:
  - `HECHO: Record<ClaveHecho, string>` (las claves y textos que hoy están en `avisos.tsx`, más `'pasarela-configurada': 'Credenciales de la pasarela de pagos guardadas.'`)
  - `type ClaveHecho` (unión literal de las claves de `HECHO`)
  - `conHecho(ruta: string, clave: ClaveHecho): string`
  - `conError(ruta: string, texto: string): string`

- [ ] **Paso 1: escribir la prueba que falla**

```ts
describe('aviso en la URL (RNF-10)', () => {
  it('agrega la clave y un valor único', () => {
    expect(conHecho('/consorcios/x/periodos', 'anulado')).toMatch(
      /^\/consorcios\/x\/periodos\?hecho=anulado&aviso=[0-9a-z]+$/,
    )
  })
  it('respeta la búsqueda que ya trae', () => {
    expect(conHecho('/x?unidad=u', 'pago-registrado')).toMatch(/^\/x\?unidad=u&hecho=pago-registrado&aviso=/)
  })
  it('dos llamadas iguales no dan la misma dirección', () => {
    expect(conHecho('/x', 'anulado')).not.toBe(conHecho('/x', 'anulado'))
  })
  it('el error va codificado', () => {
    expect(conError('/x', 'No se pudo: 50 %')).toMatch(/^\/x\?error=No\+se\+pudo%3A\+50\+%25&aviso=/)
  })
  it('toda clave tiene texto', () => {
    for (const texto of Object.values(HECHO)) expect(texto.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Paso 2: correrla y ver que falla**

Run: `npx vitest run --project dominio pruebas/dominio/aviso-en-url.spec.ts`
Expected: FAIL, `Cannot find module '@/app/aviso-en-url'`.

- [ ] **Paso 3: implementar `src/app/aviso-en-url.ts`**

Sin `'use client'` y sin importar nada de Next. Arma la búsqueda con `URLSearchParams`, separando lo que ya trae la ruta después de `?`. El valor único es `crypto.randomUUID().slice(0, 8)`. `avisos.tsx` importa `HECHO` desde acá; `PilaDeAvisos` no cambia: sigue leyendo `hecho` y `error`, y ahora la cadena cambia en cada acción.

- [ ] **Paso 4: migrar las redirecciones**

Cada `` `${ruta}?hecho=clave` `` pasa a `conHecho(ruta, 'clave')`, y cada `` `${ruta}?error=${encodeURIComponent(m)}` `` pasa a `conError(ruta, m)`. `periodos/acciones.ts` tipa su parámetro `hecho` como `ClaveHecho`. En `pagos/page.tsx` se borran los dos `parametros.hecho === …` y el campo `registrado`: los avisos los da la pila.

- [ ] **Paso 5: verificar**

Run: `npx vitest run --project dominio pruebas/dominio/aviso-en-url.spec.ts && npm run typecheck && npm run lint`
Expected: PASS. Y `grep -rn "hecho=\|?error=" src/app` solo encuentra `aviso-en-url.ts` y `avisos.tsx`.

- [ ] **Paso 6: documentar y hacer commit**

En `CLAUDE.md`, decisión 24: las acciones redirigen con `conHecho`/`conError` (`src/app/aviso-en-url.ts`), que agrega `aviso=<único>` para que la misma acción repetida vuelva a avisar; `HECHO` vive en ese módulo.

```bash
git add src/app pruebas/dominio/aviso-en-url.spec.ts CLAUDE.md
git commit -m "fix(avisos): la misma accion repetida vuelve a avisar (RNF-10)"
```

### Tarea 2: descartar una extracción que falla dice que falló

**Files:**
- Modify: `src/app/(panel)/consorcios/[consorcio]/gastos/acciones.ts:144-158`

**Interfaces:**
- Consumes: `conError`, `conHecho` (Tarea 1)

- [ ] **Paso 1: implementar**

En el `catch` de `accionDescartarExtraccion`, si el error es `ErrorDeAplicacion`, `redirect(conError(`/consorcios/${consorcioId}/gastos/asistida`, error.mensajeParaUsuario))`; cualquier otro se relanza. El éxito sigue igual, con `conHecho(…, 'extraccion-descartada')`.

- [ ] **Paso 2: verificar**

Run: `npm run typecheck && npm run lint`
Expected: PASS. Sin prueba automática nueva: es una sola rama y la acción no tiene arnés; se verifica a mano descartando dos veces la misma extracción en dos pestañas (la segunda muestra el error, no «Extracción descartada»).

- [ ] **Paso 3: hacer commit y PR de la Parte 1**

```bash
git add "src/app/(panel)/consorcios/[consorcio]/gastos/acciones.ts"
git commit -m "fix(gastos): descartar una extraccion que falla no avisa exito (RNF-10)"
```

`npx prettier --write . && npm run verificar`; push y PR contra `main`.

---

## Parte 2 — `fix/navegacion-telefono`

### Tarea 3: el menú «Más» se cierra al navegar

**Files:**
- Modify: `src/app/(panel)/navegacion.tsx:162-195` (`BarraInferior`)
- Test: `pruebas/e2e/navegacion.spec.ts`

- [ ] **Paso 1: escribir la prueba que falla**

```ts
test('en el teléfono, elegir una sección del menú lo cierra (RNF-01)', async ({ page }) => {
  test.skip(test.info().project.name !== 'telefono', 'el menú «Más» solo existe en el teléfono')
  await entrar(page, unico.correo)
  await page.getByRole('group').locator('summary').click()
  await page.getByRole('navigation', { name: 'Todas las secciones' }).getByRole('link', { name: 'Gastos' }).click()
  await expect(page).toHaveURL(`/consorcios/${unico.consorcioId}/gastos`)
  await expect(page.locator('details.menu')).not.toHaveAttribute('open', '')
})
```

- [ ] **Paso 2: correrla y ver que falla**

Run: `npx playwright test pruebas/e2e/navegacion.spec.ts --project telefono -g "menú lo cierra"`
Expected: FAIL: el `details.menu` sigue con `open`.

- [ ] **Paso 3: implementar**

En `BarraInferior`: un `useRef<HTMLDetailsElement>` en el `<details className="menu">` y un `useEffect` sobre `ruta` (el `usePathname()` que ya tiene) que pone `menu.current.open = false`.

- [ ] **Paso 4: verificar que pasa**

Run: el mismo comando del Paso 2.
Expected: PASS.

- [ ] **Paso 5: hacer commit**

```bash
git add "src/app/(panel)/navegacion.tsx" pruebas/e2e/navegacion.spec.ts
git commit -m "fix(navegacion): el menu del telefono se cierra al elegir una seccion (RNF-01)"
```

### Tarea 4: la barra de carga no se traba

**Files:**
- Modify: `src/app/(panel)/indicador-carga.tsx:22-24`
- Modify: `src/app/(panel)/marco.tsx:54` (`href` del logo)
- Test: `pruebas/e2e/exportar.spec.ts`, `pruebas/e2e/navegacion.spec.ts`

**Interfaces:**
- Consumes: `destinoDeEntrada(consorcios, recordado, seccion?)` de `consorcio-activo.ts` (ya existe)

- [ ] **Paso 1: escribir las pruebas que fallan**

En `exportar.spec.ts`, después de la descarga del CSV propio: `await expect(page.locator('.barra-carga')).toHaveCount(0)`.
En `navegacion.spec.ts`, en «con un solo consorcio se entra derecho al resumen»: `await expect(page.getByRole('link', { name: 'FLAY' })).toHaveAttribute('href', `/consorcios/${unico.consorcioId}`)`.

- [ ] **Paso 2: correrlas y ver que fallan**

Run: `npx playwright test pruebas/e2e/exportar.spec.ts pruebas/e2e/navegacion.spec.ts --project escritorio`
Expected: FAIL: la barra sigue montada; el `href` del logo es `/`.

- [ ] **Paso 3: implementar**

- `IndicadorCarga`: también vuelve sin encenderse si `objetivo.hasAttribute('download')`.
- `Marco`: el logo apunta a `consorcio?.base ?? destinoDeEntrada(alAlcance, recordado)`, que es la misma cuenta que hace `/`. Así un clic que terminaría en la misma URL ya no navega y el `actual !== siguiente` de `IndicadorCarga` lo deja pasar.

- [ ] **Paso 4: verificar que pasan**

Run: el mismo comando del Paso 2, más `--project telefono`.
Expected: PASS.

- [ ] **Paso 5: hacer commit y PR de la Parte 2**

```bash
git add "src/app/(panel)/indicador-carga.tsx" "src/app/(panel)/marco.tsx" pruebas/e2e/exportar.spec.ts pruebas/e2e/navegacion.spec.ts
git commit -m "fix(navegacion): la barra de carga no se traba con descargas ni con el logo (RNF-06)"
```

`npx prettier --write . && npm run verificar`; push y PR.

---

## Parte 3 — `fix/sesion-retorno`

### Tarea 5: el middleware recuerda la ruta y el consorcio

**Files:**
- Create: `src/middleware.ts`
- Modify: `src/app/(panel)/consorcio-activo.ts` (función nueva)
- Test: `pruebas/dominio/destinos.spec.ts` (se crea acá, la Tarea 6 lo amplía)

**Interfaces:**
- Produces:
  - `consorcioDeLaRuta(ruta: string): string | null` en `consorcio-activo.ts`: el UUID del primer segmento después de `/consorcios/`, o `null`.
  - El pedido llega a la aplicación con la cabecera `x-flay-ruta` = `pathname + search`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
describe('consorcioDeLaRuta', () => {
  const id = '0b5c3a52-6a3e-4e0e-9c1a-2f0c4a1d7e11'
  it('lo saca del resumen y de una sección', () => {
    expect(consorcioDeLaRuta(`/consorcios/${id}`)).toBe(id)
    expect(consorcioDeLaRuta(`/consorcios/${id}/gastos/abc`)).toBe(id)
  })
  it('nada fuera de un consorcio ni con un id que no es uuid', () => {
    expect(consorcioDeLaRuta('/consorcios')).toBeNull()
    expect(consorcioDeLaRuta('/consorcios/nuevo')).toBeNull()
    expect(consorcioDeLaRuta('/bandeja')).toBeNull()
  })
})
```

- [ ] **Paso 2: correrla y ver que falla**

Run: `npx vitest run --project dominio pruebas/dominio/destinos.spec.ts`
Expected: FAIL, `consorcioDeLaRuta is not a function`.

- [ ] **Paso 3: implementar**

- `consorcioDeLaRuta`, con la misma expresión UUID que `con-consorcio.tsx`.
- `src/middleware.ts` (runtime Edge, sin Prisma ni Auth.js; solo importa `consorcio-activo.ts`): copia las cabeceras del pedido, les agrega `x-flay-ruta` y responde `NextResponse.next({ request: { headers } })`. Si el método es `GET` y `consorcioDeLaRuta` encuentra un id, escribe la galleta `NOMBRE_GALLETA_CONSORCIO` con `OPCIONES_GALLETA_CONSORCIO`. Al leerla se sigue validando contra el alcance, como hoy. `config.matcher`: `['/((?!api|_next|favicon.ico).*)']`.

- [ ] **Paso 4: escribir la prueba e2e de la galleta**

En `navegacion.spec.ts`, con el usuario `conDos`: `entrar`, `page.goto('/consorcios/' + segundoConsorcioId)`, después `page.goto('/')` y esperar `toHaveURL('/consorcios/' + segundoConsorcioId)`.

- [ ] **Paso 5: verificar**

Run: `npx vitest run --project dominio pruebas/dominio/destinos.spec.ts && npx playwright test pruebas/e2e/navegacion.spec.ts`
Expected: PASS.

- [ ] **Paso 6: documentar y hacer commit**

En `CLAUDE.md`, decisión 19: la galleta `flay_consorcio` la escribe `src/middleware.ts` en cada entrada a `/consorcios/<id>`, no solo el selector.

```bash
git add src/middleware.ts "src/app/(panel)/consorcio-activo.ts" pruebas/dominio/destinos.spec.ts pruebas/e2e/navegacion.spec.ts CLAUDE.md
git commit -m "fix(navegacion): el ultimo consorcio usado es el ultimo que se abrio (FR-002)"
```

### Tarea 6: ingresar vuelve adonde se iba

**Files:**
- Create: `src/compartido/destinos.ts`
- Create: `src/app/ir-a-ingresar.ts`
- Modify: las 38 apariciones de `redirect('/ingresar')` en `src/app` (`grep -rn "redirect('/ingresar')" src/app`)
- Modify: `src/app/(sesion)/ingresar/page.tsx`, `src/app/(sesion)/formularios.tsx` (`FormularioIngreso`), `src/app/(sesion)/acciones.ts:18-26`
- Test: `pruebas/dominio/destinos.spec.ts`, `pruebas/e2e/ingresar.spec.ts`

**Interfaces:**
- Consumes: cabecera `x-flay-ruta` (Tarea 5)
- Produces:
  - `destinoSeguro(valor: unknown, porDefecto: string, prefijo = '/'): string`: devuelve `valor` solo si es una cadena que empieza con `prefijo`, no empieza con `//`, no contiene `\` y no empieza con `/ingresar`; si no, `porDefecto`.
  - `irAIngresar(): Promise<never>`: redirige a `/ingresar?desde=<x-flay-ruta>` (o a `/ingresar` a secas si la ruta falta o es `/`). Se usa como `if (!usuarioId) return irAIngresar()`, para que TypeScript angoste `usuarioId`.
  - `FormularioIngreso({ destino }: { destino: string })`

- [ ] **Paso 1: escribir la prueba que falla**

```ts
describe('destinoSeguro', () => {
  it('acepta una ruta interna', () => {
    expect(destinoSeguro('/consorcios/x/gastos?periodo=p', '/')).toBe('/consorcios/x/gastos?periodo=p')
  })
  it.each(['//evil.test', '/\\evil.test', 'https://evil.test', '/ingresar?desde=%2F', '', null, 3])(
    'rechaza %s',
    (valor) => expect(destinoSeguro(valor, '/')).toBe('/'),
  )
  it('con prefijo, solo dentro del consorcio', () => {
    expect(destinoSeguro('/consorcios/a/expensas/e', '/consorcios/a/pagos', '/consorcios/a/')).toBe('/consorcios/a/expensas/e')
    expect(destinoSeguro('/consorcios/b/expensas/e', '/consorcios/a/pagos', '/consorcios/a/')).toBe('/consorcios/a/pagos')
  })
})
```

- [ ] **Paso 2: correrla y ver que falla**

Run: `npx vitest run --project dominio pruebas/dominio/destinos.spec.ts`
Expected: FAIL, `Cannot find module '@/compartido/destinos'`.

- [ ] **Paso 3: implementar `destinoSeguro` e `irAIngresar`, y migrar las 38 redirecciones**

En `irAIngresar`, la ruta sale de `(await headers()).get('x-flay-ruta')`. Cada `if (!usuarioId) redirect('/ingresar')` pasa a `if (!usuarioId) return irAIngresar()`; en `quienOpera()` de `gastos/acciones.ts`, `return irAIngresar()`.

- [ ] **Paso 4: el ingreso usa el destino**

`IngresarPage` recibe `searchParams: Promise<{ desde?: string }>` y pasa `destino={destinoSeguro(desde, '/')}` a `FormularioIngreso`, que lo manda en `<input type="hidden" name="destino">`. `accionIngresar` usa `destino: destinoSeguro(datos.get('destino'), '/')`.

- [ ] **Paso 5: escribir la prueba e2e**

En `ingresar.spec.ts`, con un escenario de `sembrarEscenario('administrador')` (y su limpieza): `page.goto('/consorcios/' + id + '/gastos')`, esperar `toHaveURL(/\/ingresar\?desde=%2Fconsorcios%2F/)`, completar el formulario y esperar `toHaveURL('/consorcios/' + id + '/gastos')`.

- [ ] **Paso 6: verificar**

Run: `npx vitest run --project dominio pruebas/dominio/destinos.spec.ts && npm run typecheck && npx playwright test pruebas/e2e/ingresar.spec.ts`
Expected: PASS. `grep -rn "redirect('/ingresar')" src/app` solo encuentra `ir-a-ingresar.ts`.

- [ ] **Paso 7: hacer commit y PR de la Parte 3**

```bash
git add src/compartido/destinos.ts src/app pruebas/dominio/destinos.spec.ts pruebas/e2e/ingresar.spec.ts
git commit -m "fix(sesion): al ingresar se vuelve a la pantalla que se pidio (FR-002)"
```

`npx prettier --write . && npm run verificar`; push y PR.

---

## Parte 4 — `fix/pantallas-navegacion` (consume las Partes 1 y 3)

### Tarea 7: los filtros escritos a mano no tiran 500

**Files:**
- Create: `src/compartido/identificadores.ts` (`esUuid`)
- Modify: `src/app/(panel)/con-consorcio.tsx:72-82` (`idONoEncontrado` usa `esUuid`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/gastos/page.tsx:62-70`
- Modify: `src/app/(panel)/consorcios/[consorcio]/reservas/historial/page.tsx:49-51,73-81`
- Test: `pruebas/e2e/navegacion.spec.ts`

**Interfaces:**
- Produces: `esUuid(valor: string | undefined): valor is string`

- [ ] **Paso 1: escribir la prueba que falla**

En `navegacion.spec.ts`, con `unico`: `goto('/consorcios/' + id + '/gastos?periodo=x&rubro=y')` → heading nivel 1 «Gastos»; `goto('/consorcios/' + id + '/reservas/historial?mes=2026-13&espacio=x&unidad=y')` → heading nivel 1 «Historial de reservas».

- [ ] **Paso 2: correrla y ver que falla**

Run: `npx playwright test pruebas/e2e/navegacion.spec.ts -g "filtros"`
Expected: FAIL con la pantalla de error.

- [ ] **Paso 3: implementar**

En gastos, `periodoId`/`rubroId` pasan solo si `esUuid`; en el historial, `espacioId`/`unidadId` igual, y el mes valida con `/^\d{4}-(0[1-9]|1[0-2])$/`.

- [ ] **Paso 4: verificar que pasa y hacer commit**

Run: el comando del Paso 2. Expected: PASS.

```bash
git add src/compartido/identificadores.ts "src/app/(panel)" pruebas/e2e/navegacion.spec.ts
git commit -m "fix(filtros): un parametro invalido en la direccion no rompe la pantalla (RNF-10)"
```

### Tarea 8: registrar un pago desde la expensa vuelve a la expensa

**Files:**
- Modify: `src/app/(panel)/consorcios/[consorcio]/pagos/formulario.tsx`, `pagos/modal-pago.tsx`, `pagos/acciones.ts:19-42`
- Modify: `src/app/(panel)/consorcios/[consorcio]/expensas/[detalle]/page.tsx` (`PagoExpensa`)
- Test: `pruebas/e2e/expensa.spec.ts`

**Interfaces:**
- Consumes: `destinoSeguro` (Tarea 6), `conHecho` (Tarea 1)
- Produces: `ModalPago` y `FormularioPago` aceptan `unidadInicial?: string` y `vuelta?: string`

- [ ] **Paso 1: escribir la prueba que falla**

En `expensa.spec.ts`, un `describe` con `sembrarEscenario('administrador')` + `sembrarExpensa`: abrir `/consorcios/<id>/expensas/<detalleId>`, clic en «Registrar un pago», esperar que `getByLabel('Unidad')` tenga el valor de la unidad de la expensa, cargar un importe, enviar y esperar `toHaveURL(new RegExp('/expensas/' + detalleId + '\\?hecho=pago-registrado'))`.

- [ ] **Paso 2: correrla y ver que falla**

Run: `npx playwright test pruebas/e2e/expensa.spec.ts -g "pago"`
Expected: FAIL: termina en `/pagos`.

- [ ] **Paso 3: implementar**

- `FormularioPago`: `defaultValue={unidadInicial}` en el `<select>` y, si hay `vuelta`, un `<input type="hidden" name="vuelta">`.
- `accionRegistrarPago`: `redirect(conHecho(destinoSeguro(datos.get('vuelta'), `/consorcios/${consorcioId}/pagos`, `/consorcios/${consorcioId}/`), 'pago-registrado'))`.
- `PagoExpensa`: recibe la expensa y pasa `unidadInicial` (la unidad de `consorcio.unidades` cuya `designacion` es la de la expensa) y `vuelta={`/consorcios/${base}/expensas/${expensa.detalleId}`}`.

- [ ] **Paso 4: verificar que pasa y hacer commit**

Run: el comando del Paso 2. Expected: PASS.

```bash
git add "src/app/(panel)/consorcios/[consorcio]" pruebas/e2e/expensa.spec.ts
git commit -m "fix(pagos): registrar desde la expensa vuelve a la expensa con la unidad elegida (CU-04)"
```

### Tarea 9: la Bandeja solo para quien administra

**Files:**
- Create: `src/aplicacion/consorcios/administra-alguno.ts` (sin Prisma: solo el repositorio)
- Modify: `src/app/(panel)/marco.tsx:61-63`, `src/app/(panel)/navegacion.tsx:24-37` (`NavegacionGlobal({ conBandeja }: { conBandeja: boolean })`)
- Modify: `src/app/(panel)/bandeja/page.tsx:31` (sin consorcios administrados, `redirect('/consorcios')`)
- Test: `pruebas/dominio/administra-alguno.spec.ts`, `pruebas/e2e/consorcista.spec.ts`

**Interfaces:**
- Produces: `administraAlguno(repositorio: RepositorioHabilitaciones, reloj: Reloj, usuarioId: string): Promise<boolean>`: recorre `consorciosDe` y corta en el primer `accesoVigente` con rol `administrador`.

- [ ] **Paso 1: escribir las pruebas que fallan**

Dominio, con un repositorio falso: `true` si el segundo de dos consorcios lo administra; `false` con solo `consorcista`; `false` sin consorcios. E2E en `consorcista.spec.ts`: `await expect(page.getByRole('link', { name: 'Bandeja' })).toHaveCount(0)`, y `goto('/bandeja')` termina en `/consorcios`.

- [ ] **Paso 2: correrlas y ver que fallan**

Run: `npx vitest run --project dominio pruebas/dominio/administra-alguno.spec.ts && npx playwright test pruebas/e2e/consorcista.spec.ts -g Bandeja`
Expected: FAIL.

- [ ] **Paso 3: implementar**

`Marco` calcula `administraAlguno(HABILITACIONES, RELOJ, usuarioId)` una vez y con eso decide si dibuja el ícono de la Bandeja y si le pasa `conBandeja` a `NavegacionGlobal`.

- [ ] **Paso 4: verificar que pasan y hacer commit**

Run: el comando del Paso 2. Expected: PASS.

```bash
git add src/aplicacion/consorcios/administra-alguno.ts "src/app/(panel)" pruebas/dominio/administra-alguno.spec.ts pruebas/e2e/consorcista.spec.ts
git commit -m "fix(bandeja): solo la ve quien administra algun consorcio (RNF-03)"
```

### Tarea 10: detalles de destino

**Files:**
- Modify: `src/app/(panel)/consorcios/[consorcio]/liquidaciones/[id]/page.tsx:56`
- Modify: `src/app/(panel)/consorcios/[consorcio]/expensas/page.tsx:324`
- Modify: `src/app/(panel)/consorcios/[consorcio]/expensas/[detalle]/acciones.ts:26-27`

- [ ] **Paso 1: implementar**

- Liquidación: `Volver` va a `/periodos` si `administra` y a `/expensas` si no (el consejo entra desde Expensas).
- Expensas, tarjeta sin período: el administrador va a `/gastos?abrir=1`; el resto, a `/gastos`.
- Pago en línea: el origen de retorno es `process.env.URL_PUBLICA` o, si falta, `` `${x-forwarded-proto ?? 'http'}://${host}` `` de `headers()`, en vez de `localhost:3000`. La URL de notificación no se toca.

- [ ] **Paso 2: verificar**

Run: `npm run typecheck && npm run lint && npx playwright test pruebas/e2e/expensa.spec.ts pruebas/e2e/liquidar.spec.ts`
Expected: PASS.

- [ ] **Paso 3: hacer commit y PR de la Parte 4**

```bash
git add "src/app/(panel)/consorcios/[consorcio]"
git commit -m "fix(navegacion): volver, alta directa y retorno de pago apuntan a donde corresponde (RF-28)"
```

`npx prettier --write . && npm run verificar`; push y PR.
