# Corrección de la confirmación de pagos de Mercado Pago — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un pago aprobado en Mercado Pago se refleje siempre en Flay, tanto por el webhook como por la vista de retorno, y que la preferencia se cree con los parámetros que MP acepta hoy.

**Architecture:** Tres correcciones independientes: (1) el adaptador de infraestructura deja de devolver `sandbox_init_point` y de mandar URLs no públicas; (2) el webhook toma `data.id`/`type` del query string, que es lo que MP firma, y el manifiesto HMAC omite los pares ausentes como el validador oficial; (3) la vista de retorno sondea mientras el pago está pendiente. No cambian contratos de dominio ni el modelo de datos.

**Tech Stack:** Next.js 15 (App Router, Server Actions), TypeScript, Prisma, Vitest (`dominio` e `integracion`), `node:crypto`.

**Spec:** `docs/superpowers/specs/2026-10-15-pago-expensas-mercado-pago-design.md` (§5 Confirmar, §6 Manejo de errores, §7 Pruebas)

## Global Constraints

- Idioma del proyecto: **español** en documentación, comentarios, mensajes de error y commits.
- Importes siempre como `string`; nunca `number` para dinero (invariante 2).
- La presentación no importa infraestructura; el dominio no conoce Mercado Pago (Principio III).
- Secretos (`accessToken`, `secretoWebhook`) nunca se serializan a la UI ni se registran en logs.
- Comparación de firmas con `timingSafeEqual`; nunca `===` sobre el hash.
- Mercado Pago: usar **`init_point`**; `sandbox_init_point` está deprecado y falla silenciosamente.
- Mercado Pago rechaza con 400 (`invalid_back_urls`) `back_urls` y `notification_url` que usen HTTP.
- TDD: el test se escribe y se ve fallar antes de tocar la implementación.
- Antes de cerrar cada tarea: `npm run typecheck` y `npm run lint` en verde.

## Review Focus

- **Desarrollo local sin URL pública** (`URL_PUBLICA=http://localhost:3000`): la preferencia debe crearse igual (sin `back_urls`/`notification_url`) y nadie debe prometer un retorno o webhook que no va a ocurrir. Test: tarea 1, caso HTTP.
- **Notificación con `data.id` en el query y otro distinto en el body**: la firma válida es la del query; procesar el id del body haría fallar la verificación o perder el pago. Test: tarea 2, caso de precedencia.
- **Notificación sin `x-request-id`**: el manifiesto debe omitir el par, no firmar `request-id:null`. Test: tarea 3.
- **Webhook demorado o ausente**: el retorno debe seguir sondeando hasta 60 s y no quedarse en blanco si la consulta falla. Verificación: tarea 4 (manual + typecheck).
- **Confirmación concurrente (retorno + webhook)**: el `updateMany` condicionado a `estado: 'iniciado'` sigue siendo la única barrera; no se toca. Cobertura existente: `pruebas/integracion/pago-en-linea.spec.ts` (webhook aprobado).

---

### Task 1: Preferencia con `init_point` y URLs solo públicas

**Files:**
- Modify: `src/infraestructura/pagos/mercado-pago.ts:26-87`
- Create: `pruebas/dominio/pagos/mercado-pago.spec.ts`
- Modify: `.env.example:41`

**Interfaces:**
- Consumes: `DatosPreferencia` y `ResultadoPreferencia` de `src/dominio/contratos/procesador-pagos.ts` (sin cambios).
- Produces: `ProcesadorMercadoPago.crearPreferencia` devuelve `{ preferenciaId, urlPago }` con `urlPago = init_point`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// pruebas/dominio/pagos/mercado-pago.spec.ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProcesadorMercadoPago } from '@/infraestructura/pagos/mercado-pago'

const credenciales = { accessToken: 'TEST-1234' }

