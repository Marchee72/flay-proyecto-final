# Anular solo la última liquidación — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que anular solo alcance a la última liquidación emitida, reabra ese período para corregirlo y reemitirlo, y que la reemisión cuente el saldo a favor que la anulación liberó.

**Architecture:** Capa de aplicación sobre Next.js + Prisma. `anularLiquidacion` gana una guarda (no hay liquidación vigente de un mes posterior) y, en la misma transacción que ya tiene, reabre el período a `abierto` para que se pueda editar y reliquidar. `liquidarPeriodo` ya aplica el saldo a favor al total, así que la reemisión lo hereda; se quita el atajo que permitía reemitir desde `liquidado`, que esta nueva vía vuelve innecesario y contradictorio. El botón de anular en la tabla de períodos se muestra solo en la última liquidación. Sin cambios de esquema: se reutilizan `Liquidacion.estado`, `Periodo.estado`, `PagoImputacion.revertidaEn` y `Pago.saldoAFavor`.

**Tech Stack:** TypeScript, Next.js 15, Prisma 6, Vitest (integración contra PostgreSQL local), React 19.

**Spec:** `specs/003-liquidacion/contracts/liquidacion-y-pagos.md` (contrato de `anularLiquidacion`, que este plan enmienda) + la sección *Contexto y decisiones* de abajo, donde quedó la convergencia del brainstorming.

## Contexto y decisiones

El sistema ya tiene dos reglas que hoy se contradicen en el código: del lado de los gastos (`dominio/periodos/estado.ts`, mensaje de `PeriodoNoAdmiteGastos`) dice que lo que se corrige después de liquidar "va como ajuste en el período siguiente"; del lado de la liquidación (RN-06) dice "anulá y reemití", sin límite de antigüedad. Por eso hoy se puede anular una liquidación de hace tres años, lo cual además corrompe la cadena de deuda: al liquidar un mes, el cálculo hornea en `deudaAnterior` la deuda de las liquidaciones **vigentes** anteriores (`liquidar.ts` → `deudaVigentePorUnidad`), así que anular una vieja deja al mes siguiente ya emitido contando plata que dejó de existir.

Decisiones tomadas con el usuario:

- **D1 — "Última" = sin vigente posterior.** Anular la liquidación del período P se permite solo si no existe ninguna `Liquidacion` con `estado = 'vigente'` cuyo período tenga `(anio, mes)` estrictamente posterior a los de P (en el mismo consorcio; el aislamiento ya lo garantiza). Es la que todavía no fue consumida por un mes posterior.
- **D2 — Anular reabre el período.** En la misma transacción en que revierte imputaciones y marca la liquidación `anulada`, el período vuelve a `abierto`, para que se puedan editar los gastos y reliquidar ("anular permite modificar la liquidación de ese mes"). Es la única vía que saca a un período de `liquidado`; la máquina de estados genérica (`reabrirPeriodo`) sigue sin poder hacerlo.
- **D3 — El saldo a favor ya viaja al total.** La reversión de imputaciones devuelve la plata pagada a `Pago.saldoAFavor` (código existente), y `calcular` ya lee y aplica el saldo a favor por unidad al emitir. La reemisión, al correr sobre un período reabierto, lo hereda sin código nuevo.

