# Inicio con unidades por edificio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quien tiene unidades en dos o más edificios entra a `/consorcios` y ve, en cada tarjeta, sus unidades.

**Architecture:** Un caso de uso de aplicación junta las unidades propias por consorcio, corriendo
`unidadesPropias` dentro de `enConsorcio` para cada consorcio vigente (sin `IN` a mano). Una función
pura decide la entrada. `/` y `/consorcios` leen el mapa por un `cache` de pedido en `con-consorcio.tsx`.

**Tech Stack:** Next.js (App Router, componentes servidor), Prisma, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-inicio-con-unidades-por-edificio-design.md`

## Global Constraints

- Idioma: español en código, textos y commits; commits con `RF-03`.
- Aislamiento (RN-12, RT-04): las unidades se leen solo con `enConsorcio(id, …)`; nada nuevo entra a la lista blanca de `pruebas/dominio/filtro-unico.spec.ts`.
- Solo cuentan consorcios **no archivados** (`vigentes`) y ocupaciones **vigentes hoy** (propietario o inquilino).
- La condición de la lista es por unidades, no por rol.
- Texto de la tarjeta: `Tus unidades: 3B · Cochera 12` (designaciones separadas por ` · `, orden de `ordenarUnidades`).
- Subtítulo para quien no administra ningún consorcio: `Los edificios a los que tenés acceso. Elegí uno.`
- Antes de pushear: `prettier --write .` y `npm run verificar`.

## Review Focus

1. Unidades en dos edificios pero uno archivado → **no** hay lista (Task 1, prueba de integración).
2. Inquilino que se fue del segundo edificio (ocupación vencida) → no cuenta (Task 1).
3. Ocupación en un consorcio donde ya no tiene habilitación vigente → ese consorcio no aparece (Task 1).
4. Varias unidades en un solo edificio → **no** hay lista; entra como hoy (Task 2, prueba de dominio).
5. Administrador que además es dueño en dos edificios → ve la lista, y sus tarjetas conservan las señales y suman la línea de unidades (Task 3, revisión manual en el navegador).

---

### Task 1: Caso de uso `misUnidadesPorConsorcio`

**Files:**
- Create: `src/aplicacion/consorcios/mis-unidades-por-consorcio.ts`
- Test: `pruebas/integracion/mis-unidades-por-consorcio.spec.ts`

**Interfaces:**
- Consumes: `vigentes(repositorio, reloj, usuarioId)` (`mis-consorcios.ts`), `unidadesPropias(usuarioId, hoy)` (`src/aplicacion/liquidacion/ver-expensa.ts`), `enConsorcio` (`src/infraestructura/cliente-aislado.ts`).
- Produces: `misUnidadesPorConsorcio(repositorio: RepositorioHabilitaciones, reloj: Reloj, usuarioId: string): Promise<Map<string, string[]>>`. La clave es el `consorcioId` y el valor, las designaciones en el orden que devuelve `unidadesPropias`. Los consorcios sin unidades **no** van en el mapa.

- [ ] **Step 1: Escribir la prueba que falla**

Seguí el armado de `pruebas/integracion/accesos.spec.ts`: `crearAdministradora`, `crearConsorcio`, `crearUsuario` y `habilitarEnConsorcio` de `./ayudas`, `limpiar()` en `afterEach`, `repositorioHabilitaciones` y `relojFijo('2026-09-09T12:00:00Z')`. Las unidades van con `prismaBase.unidad.createMany` y la ocupación con el mismo `INSERT INTO "Ocupacion" … daterange(...)` de `sembrarUnidadPropia` (`pruebas/e2e/sesion.ts:311`).

```ts
it('agrupa las unidades propias por consorcio', async () => {
  // usuario consorcista en A (unidades 3B y Cochera 12) y en B (1A)
  const mapa = await misUnidadesPorConsorcio(repositorioHabilitaciones, RELOJ, usuario.id)
  expect(mapa.get(a.id)).toEqual(['3B', 'Cochera 12']) // orden de ordenarUnidades
  expect(mapa.get(b.id)).toEqual(['1A'])
})
it('no incluye un consorcio archivado', async () => {
  // igual, con B.archivado_en = now()
  expect([...mapa.keys()]).toEqual([a.id])
})
it('no cuenta una ocupacion vencida', async () => {
  // en B: daterange('2026-01-01', '2026-06-01')
  expect(mapa.has(b.id)).toBe(false)
})
it('no muestra un consorcio sin habilitacion vigente aunque tenga ocupacion', async () => {
  // ocupación vigente en B, sin habilitación en B
  expect(mapa.has(b.id)).toBe(false)
})
```

Si `ordenarUnidades` no pone `3B` antes de `Cochera 12`, ajustá el valor esperado a lo que devuelve esa función. No cambies la función.

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run --project integracion pruebas/integracion/mis-unidades-por-consorcio.spec.ts`
Expected: FAIL (el módulo no existe).