function respuestaPreferencia() {
  return new Response(
    JSON.stringify({
      id: 'pref_1',
      init_point: 'https://www.mercadopago.com.ar/checkout/start?pref_id=pref_1',
      sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/pay?pref_id=pref_1',
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

describe('ProcesadorMercadoPago.crearPreferencia', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('devuelve init_point aunque la respuesta traiga sandbox_init_point', async () => {
    const fetchFalso = vi.fn(async (_url: string, _opciones: RequestInit) => respuestaPreferencia())
    vi.stubGlobal('fetch', fetchFalso)

    const resultado = await new ProcesadorMercadoPago().crearPreferencia({
      credenciales,
      intentoId: 'intento-1',
      titulo: 'Expensas 09/2026 - 3B',
      importe: '1000.00',
      urlRetorno: 'https://flay.app/consorcios/c/expensas/d',
      urlNotificacion: 'https://flay.app/api/pagos/webhook?consorcio=c',
      venceEn: new Date('2026-10-29T12:00:00Z'),
    })

    expect(resultado.urlPago).toContain('mercadopago.com.ar/checkout')
    expect(resultado.urlPago).not.toContain('sandbox')
  })

  it('no envia back_urls, auto_return ni notification_url si la URL publica no es HTTPS', async () => {
    const fetchFalso = vi.fn(async (_url: string, _opciones: RequestInit) => respuestaPreferencia())
    vi.stubGlobal('fetch', fetchFalso)

    await new ProcesadorMercadoPago().crearPreferencia({
      credenciales,
      intentoId: 'intento-1',
      titulo: 'Expensas 09/2026 - 3B',
      importe: '1000.00',
      urlRetorno: 'http://localhost:3000/consorcios/c/expensas/d',
      urlNotificacion: 'http://localhost:3000/api/pagos/webhook?consorcio=c',
      venceEn: new Date('2026-10-29T12:00:00Z'),
    })

    const [, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    const cuerpo = JSON.parse(String(opciones.body)) as Record<string, unknown>
    expect(cuerpo).not.toHaveProperty('back_urls')
    expect(cuerpo).not.toHaveProperty('auto_return')
    expect(cuerpo).not.toHaveProperty('notification_url')
  })
})
```

- [ ] **Step 2: Correr y verlo fallar**

Run: `npx vitest run --project dominio pruebas/dominio/pagos/mercado-pago.spec.ts`
Expected: FAIL — el primer test devuelve la URL de sandbox; el segundo encuentra `back_urls` en el payload.

- [ ] **Step 3: Implementar en `src/infraestructura/pagos/mercado-pago.ts`**

Agregar un helper a nivel de módulo y usarlo para armar el payload condicional:

```ts
/** MP rechaza HTTP y los dominios locales en `back_urls` y `notification_url`. */
function esUrlPublica(url: string): boolean {
  return (
    /^https:\/\//i.test(url) &&
    !/^https:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url)
  )
}
```

En `crearPreferencia`: mover `back_urls` dentro de `if (esUrlPublica(datos.urlRetorno))` junto con `auto_return = 'approved'`; reemplazar el `if` de `notification_url` por `if (esUrlPublica(datos.urlNotificacion))`; devolver `urlPago: json.init_point` (sin `sandbox_init_point`).

- [ ] **Step 4: Correr y verlo pasar**

Run: `npx vitest run --project dominio pruebas/dominio/pagos/mercado-pago.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Documentar el requisito en `.env.example`**

Sobre la línea de `URL_PUBLICA`, dejar explícito:

```
# URL publica base de la aplicacion para retornos y webhooks de pasarela (RF-28).
# Debe ser HTTPS y no localhost: Mercado Pago rechaza HTTP en back_urls y notification_url.
# Sin una URL publica no hay retorno automatico ni webhook (usar tunel en desarrollo).
URL_PUBLICA=http://localhost:3000
```

- [ ] **Step 6: Commit**

```bash
git add src/infraestructura/pagos/mercado-pago.ts pruebas/dominio/pagos/mercado-pago.spec.ts .env.example
git commit -m "fix(pagos): init_point y URLs publicas en la preferencia (RF-28)"
```

---

### Task 2: El webhook toma `data.id` y `type` del query string

**Files:**
- Modify: `src/app/api/pagos/webhook/route.ts:20-44`
- Modify: `src/aplicacion/pagos/confirmar-pago-en-linea.ts:202-243`
- Test: `pruebas/integracion/pago-en-linea.spec.ts` (dentro de `describe('Webhook de Mercado Pago')`)

**Interfaces:**
- Produces: `ParametrosProcesarWebhook` suma `dataIdQuery?: string | null` y `tipoQuery?: string | null`.
- `procesarWebhookPago(procesador, datos)` no cambia su firma posicional ni su retorno.

- [ ] **Step 1: Escribir el test que falla**

```ts
it('toma data.id y type del query string, que es lo que firma Mercado Pago', async () => {
  const secretoWebhook = 'SECRETO-QUERY-1234'
  await guardarCredencialesPago(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    accessToken: 'TEST-TOKEN-1234',
    secretoWebhook,
  })

  const liq = await emitirMes(1, '1000.00')
  const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
    where: { liquidacionId: liq.liquidacionId, unidadId: unidadA },
  })
  const inicio = await iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
    usuarioId: inquilino,
    consorcioId,
    detalleLiquidacionId: detalle.id,
    urlBaseRetorno: 'https://consorcio.app/volver',
  })

  const pagoExternoId = `pago_simulado_${inicio.intentoId}`
  const requestId = 'req-query-1'
  const ts = Math.floor(Date.now() / 1000).toString()
  const manifest = `id:${pagoExternoId};request-id:${requestId};ts:${ts};`
  const hash = createHmac('sha256', secretoWebhook).update(manifest).digest('hex')

  const req = new Request(
    `http://localhost/api/pagos/webhook?consorcio=${consorcioId}&data.id=${pagoExternoId}&type=payment`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-signature': `ts=${ts},v1=${hash}`,
        'x-request-id': requestId,
      },
      // El body trae otro id y otro tipo: debe ganar el query.
      body: JSON.stringify({ data: { id: 'id-que-no-firma' }, type: 'merchant_order' }),
    },
  )

  const res = await webhookRoute(req)
  expect(res.status).toBe(200)
  expect((await res.json()).estado).toBe('aprobado')

  const intentoDb = await prismaBase.intentoDePago.findUniqueOrThrow({
    where: { id: inicio.intentoId },
  })
  expect(intentoDb.estado).toBe('aprobado')
})
```

- [ ] **Step 2: Correr y verlo fallar**

Run: `npx vitest run --project integracion pruebas/integracion/pago-en-linea.spec.ts -t "query string"`
Expected: FAIL — el id del body no está programado en el procesador (o el tipo `merchant_order` hace que se ignore).

- [ ] **Step 3: Implementar**

En `src/app/api/pagos/webhook/route.ts`, antes de llamar a `procesarWebhookPago`:

```ts
const resultado = await procesarWebhookPago(PROCESADOR_PAGOS, {
  consorcioId,
  xSignature: pedido.headers.get('x-signature'),
  xRequestId: pedido.headers.get('x-request-id'),
  dataIdQuery: searchParams.get('data.id'),
  tipoQuery: searchParams.get('type'),
  body,
})
```

En `confirmar-pago-en-linea.ts`, dentro de `procesarWebhookPago` (y agregando los dos campos a `ParametrosProcesarWebhook`):

```ts
const dataId =
  datos.dataIdQuery || (dataObj?.id ? String(dataObj.id) : datos.body?.id ? String(datos.body.id) : null)