**Fuera de alcance (ver Review Focus #1):** al aplicar saldo a favor en una liquidación, `calcular` reduce el total de la unidad pero **no decrementa** `Pago.saldoAFavor`. Es un comportamiento preexistente de toda liquidación que aplica saldo, no propio de la reemisión. Este plan no lo toca; se deja anotado como riesgo a decidir aparte.

---

## Global Constraints

- **Todo en español**: nombres, mensajes, comentarios y commits (CLAUDE.md).
- **Aritmética decimal de precisión fija; punto flotante prohibido para dinero.** Ninguna firma de dominio usa `number` para importes; se usa `Prisma.Decimal`/`Decimal` y se serializa a cadena hacia la interfaz.
- **Aislamiento por consorcio en la capa de acceso**: usar el cliente `prisma` aislado (no `prismaBase`) para toda lectura/escritura de negocio.
- **TDD obligatorio en liquidación**: test que falla primero, luego implementación.
- **Sin DDL**: este cambio no modifica el esquema ni agrega migraciones.
- **Commits referencian el código**: `FR-003b`, `RN-06`.
- Node `>=22.21.0 <23`. Un único test de integración se corre con `vitest run --project integracion <ruta>`.

## Review Focus

- **Saldo a favor sobrante tras aplicarse (preexistente, lo expone la reemisión):** `calcular` aplica `saldoAFavorAplicado` al total pero no decrementa `Pago.saldoAFavor`; el estado de cuenta suma `Pago.saldoAFavor` directo (`pagos/estado-de-cuenta.ts`). Tras anular→reemitir, el crédito liberado reduce el nuevo total **y** sigue figurando entero como disponible. Cubierto parcialmente: el test de la Tarea 2 fija que el total de la reemisión se reduce; la reconciliación del sobrante queda como decisión pendiente (ver *Fuera de alcance*).
- **Anular con un mes posterior ya liquidado:** debe rechazarse con mensaje comprensible, no romper la cadena de deuda. Cubierto: Tarea 1.
- **Documentos y avisos de la liquidación anulada:** anular no limpia el documento de expensa ya encolado/emitido ni la notificación "liquidación publicada" del período; la reemisión encola nuevos y los viejos quedan. No se corrige acá; anotado para que la revisión lo vea.
- **Reabrir y editar:** con el período de nuevo `abierto`, un alta de gasto que leyó `abierto` y confirma mientras se reliquida podría colarse (mismo `ponytail:` ya anotado en `liquidar.ts`). Riesgo bajo y preexistente; no se amplía.
- **UI vs. servidor:** ocultar el botón de anular en meses no-últimos es solo UX; la guarda del servidor (Tarea 1) es la que manda. Cubierto: Tarea 1 (enforcement) + Tarea 3 (UX).

---

### Task 1: Guarda — anular solo la última liquidación

**Files:**
- Modify: `src/aplicacion/liquidacion/anular.ts`
- Test: `pruebas/integracion/liquidacion.spec.ts`

**Interfaces:**
- Consumes: `anularLiquidacion(repositorio, reloj, { usuarioId, consorcioId, liquidacionId })` (firma existente, sin cambios).
- Produces: nueva clase de error exportada `LiquidacionNoEsLaUltima extends ErrorDeAplicacion`, lanzada cuando existe una liquidación vigente de un período posterior.

- [ ] **Step 1: Escribir el test que falla** en `pruebas/integracion/liquidacion.spec.ts`, dentro del `describe('anulacion y reemision (FR-003b)')`:

```ts
it('solo se puede anular la última liquidación (RN-06)', async () => {
  const enero = await periodoConGasto(1)
  const primeroEnero = await liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId: enero })

  const marzo = await periodoConGasto(3)
  await liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId: marzo })

  // Enero ya no es la última: marzo tiene una liquidación vigente posterior.
  await expect(
    anularLiquidacion(repo, RELOJ, { usuarioId: administrador, consorcioId, liquidacionId: primeroEnero.liquidacionId }),
  ).rejects.toBeInstanceOf(LiquidacionNoEsLaUltima)
})
```

Importar `LiquidacionNoEsLaUltima` desde `@/aplicacion/liquidacion/anular`.

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npx vitest run --project integracion pruebas/integracion/liquidacion.spec.ts -t "última liquidación"`
Expected: FAIL (`LiquidacionNoEsLaUltima` no existe / la anulación resuelve en vez de rechazar).

- [ ] **Step 3: Implementar la guarda en `anular.ts`**

- Agregar la clase `LiquidacionNoEsLaUltima` con mensaje que apunte a la corrección hacia adelante y código `RN-06`, por ejemplo: `'Solo se puede anular la última liquidación. Para corregir un mes anterior, hacé el ajuste en el período siguiente.'`
- En `anularLiquidacion`, ampliar el `select` de la liquidación para traer `periodo: { select: { anio: true, mes: true } }` (además de `id`, `estado`).
- Después de las comprobaciones de existencia/`anulada` y **antes** de la transacción, consultar con el cliente aislado si hay una vigente posterior y, si la hay, lanzar `LiquidacionNoEsLaUltima`:

```ts
const posterior = await prisma.liquidacion.findFirst({
  where: {
    estado: 'vigente',
    periodo: {
      OR: [
        { anio: { gt: liquidacion.periodo.anio } },
        { anio: liquidacion.periodo.anio, mes: { gt: liquidacion.periodo.mes } },
      ],
    },
  },
  select: { id: true },
})
if (posterior) throw new LiquidacionNoEsLaUltima()
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `npx vitest run --project integracion pruebas/integracion/liquidacion.spec.ts -t "última liquidación"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/aplicacion/liquidacion/anular.ts pruebas/integracion/liquidacion.spec.ts
git commit -m "feat(liquidacion): anular solo la última liquidación (RN-06, FR-003b)"
```

---

### Task 2: Anular reabre el período y la reemisión cuenta el saldo a favor

**Files:**
- Modify: `src/aplicacion/liquidacion/anular.ts`
- Modify: `src/aplicacion/liquidacion/liquidar.ts:82-89` (quitar el atajo de reemitir desde `liquidado` en `calcular`)
- Test: `pruebas/integracion/liquidacion.spec.ts`

**Interfaces:**
- Consumes: la guarda de la Tarea 1 (anular solo procede sobre la última), `registrarPago(...)` desde `@/aplicacion/pagos/registrar`, `liquidarPeriodo(...)`.
- Produces: tras `anularLiquidacion`, el período queda en `estado = 'abierto'` y la liquidación en `anulada`; `Pago.saldoAFavor` recupera lo que estaba imputado.

- [ ] **Step 1: Reescribir el test de reemisión y agregar el de saldo a favor** en `pruebas/integracion/liquidacion.spec.ts`.

Reemplazar el test `'anular no toca el periodo, y la reemision procede igual'` por:

```ts
it('anular reabre el período y la reemisión procede (FR-003b)', async () => {
  const periodoId = await periodoConGasto(6)
  const primera = await liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })

  await anularLiquidacion(repo, RELOJ, { usuarioId: administrador, consorcioId, liquidacionId: primera.liquidacionId })

  // El período vuelve a abierto: anular permite corregir ese mes.
  const periodo = await prismaBase.periodo.findUniqueOrThrow({ where: { id: periodoId } })
  expect(periodo.estado).toBe('abierto')

  const segunda = await liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId, totalRevisado: '1000.00' })
  expect(segunda.liquidacionId).not.toBe(primera.liquidacionId)

  const todas = await prismaBase.liquidacion.findMany({ where: { periodoId }, orderBy: { emitidaEn: 'asc' }, select: { estado: true } })
  expect(todas.map((l) => l.estado)).toEqual(['anulada', 'vigente'])
})
```

Agregar un test que cubre requisitos 2 y 3 (pagó → saldo a favor → reemisión lo descuenta del total):

```ts
it('lo pagado vuelve como saldo a favor y la reemisión lo aplica al total (FR-027)', async () => {
  const periodoId = await periodoConGasto(6) // 1A debe 500 (50% de 1000)
  const primera = await liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })

  const unidad1A = await prismaBase.unidad.findFirstOrThrow({ where: { consorcioId, designacion: '1A' } })
  const pago = await registrarPago(repo, RELOJ, {
    usuarioId: administrador, consorcioId, unidadId: unidad1A.id,
    importe: '500.00', fechaPago: new Date('2026-07-05'), medio: 'transferencia',
  })

  await anularLiquidacion(repo, RELOJ, { usuarioId: administrador, consorcioId, liquidacionId: primera.liquidacionId })

  const pagoTrasAnular = await prismaBase.pago.findUniqueOrThrow({ where: { id: pago.pagoId } })
  expect(pagoTrasAnular.saldoAFavor.toFixed(2)).toBe('500.00')

  const segunda = await liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId, totalRevisado: '1000.00' })
  const detalle1A = await prismaBase.detalleLiquidacion.findFirstOrThrow({
    where: { liquidacionId: segunda.liquidacionId, unidadId: unidad1A.id },
  })
  expect(detalle1A.saldoAFavorAplicado.toFixed(2)).toBe('500.00')
  expect(detalle1A.totalUnidad.toFixed(2)).toBe('0.00')
})
```

Importar `registrarPago` desde `@/aplicacion/pagos/registrar`. Agregar `DELETE FROM "Pago"` al `afterEach` si hiciera falta (ya está).

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npx vitest run --project integracion pruebas/integracion/liquidacion.spec.ts -t "reabre el período"`
Run: `npx vitest run --project integracion pruebas/integracion/liquidacion.spec.ts -t "saldo a favor"`
Expected: FAIL (el período sigue en `liquidado`; la reemisión desde `liquidado` ya no estará permitida tras el Step 4, y hoy el período no se reabre).

- [ ] **Step 3: Reabrir el período en `anular.ts`**

- Ampliar el `select` de la liquidación para traer `periodoId`.
- Dentro de la transacción, después de `tx.liquidacion.update({ ... estado: 'anulada' })`, agregar:

```ts
// Única vía que saca un período de `liquidado`: anular lo reabre para corregir
// y reemitir (D2). La máquina de estados genérica sigue sin poder hacerlo.
await tx.periodo.update({ where: { id: liquidacion.periodoId }, data: { estado: 'abierto' } })
```

- Actualizar el comentario de cabecera del archivo: el período ya **no** queda `liquidado`; anular lo reabre.

- [ ] **Step 4: Quitar el atajo de reemisión desde `liquidado` en `liquidar.ts`**

En `calcular`, reemplazar la condición y su comentario (líneas ~82-89) por la forma simple, ya que la reemisión siempre entra desde un período reabierto (`abierto`/`cerrado`):

```ts
// Un período liquidado no se reliquida: para corregir hay que anular, lo que
// lo reabre (D2). El candado contra la emisión doble sigue siendo el índice
// único parcial de la base.
if (!transicionValida(periodo.estado, 'liquidado')) {
  throw new PeriodoNoLiquidable(periodo.estado)
}
```

- [ ] **Step 5: Correr los tests tocados y verlos pasar**

Run: `npx vitest run --project integracion pruebas/integracion/liquidacion.spec.ts`
Expected: PASS (incluidos los dos nuevos/reescritos y los existentes de emisión, deuda anterior y coeficientes).

- [ ] **Step 6: Commit**

```bash
git add src/aplicacion/liquidacion/anular.ts src/aplicacion/liquidacion/liquidar.ts pruebas/integracion/liquidacion.spec.ts
git commit -m "feat(liquidacion): anular reabre el período para corregir y reemitir (FR-003b, FR-027)"
```

---

### Task 3: Mostrar el botón de anular solo en la última liquidación

**Files:**
- Modify: `src/app/(panel)/consorcios/[consorcio]/periodos/page.tsx`

**Interfaces:**
- Consumes: `listarPeriodos(...)` tal como está. Antes de implementar, confirmar que el campo `periodo.liquidacion` que devuelve es la liquidación **vigente** (no la anulada); si devolviera la anulada, ajustar el gateo para ignorar las anuladas.

- [ ] **Step 1: Calcular el período de la última liquidación y gatear el botón**

En `PeriodosPage`, antes del `.map`, derivar la última liquidada de la lista ya cargada:

```tsx
const ultimaLiquidada = periodos
  .filter((p) => p.liquidacion)
  .reduce<(typeof periodos)[number] | null>(
    (max, p) => (!max || p.anio > max.anio || (p.anio === max.anio && p.mes > max.mes) ? p : max),
    null,
  )
```

Cambiar la condición de render de `<BotonAnular .../>` de `periodo.liquidacion &&` a `periodo.liquidacion && periodo.id === ultimaLiquidada?.id`.

- [ ] **Step 2: Verificar estático y a ojo**

Run: `npm run lint && npm run typecheck`
Expected: PASS. Con `npm run dev`, en un consorcio con dos meses liquidados: el botón "Anular" aparece solo en el más reciente.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(panel)/consorcios/[consorcio]/periodos/page.tsx"
git commit -m "feat(ui): el botón de anular solo en la última liquidación (RN-06)"
```

---

### Task 4: Trazabilidad y documentación

**Files:**
- Modify: `CLAUDE.md` (decisión 12)
- Modify: `specs/003-liquidacion/contracts/liquidacion-y-pagos.md` (contrato `anularLiquidacion`)
- Modify: `docs/entrega-3/07-analisis-de-datos.md` (redacción de RN-06)
- Revisar y, si corresponde, ajustar: `docs/entrega-final/16-manual-usuario.md`, `docs/entrega-final/15-pruebas.md`, `docs/guia-de-recorrido.md`

**Interfaces:** ninguna (solo documentación).

- [ ] **Step 1: Actualizar la decisión 12 de `CLAUDE.md`**

Reflejar que anular solo alcanza a la última liquidación y que **reabre** el período a `abierto` (ya no queda `liquidado`); que la corrección de meses anteriores va como ajuste en el período siguiente; y que se quitó el atajo de reemitir desde `liquidado`.

- [ ] **Step 2: Actualizar el contrato en `specs/003-liquidacion/contracts/liquidacion-y-pagos.md`**

Documentar la precondición "solo la última vigente" (`LiquidacionNoEsLaUltima`, RN-06) y el efecto de reapertura del período.

- [ ] **Step 3: Actualizar RN-06 en `docs/entrega-3/07-analisis-de-datos.md`** y revisar los tres documentos de la lista por si describen el flujo de anulación/reemisión; mantener las referencias cruzadas intactas.

- [ ] **Step 4: Verificación completa**

Run: `npm run verificar`
Expected: PASS de punta a punta (format, lint, typecheck, dominio, migraciones/drift, integración, build, e2e).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md specs/003-liquidacion/contracts/liquidacion-y-pagos.md docs/
git commit -m "docs(liquidacion): anular solo la última y reabre el período (RN-06, FR-003b)"
```