- [ ] **Step 3: Implementar `misUnidadesPorConsorcio`**

Toma `vigentes(...)` y, por cada consorcio, corre `enConsorcio(c.id, () => unidadesPropias(usuarioId, reloj.hoy()))` en paralelo con `Promise.all`. Agrega al mapa solo los que tienen unidades. Lleva un comentario de una línea: no autoriza nada, solo decide qué se dibuja (como `rolesEn`).

- [ ] **Step 4: Correr y ver que pasa**

Run: el mismo comando. Expected: PASS (4 pruebas).

- [ ] **Step 5: Commit**

```bash
git add src/aplicacion/consorcios/mis-unidades-por-consorcio.ts pruebas/integracion/mis-unidades-por-consorcio.spec.ts
git commit -m "feat(consorcios): unidades propias agrupadas por consorcio (RF-03)"
```

### Task 2: Regla de entrada en `/`

**Files:**
- Modify: `src/app/(panel)/consorcio-activo.ts` (función nueva junto a `destinoDeEntrada`)
- Modify: `src/app/(panel)/con-consorcio.tsx` (cache de pedido)
- Modify: `src/app/page.tsx`
- Test: `pruebas/dominio/entrada-con-unidades.spec.ts`

**Interfaces:**
- Consumes: `misUnidadesPorConsorcio` (Task 1).
- Produces:
  - `eligeAlEntrar(unidades: ReadonlyMap<string, readonly string[]>): boolean` en `consorcio-activo.ts`. Es `true` si hay dos o más claves con al menos una designación.
  - `unidadesPorConsorcio = cache((usuarioId: string) => misUnidadesPorConsorcio(HABILITACIONES, RELOJ, usuarioId))` exportado desde `con-consorcio.tsx`.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
import { eligeAlEntrar } from '@/app/(panel)/consorcio-activo'

it('dos edificios con unidades: elige', () =>
  expect(eligeAlEntrar(new Map([['a', ['3B']], ['b', ['1A']]]))).toBe(true))
it('varias unidades en un solo edificio: no elige', () =>
  expect(eligeAlEntrar(new Map([['a', ['3B', '3C', 'Cochera 12']]]))).toBe(false))