const tipo =
  datos.tipoQuery ||
  (datos.body?.type as string) ||
  (datos.body?.topic as string) ||
  (datos.body?.action as string)
```

- [ ] **Step 4: Correr y verlo pasar**

Run: `npx vitest run --project integracion pruebas/integracion/pago-en-linea.spec.ts`
Expected: PASS (todos los casos del webhook, incluido el nuevo).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/pagos/webhook/route.ts src/aplicacion/pagos/confirmar-pago-en-linea.ts pruebas/integracion/pago-en-linea.spec.ts
git commit -m "fix(pagos): el webhook lee data.id y type del query string (RF-28)"
```

---

### Task 3: Manifiesto HMAC sin los pares ausentes

**Files:**
- Modify: `src/dominio/pagos/firma-webhook.ts:34-68`
- Test: `pruebas/dominio/pagos/firma-webhook.spec.ts`

**Interfaces:**
- `verificarFirmaWebhookMercadoPago(params: ParametrosFirmaWebhook): boolean` conserva nombre y parámetros; `xRequestId` y `dataId` pasan a ser opcionales en el manifiesto.

- [ ] **Step 1: Escribir el test que falla**

```ts
it('valida aunque no venga x-request-id: el manifiesto omite ese par', () => {
  const ahoraMs = 1770000000000
  const ts = Math.floor(ahoraMs / 1000)
  const manifest = `id:${dataId};ts:${ts};`
  const hash = createHmac('sha256', secreto).update(manifest).digest('hex')

  const valido = verificarFirmaWebhookMercadoPago({
    xSignature: `ts=${ts},v1=${hash}`,
    xRequestId: null,
    dataId,
    secreto,
    ahoraMs,
  })

  expect(valido).toBe(true)
})
```

- [ ] **Step 2: Correr y verlo fallar**

Run: `npx vitest run --project dominio pruebas/dominio/pagos/firma-webhook.spec.ts`
Expected: FAIL — hoy devuelve `false` porque `xRequestId` es obligatorio.

- [ ] **Step 3: Implementar**

Reemplazar el guard inicial por `if (!xSignature || !secreto) return false` y armar el manifiesto omitiendo pares ausentes:

```ts
const manifest =
  [
    dataId ? `id:${dataId}` : null,
    xRequestId ? `request-id:${xRequestId}` : null,
    `ts:${tsStr}`,
  ]
    .filter((parte): parte is string => parte !== null)
    .join(';') + ';'
```

- [ ] **Step 4: Correr y verlo pasar**

Run: `npx vitest run --project dominio pruebas/dominio/pagos/firma-webhook.spec.ts`
Expected: PASS (6 tests: los 5 existentes siguen verdes).

- [ ] **Step 5: Commit**

```bash
git add src/dominio/pagos/firma-webhook.ts pruebas/dominio/pagos/firma-webhook.spec.ts
git commit -m "fix(pagos): firma de webhook sin pares ausentes en el manifiesto (RF-28)"
```

---

### Task 4: Sondeo de la vista de retorno

**Files:**
- Create: `src/app/(panel)/consorcios/[consorcio]/expensas/[detalle]/sondeo-pago.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/expensas/[detalle]/page.tsx:56-77` y `125-132`

**Interfaces:**
- Produces: `<SondeoPago intentos={20} intervaloMs={3000} />` — componente cliente sin salida visual que refresca la ruta actual.

- [ ] **Step 1: Crear el componente**

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Refresca la vista de retorno mientras el pago sigue pendiente (`RF-28`).
 * Se desmonta solo cuando la pagina deja de renderizarlo (pago resuelto).
 */
export function SondeoPago({ intentos = 20, intervaloMs = 3000 }: { intentos?: number; intervaloMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    let hechos = 0
    const id = setInterval(() => {
      hechos += 1
      router.refresh()
      if (hechos >= intentos) clearInterval(id)
    }, intervaloMs)
    return () => clearInterval(id)
  }, [router, intentos, intervaloMs])

  return null
}
```

- [ ] **Step 2: Cablearlo en la página**

En el bloque `estadoRetorno === 'pendiente'` agregar `<SondeoPago />` dentro del `<p>` (o justo después del aviso). En el `catch` de la confirmación (`page.tsx:70-76`), agregar un `else` que deje el retorno en `pendiente` con `mensajeRetorno = 'Estamos verificando tu pago con la pasarela…'`, para que un fallo de consulta no deje la pantalla sin aviso.

- [ ] **Step 3: Verificar tipos, lint y build**

Run: `npm run typecheck && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Verificación manual (sin test automatizado)**

Con `FLAY_PROCESADOR_PAGOS=determinista` no hay estado pendiente; la verificación es: abrir la expensa con `?payment_id=<id inexistente>&status=pending`, comprobar que aparece el aviso de pendiente y que la petición `GET` de la ruta se repite cada 3 s en la pestaña de red hasta 20 veces.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(panel)/consorcios/[consorcio]/expensas/[detalle]/sondeo-pago.tsx" "src/app/(panel)/consorcios/[consorcio]/expensas/[detalle]/page.tsx"
git commit -m "feat(pagos): la vista de retorno sondea el estado del pago (RF-28)"
```

---

### Task 5: Documentación y verificación final

**Files:**
- Modify: `docs/entrega-final/16-manual-usuario.md` (§ 16.4.5)
- Modify: `CLAUDE.md` ("Lo que no se adivina", entrada de webhook de pagos)

**Interfaces:**
- Consumes: nada nuevo; documenta el comportamiento de las tareas 1–4.

- [ ] **Step 1: Actualizar el manual**

En § 16.4.5 agregar una línea: el cobro en línea requiere `URL_PUBLICA` HTTPS y accesible públicamente; en desarrollo se usa un túnel porque Mercado Pago no envía webhooks ni retorna a `localhost`. En producción, un pago aprobado se refleja por el webhook y, si el webhook demora, la vista de retorno lo confirma al volver.

- [ ] **Step 2: Actualizar `CLAUDE.md`**

Agregar en "Lo que no se adivina": `init_point` (nunca `sandbox_init_point`); `back_urls`/`notification_url` solo con HTTPS público; el webhook lee `data.id`/`type` del query string.

- [ ] **Step 3: Correr la verificación completa del área**

Run: `npm run format:check && npm run lint && npm run typecheck && npm run test:dominio && npm run test:integracion`
Expected: todo en verde.

- [ ] **Step 4: Commit**

```bash
git add docs/entrega-final/16-manual-usuario.md CLAUDE.md
git commit -m "docs(pagos): requisito de URL publica HTTPS y lectura del webhook (RF-28)"
```