it('sin unidades: no elige', () => expect(eligeAlEntrar(new Map())).toBe(false))
it('una clave vacia no cuenta', () =>
  expect(eligeAlEntrar(new Map([['a', ['3B']], ['b', []]]))).toBe(false))
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run --project dominio pruebas/dominio/entrada-con-unidades.spec.ts`
Expected: FAIL (`eligeAlEntrar` no existe).

- [ ] **Step 3: Implementar `eligeAlEntrar` y conectarla**

En `src/app/page.tsx`, pedí `unidadesPorConsorcio(usuarioId)` en paralelo con `consorciosAlAlcance`. Si `eligeAlEntrar(mapa)`, `redirect('/consorcios')`. Si no, `destinoDeEntrada(...)` como hoy. Actualizá el comentario JSDoc de `Portada`. **No** toques `destinoDeEntrada` ni a quienes la llaman en `marco.tsx` y `[...ruta]/page.tsx`.

- [ ] **Step 4: Correr y ver que pasa**

Run: el mismo comando + `npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx "src/app/(panel)/consorcio-activo.ts" "src/app/(panel)/con-consorcio.tsx" pruebas/dominio/entrada-con-unidades.spec.ts
git commit -m "feat(inicio): con unidades en varios edificios se elige al entrar (RF-03)"
```

### Task 3: Tarjeta con «Tus unidades» y subtítulo, más la e2e

**Files:**
- Modify: `src/app/(panel)/consorcios/page.tsx`
- Modify: `src/app/globals.css` (solo si la línea necesita estilo; preferí `apagado`)
- Test: `pruebas/e2e/inicio-unidades.spec.ts`

**Interfaces:**
- Consumes: `unidadesPorConsorcio` (Task 2), `administraAlguno(HABILITACIONES, RELOJ, usuarioId)` (`src/aplicacion/consorcios/administra-alguno.ts`).

- [ ] **Step 1: Escribir la e2e que falla**

Con `sembrarEscenario('consorcista', 'Mitre 456')` (A) y `sembrarEscenario('consorcista', 'Sarmiento 789')` (B):

- `sembrarUnidadPropia(a)`;
- en B, crear `habilitacion` del usuario de A (rol `consorcista`, desde `2026-01-01`) y llamar `sembrarUnidadPropia({ ...b, personaId: a.personaId })`;
- en `afterAll`, borrar la ocupación y la habilitación de A en B antes de `limpiarEscenario(b)`, igual que hace `inquilinos.spec.ts`.

```ts
test('con unidades en dos edificios elige al entrar, aunque recuerde uno', async ({ page }) => {
  await entrar(page, a.correo)
  const recordado = page.waitForResponse((r) => r.url().endsWith('/api/consorcio-activo'))
  await page.goto(`/consorcios/${a.consorcioId}`)
  await recordado
  await page.goto('/')
  await expect(page).toHaveURL(/\/consorcios$/)
  await expect(page.getByText('Los edificios a los que tenés acceso. Elegí uno.')).toBeVisible()
  await expect(page.getByRole('article', { name: 'Mitre 456' })).toContainText('Tus unidades: 3B')
  await expect(page.getByRole('article', { name: 'Sarmiento 789' })).toContainText('Tus unidades: 3B')
})

test('en teléfono la lista no desborda', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await entrar(page, a.correo)
  await page.goto('/consorcios')
  expect(await desbordaALoAncho(page)).toBe(false)
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm run build && npx playwright test pruebas/e2e/inicio-unidades.spec.ts` (con `CI=1`, nota 34 de CLAUDE.md).
Expected: FAIL. Hoy `/` lleva a `/consorcios/<A>` (el recordado) y no existe el texto de unidades.

- [ ] **Step 3: Implementar en `consorcios/page.tsx`**

- Sumá `unidadesPorConsorcio(usuarioId)` y `administraAlguno(...)` al `Promise.all` que ya existe.
- En la tarjeta, debajo de `<p className="apagado">{direccion} · {localidad}</p>`, agregá `<p className="apagado">Tus unidades: {lista.join(' · ')}</p>` solo si el consorcio tiene unidades en el mapa.
- Si `!administra`, el subtítulo pasa a ser `Los edificios a los que tenés acceso. Elegí uno.`. Si administra, queda el texto de hoy.

- [ ] **Step 4: Correr y ver que pasa**

Run: el mismo comando + `npx playwright test pruebas/e2e/inicio.a11y.spec.ts pruebas/e2e/navegacion.spec.ts`.
Expected: PASS. Revisá a mano el punto 5 de Review Focus: un usuario administrador de A y dueño en A y en B ve la lista, y las tarjetas mantienen las señales.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(panel)/consorcios/page.tsx" pruebas/e2e/inicio-unidades.spec.ts
git commit -m "feat(consorcios): la tarjeta dice qué unidades tenés en cada edificio (RF-03)"
```

### Task 4: Puerta final

- [ ] `prettier --write .`, después `npm run verificar` completo. Expected: todo en verde.
- [ ] Commit del spec y el plan: `git add docs/superpowers/specs/2026-11-21-inicio-con-unidades-por-edificio-design.md docs/superpowers/plans/2026-11-21-inicio-con-unidades-por-edificio.md && git commit -m "docs(inicio): diseño y plan de unidades por edificio (RF-03)"`.
