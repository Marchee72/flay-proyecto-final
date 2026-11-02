# Conciliación resiliente de pagos de Mercado Pago — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un pago aprobado en Mercado Pago quede registrado, imputado y notificado en Flay aunque no lleguen ni el webhook ni el retorno, incluso con `URL_PUBLICA=http://localhost:3000`.

**Architecture:** Hoy el pago solo se confirma por *push*: el webhook o la vista de retorno con `?payment_id=`. Con una URL no pública (`esUrlPublica()` en `src/infraestructura/pagos/mercado-pago.ts:24`) la preferencia sale sin `back_urls` ni `notification_url`, y el `IntentoDePago` queda `iniciado` para siempre. El plan suma un camino *pull*: Flay le pregunta a Mercado Pago por `external_reference = intentoId` (`GET /v1/payments/search`) y confirma lo aprobado con el `confirmarPagoEnLinea` que ya existe, que sigue siendo el único que escribe. Tres disparadores para la conciliación: (1) la vista de la expensa, (2) la pestaña original, que sondea mientras se paga en la otra, y (3) un trabajo `conciliar_pago` en la cola `TrabajoPendiente` para cuando no hay ninguna pestaña abierta. El webhook y el retorno siguen igual.

**Tech Stack:** Next.js 15 (App Router, Server Actions), TypeScript, Prisma, Vitest (`dominio` e `integracion`), cola `TrabajoPendiente` con drenaje en `after()`.

**Spec:** `docs/superpowers/specs/2026-10-15-pago-expensas-mercado-pago-design.md` (§5 Confirmar, §6 Manejo de errores). El diagnóstico que motiva este plan está en la sección *Architecture*. El plan anterior, `2026-10-28-mercado-pago-confirmacion.md`, ya está implementado y este se apoya en él.

## Global Constraints

- Idioma: **español** en código, comentarios, mensajes y commits. Los commits referencian `RF-28`.
- Importes siempre como `string`, nunca `number` para dinero (invariante 2).
- **Única escritura del pago:** toda confirmación pasa por `confirmarPagoEnLinea` (`src/aplicacion/pagos/confirmar-pago-en-linea.ts:32`). La conciliación decide *qué* confirmar, nunca crea `Pago` por su cuenta.
- **Aislamiento (RN-12, RT-04, CLAUDE.md #20):** los archivos nuevos no escriben `consorcioId` en un `where` a mano, porque rompería `filtro-unico.spec.ts`. Las lecturas de `IntentoDePago` van con `enConsorcio(consorcioId, () => prisma.intentoDePago…)`.
- Cada interfaz del dominio tiene tres implementaciones: Mercado Pago, de prueba y nula (invariante 5).
- Secretos (`accessToken`, `secretoWebhook`) nunca en logs ni en la UI.
- Todo `fetch` a Mercado Pago lleva `signal: AbortSignal.timeout(8000)`.
- TDD: el test se escribe y se ve fallar antes de implementar.
- Antes de cerrar cada tarea: `npm run typecheck`, `npm run lint` y `npx prettier --write` sobre los archivos tocados.

## Review Focus

- **Pago aprobado en localhost, sin webhook ni retorno, con el inquilino volviendo a la pestaña original:** la pantalla tiene que pasar a «acreditado» sola y la notificación tiene que existir. Test: tarea 2 («concilia un intento aprobado sin webhook ni retorno»). Verificación manual: tarea 4, paso 6.
- **Conciliación y webhook al mismo tiempo sobre el mismo pago:** un solo `Pago` y una sola notificación. Test: tarea 2 («concurrente con el webhook no duplica»).
- **Mercado Pago caído o lento durante el render:** la vista no se rompe. Con `intentoId` muestra «esperando», sin él no muestra aviso, y el intento no cambia. Test: tarea 2 («propaga el error de la pasarela sin tocar el intento»). El `catch` de la página es la tarea 4.
- **`intentoId` ajeno en la URL**, de otro detalle o de otro consorcio: no concilia ni muestra el estado de un pago ajeno. Test: tarea 2 (`NoEncontrado` en los dos casos).
- **Checkout abandonado:** queda «esperando» sin escribir nada. Pasadas 72 h del vencimiento ya no consulta la pasarela. En la cola termina `agotado` a los ~15 min, y eso es **aceptado**: la bandeja lo muestra y «Reintentar» vuelve a consultar. Test: tarea 2 («vencido hace más de 72 h») y tarea 3 («lanza mientras no hay pago»).

---

### Task 1: `buscarPagosPorReferencia` en el contrato y sus tres implementaciones

**Files:**
- Modify: `src/dominio/contratos/procesador-pagos.ts`
- Modify: `src/infraestructura/pagos/mercado-pago.ts`
- Modify: `src/infraestructura/pagos/procesador-de-prueba.ts`
- Modify: `src/infraestructura/pagos/procesador-nulo.ts`
- Modify: `src/aplicacion/dependencias.ts:113-122` (despachador `PROCESADOR_PAGOS`)
- Test: `pruebas/dominio/pagos/mercado-pago.spec.ts`

**Interfaces:**
- Produces, en `procesador-pagos.ts`:
  ```ts
  export interface PagoEncontrado {
    pagoExternoId: string
    estado: EstadoPagoExterno
  }
  // en ProcesadorDePagos:
  buscarPagosPorReferencia(datos: {
    credenciales: CredencialesProcesador
    referenciaExterna: string
  }): Promise<PagoEncontrado[]> // más reciente primero
  ```
- `ProcesadorDePrueba.buscarPagosPorReferencia` devuelve las entradas de `pagosSimulados` cuya `referenciaExterna` coincide (clave = `pagoExternoId`), en orden inverso de inserción. `crearPreferencia` sigue programando un pago aprobado por defecto: para simular «todavía no pagó», los tests llaman a `procesadorDePrueba.limpiar()` después de iniciar.
- `ProcesadorNulo.buscarPagosPorReferencia` lanza `ProcesadorDePagosDeshabilitado`.

- [ ] **Step 1: Escribir los tests que fallan** en `pruebas/dominio/pagos/mercado-pago.spec.ts`, con un nuevo `describe('ProcesadorMercadoPago.buscarPagosPorReferencia')` y el mismo `vi.stubGlobal('fetch', …)` que ya usa el archivo:
  - `consulta /v1/payments/search por external_reference, del más reciente al más viejo`: la URL que recibe `fetch` contiene `/v1/payments/search`, `external_reference=intento-1`, `sort=date_created` y `criteria=desc`, y el header `Authorization` es `Bearer TEST-1234`.
  - `traduce cada resultado a PagoEncontrado`: la respuesta `{ results: [{ id: 111, status: 'approved' }, { id: 222, status: 'in_process' }, { id: 333, status: 'rejected' }] }` da `[{ pagoExternoId: '111', estado: 'aprobado' }, { pagoExternoId: '222', estado: 'pendiente' }, { pagoExternoId: '333', estado: 'rechazado' }]`. Los ids pasan de número a cadena.
  - `sin resultados devuelve una lista vacía`: `{ results: [] }` da `[]`.
  - `un error HTTP lanza ErrorProcesadorPago`: status 500 hace que `rejects.toBeInstanceOf(ErrorProcesadorPago)`.

- [ ] **Step 2: Correrlos y verlos fallar**

  Run: `npx vitest run --project dominio pruebas/dominio/pagos/mercado-pago.spec.ts`
  Expected: FAIL, `buscarPagosPorReferencia is not a function`.

- [ ] **Step 3: Implementar.** En `mercado-pago.ts`, extraer el `switch` de `consultarPago` a `function estadoDesdeMercadoPago(status: string): EstadoPagoExterno` (a nivel de módulo, lo usan los dos métodos) y agregar `buscarPagosPorReferencia` con `encodeURIComponent` sobre la referencia y `AbortSignal.timeout(8000)`. Sumar el método a las implementaciones de prueba y nula, y al despachador de `dependencias.ts`.

- [ ] **Step 4: Verlos pasar y verificar tipos**

  Run: `npx vitest run --project dominio pruebas/dominio/pagos/mercado-pago.spec.ts && npm run typecheck`
  Expected: PASS y sin errores de tipo. Las tres clases implementan el contrato.

- [ ] **Step 5: Commit**

  ```bash
  git add src/dominio/contratos/procesador-pagos.ts src/infraestructura/pagos src/aplicacion/dependencias.ts pruebas/dominio/pagos/mercado-pago.spec.ts
  git commit -m "feat(pagos): buscar pagos de Mercado Pago por referencia externa (RF-28)"
  ```

---

### Task 2: Caso de uso de conciliación

**Files:**
- Create: `src/aplicacion/pagos/conciliar-pago-en-linea.ts`
- Test: `pruebas/integracion/conciliar-pago-en-linea.spec.ts`. Reusa el `beforeEach`, el `afterEach` y `emitirMes` de `pruebas/integracion/pago-en-linea.spec.ts`. Si hay que copiarlos, se mueven a un helper `pruebas/integracion/ayudas-pago-en-linea.ts` y los dos archivos lo importan.

**Interfaces:**
- Consumes: `ProcesadorDePagos.buscarPagosPorReferencia` (tarea 1), `confirmarPagoEnLinea(procesador, { consorcioId, pagoExternoId, intentoId })`, `obtenerCredencialesDescifradas(administradoraId)`, `enConsorcio`.
- Produces:
  ```ts
  export type EstadoConciliacion = 'aprobado' | 'rechazado' | 'vencido' | 'esperando'
  export interface ResultadoConciliacion { intentoId: string; estado: EstadoConciliacion }

  export async function conciliarIntento(
    procesador: ProcesadorDePagos,
    reloj: Reloj,
    datos: { consorcioId: string; detalleLiquidacionId: string; intentoId: string },
  ): Promise<ResultadoConciliacion>

  export async function conciliarPagosDelDetalle(
    procesador: ProcesadorDePagos,
    reloj: Reloj,
    datos: { consorcioId: string; detalleLiquidacionId: string },
  ): Promise<ResultadoConciliacion[]>
  ```

**Reglas de `conciliarIntento`, en este orden:**
1. Busca el intento con `enConsorcio(consorcioId, …)` por `{ id: intentoId, detalleLiquidacionId }`. Si no existe, `NoEncontrado`.
2. Si `estado === 'aprobado'`, devuelve `aprobado` sin consultar la pasarela. Si es `'vencido'` o no tiene `preferenciaId`, devuelve `vencido` (sin consulta).
3. Si `reloj.ahora() > venceEn + 72 h` (`const HORAS_MARGEN_ACREDITACION = 72`: un pago con tarjeta en revisión puede aprobarse después de que vence la preferencia), devuelve `vencido` sin consulta.
4. Credenciales de la administradora del consorcio. Sin credenciales, devuelve `esperando`.
5. Llama a `buscarPagosPorReferencia({ referenciaExterna: intentoId })`.
6. Si hay aprobados, llama a `confirmarPagoEnLinea` con cada uno y devuelve `aprobado`.
7. Si no, con algún `pendiente` devuelve `esperando`.
8. Si no, cuando el primero (el más reciente) es `rechazado` o `cancelado`, llama a `confirmarPagoEnLinea` con ese id, que marca el intento como rechazado, y devuelve `rechazado`.
9. Si no, devuelve `esperando`.

Los errores de la pasarela **se propagan**: decide quien llama. `conciliarPagosDelDetalle` toma los intentos del detalle con `estado in ('iniciado','rechazado')` y `preferenciaId != null`, y llama a `conciliarIntento` con cada uno, en serie.

- [ ] **Step 1: Escribir los tests que fallan.** Todos arrancan con credenciales guardadas, `emitirMes(1)` e `iniciarPagoEnLinea` para el inquilino sobre el detalle de la unidad A. `RELOJ = relojFijo('2026-09-15T12:00:00Z')`.
  - `concilia un intento aprobado sin webhook ni retorno: crea el Pago, lo imputa y notifica`: `conciliarIntento` da `{ estado: 'aprobado' }`. Hay 1 `Pago` con `referencia === 'MP-pago_simulado_<intentoId>'` y `medio === 'mercado_pago'`, el intento queda en `aprobado` con `pagoId` y hay 1 `Notificacion` con `tipo: 'pago_acreditado'` para el inquilino.
  - `conciliar dos veces no duplica el Pago`: la segunda llamada da `aprobado` y sigue habiendo 1 `Pago`.
  - `sin pago en la pasarela queda esperando y no toca el intento`: con `procesadorDePrueba.limpiar()` después de iniciar, da `esperando`, el intento sigue `iniciado` y hay 0 `Pago`.
  - `un pago pendiente queda esperando`: tras `limpiar()`, `programarPago('mp-pend', { estado: 'pendiente', importe: '500.00', referenciaExterna: intentoId, fechaAprobacion: null })` da `esperando`.
  - `el último pago rechazado marca el intento rechazado`: lo mismo con `estado: 'rechazado'` da `rechazado` y el intento queda `rechazado`.
  - `un aprobado después de un rechazo se concilia`: programar `'mp-rech'` (rechazado) y después `'mp-ok'` (aprobado) da `aprobado` y 1 `Pago` con `referencia 'MP-mp-ok'`.
  - `concurrente con el webhook no duplica`: `Promise.all([conciliarIntento(…), confirmarPagoEnLinea(procesadorDePrueba, { consorcioId, pagoExternoId: 'pago_simulado_<id>', intentoId })])` deja 1 `Pago` y 1 `Notificacion` `pago_acreditado`.
  - `vencido hace más de 72 h no consulta la pasarela`: con `relojFijo('2026-09-20T12:00:00Z')` y `vi.spyOn(procesadorDePrueba, 'buscarPagosPorReferencia')` da `vencido` y el espía tiene 0 llamadas.
  - `propaga el error de la pasarela sin tocar el intento`: con `new ProcesadorNulo()` hay `rejects.toBeInstanceOf(ProcesadorDePagosDeshabilitado)` y el intento sigue `iniciado`.
  - `un intento de otro detalle o de otro consorcio es NoEncontrado`: (a) el mismo `intentoId` con el `detalleLiquidacionId` de la unidad B y (b) un `consorcioId` de otro consorcio creado con `crearConsorcio` dan `rejects.toBeInstanceOf(NoEncontrado)` las dos veces.
  - `conciliarPagosDelDetalle ignora intentos sin preferencia`: se inserta con `prismaBase` un segundo intento `rechazado` sin `preferenciaId` para el mismo detalle. Devuelve un único resultado, el del intento iniciado, con `aprobado`.

- [ ] **Step 2: Correrlos y verlos fallar**

  Run: `npx vitest run --project integracion pruebas/integracion/conciliar-pago-en-linea.spec.ts`
  Expected: FAIL porque el módulo `conciliar-pago-en-linea` no existe.

- [ ] **Step 3: Implementar** `src/aplicacion/pagos/conciliar-pago-en-linea.ts` con las reglas de arriba. La cabecera lleva un comentario de por qué existe: la confirmación *push* (webhook o retorno) no está garantizada, y esta es la red *pull*.

- [ ] **Step 4: Verlos pasar, junto con el resto de pagos y el aislamiento**

  Run: `npx vitest run --project integracion pruebas/integracion/conciliar-pago-en-linea.spec.ts pruebas/integracion/pago-en-linea.spec.ts pruebas/integracion/filtro-unico.spec.ts`
  Expected: PASS. `filtro-unico` sigue verde porque el archivo nuevo no filtra `consorcioId` a mano.

- [ ] **Step 5: Commit**

  ```bash
  git add src/aplicacion/pagos/conciliar-pago-en-linea.ts pruebas/integracion/
  git commit -m "feat(pagos): conciliacion de intentos contra Mercado Pago por referencia (RF-28)"
  ```

---

### Task 3: Trabajo `conciliar_pago` en la cola

**Files:**
- Modify: `prisma/schema.prisma` (`enum TipoTrabajo` suma `conciliar_pago`)
- Create: `prisma/migrations/<timestamp>_trabajo_conciliar_pago/migration.sql`
- Modify: `src/aplicacion/pagos/conciliar-pago-en-linea.ts` (agrega el manejador)
- Modify: `src/aplicacion/pendientes/manejadores.ts`
- Modify: `src/aplicacion/pagos/iniciar-pago-en-linea.ts:213-225` (encola después de guardar la preferencia)
- Test: `pruebas/integracion/conciliar-pago-en-linea.spec.ts`

**Interfaces:**
- Consumes: `conciliarIntento` (tarea 2), `encolar(tipo, carga)` de `src/aplicacion/pendientes/encolar.ts`, `type Manejador` de `drenar.ts`.
- Produces:
  ```ts
  export class PagoTodaviaSinConfirmar extends Error {} // mensaje: 'Mercado Pago todavía no informa un pago aprobado para este intento.'
  export function manejadorConciliacion(procesador: ProcesadorDePagos, reloj: Reloj): Manejador
  ```
  La carga es `{ consorcioId: string; detalleLiquidacionId: string; intentoId: string }` y se valida con `zod` (`z.string().uuid()` en los tres campos), como `INVITACION` en `manejadores.ts`. El manejador **lanza** `PagoTodaviaSinConfirmar` cuando el resultado es `esperando`, para que el drenaje reintente con su espera creciente (30 s · 2ⁿ, 6 intentos, unos 15 min). Con `aprobado`, `rechazado` o `vencido` termina sin error. Un intento `NoEncontrado` también termina sin error: no tiene sentido reintentar.

- [ ] **Step 1: Escribir los tests que fallan**
  - `iniciarPagoEnLinea encola un trabajo conciliar_pago`: después de iniciar hay 1 `trabajoPendiente` con `tipo: 'conciliar_pago'` y `carga.intentoId === inicio.intentoId`.
  - `el manejador lanza mientras no hay pago y concilia cuando aparece`: con `limpiar()`, `manejadorConciliacion(procesadorDePrueba, RELOJ)(carga)` hace `rejects.toBeInstanceOf(PagoTodaviaSinConfirmar)`. Después de `programarPago('mp-ok', { estado: 'aprobado', importe: '500.00', referenciaExterna: intentoId, fechaAprobacion: new Date() })`, `resolves` y hay 1 `Pago`.
  - `el manejador termina sin error con un intento inexistente`: con un `intentoId` aleatorio (`randomUUID()`) da `resolves.toBeUndefined()`.

- [ ] **Step 2: Correrlos y verlos fallar**

  Run: `npx vitest run --project integracion pruebas/integracion/conciliar-pago-en-linea.spec.ts -t "conciliar_pago|manejador"`
  Expected: FAIL. No hay trabajo encolado y `manejadorConciliacion` no existe.

- [ ] **Step 3: Migración.** Sumar `conciliar_pago` al enum. Correr `npx prisma migrate dev --create-only --name trabajo_conciliar_pago` y confirmar que el SQL es exactamente `ALTER TYPE "TipoTrabajo" ADD VALUE 'conciliar_pago';`. Después, `npm run db:deploy && npx prisma generate && npm run db:drift`.

- [ ] **Step 4: Implementar** `manejadorConciliacion` y registrarlo en `MANEJADORES` como `conciliar_pago: manejadorConciliacion(PROCESADOR_PAGOS, RELOJ)`, los dos de `@/aplicacion/dependencias`. En `iniciarPagoEnLinea`, encolar solo cuando se crea un intento nuevo y la preferencia se guardó, nunca al reutilizar uno existente.

- [ ] **Step 5: Verlos pasar**

  Run: `npx vitest run --project integracion pruebas/integracion/conciliar-pago-en-linea.spec.ts pruebas/integracion/pago-en-linea.spec.ts`
  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add prisma src/aplicacion pruebas/integracion/conciliar-pago-en-linea.spec.ts
  git commit -m "feat(pagos): la cola concilia el pago en linea sin pestaña abierta (RF-28)"
  ```

---

### Task 4: La vista de la expensa concilia y la pestaña original espera

**Files:**
- Modify: `src/aplicacion/pagos/resultado-retorno.ts` (función pura de mapeo)
- Test: `pruebas/dominio/pagos/resultado-retorno.spec.ts` (crear)
- Modify: `src/app/(panel)/consorcios/[consorcio]/expensas/[detalle]/page.tsx:58-79` y `127-135`
- Modify: `src/app/(panel)/consorcios/[consorcio]/expensas/[detalle]/acciones.ts`
- Modify: `src/app/(panel)/consorcios/[consorcio]/expensas/[detalle]/boton-pago-en-linea.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/expensas/[detalle]/sondeo-pago.tsx`

**Interfaces:**
- Consumes: `conciliarIntento`, `conciliarPagosDelDetalle` y `ResultadoConciliacion` (tarea 2).
- Produces:
  ```ts
  // resultado-retorno.ts (import type desde conciliar-pago-en-linea: sin Prisma en tiempo de ejecución)
  export function estadoDeConciliacion(
    resultados: readonly ResultadoConciliacion[],
    seguido: boolean, // true si la URL trae ?intentoId (alguien espera ese pago)
  ): 'aprobado' | 'rechazado' | 'pendiente' | null
  // acciones.ts
  export type ResultadoInicioPago = { mensaje: string; urlPago?: string; intentoId?: string }
  ```
  La regla de `estadoDeConciliacion`: con algún `aprobado` da `'aprobado'`. Si no y `seguido`, `rechazado` da `'rechazado'`, `esperando` da `'pendiente'` y `vencido` da `null`. Sin `seguido`, todo lo que no sea aprobado da `null`, porque a una visita común no se le muestran avisos de espera.

- [ ] **Step 1: Escribir los tests que fallan** en `pruebas/dominio/pagos/resultado-retorno.spec.ts`, con un caso por cada fila de la regla: `[aprobado]`, con y sin seguido, da `'aprobado'`; `[esperando]` seguido da `'pendiente'` y sin seguido `null`; `[rechazado]` seguido da `'rechazado'`; `[vencido]` seguido da `null`; `[]` da `null`; `[esperando, aprobado]` sin seguido da `'aprobado'`.

- [ ] **Step 2: Correrlos y verlos fallar**

  Run: `npx vitest run --project dominio pruebas/dominio/pagos/resultado-retorno.spec.ts`
  Expected: FAIL porque `estadoDeConciliacion` no está exportada.

- [ ] **Step 3: Implementar `estadoDeConciliacion` y verla pasar** (mismo comando que el paso 2, ahora PASS).

- [ ] **Step 4: Cablear la presentación**
  - `page.tsx`: el camino `payment_id` queda igual. En el `else`, si viene `intentoId`, `[await conciliarIntento(…, { consorcioId: activo.id, detalleLiquidacionId: detalle, intentoId })]`; si no, `await conciliarPagosDelDetalle(…)`. Después, `estadoRetorno = estadoDeConciliacion(resultados, Boolean(parametros.intentoId))`. Todo va dentro de un `try`, y el `catch` deja `'pendiente'` si hay `intentoId` y `null` si no, sin relanzar. Para `pendiente` seguido, el mensaje es exactamente: «Esperando la confirmación de Mercado Pago. Si ya pagaste, esta pantalla se actualiza sola.»
  - `acciones.ts`: devolver también `intentoId: inicio.intentoId`.
  - `boton-pago-en-linea.tsx`: después de abrir el checkout, `router.replace(`/consorcios/${consorcioId}/expensas/${detalleId}?intentoId=${resultado.intentoId}`)` (`useRouter` de `next/navigation`). Si el navegador bloqueó la pestaña (`nuevaPestana === null`) y hay `urlPago`, `window.location.assign(resultado.urlPago)` en la misma pestaña. Hoy en ese caso no pasa nada.
  - `sondeo-pago.tsx`: los valores por defecto pasan a `intentos = 120` e `intervaloMs = 5000` (10 min). Además, `router.refresh()` en `visibilitychange` cuando `document.visibilityState === 'visible'`, que es el momento en que el inquilino vuelve de la pestaña de Mercado Pago. Limpiar el listener en el cleanup.

- [ ] **Step 5: Verificar estática**

  Run: `npm run typecheck && npm run lint && npx prettier --check "src/app/(panel)/consorcios/[consorcio]/expensas/[detalle]" src/aplicacion/pagos`
  Expected: sin errores.

- [ ] **Step 6: Verificación manual, el caso que motivó el plan**

  Con `URL_PUBLICA=http://localhost:3000`, `FLAY_PROCESADOR_PAGOS=mercado_pago` y credenciales sandbox cargadas:
  1. Entrar como inquilino a una expensa impaga y tocar «Pagar en línea». Se abre Mercado Pago en otra pestaña y la original pasa a `?intentoId=…`, con el aviso «Esperando la confirmación…».
  2. Pagar con una tarjeta de prueba aprobada, **sin** volver al sitio desde Mercado Pago.
  3. Cambiar a la pestaña original. En menos de 5 s aparece el aviso verde de acreditado, la expensa figura pagada y la campana tiene «Pago acreditado».
  4. Repetir cerrando las dos pestañas sin volver y navegar cualquier página del panel con otro usuario: en minutos el pago queda registrado gracias a la cola.

- [ ] **Step 7: Commit**

  ```bash
  git add src/aplicacion/pagos/resultado-retorno.ts pruebas/dominio/pagos/resultado-retorno.spec.ts "src/app/(panel)/consorcios/[consorcio]/expensas/[detalle]"
  git commit -m "feat(pagos): la expensa concilia y la pestaña original espera el pago (RF-28)"
  ```

---

### Task 5: Documentación y gate

**Files:**
- Modify: `docs/entrega-final/16-manual-usuario.md` § 16.4.5 (líneas ~758-761)
- Modify: `CLAUDE.md` («Lo que no se adivina», entrada nueva al final)
- Modify: `.env.example:41-44`

- [ ] **Step 1: Manual.** En § 16.4.5, reemplazar el «Requisito de despliegue» por esto: la `URL_PUBLICA` HTTPS habilita el retorno automático y el webhook, que son la vía rápida; sin ella el pago igual se acredita, porque Flay consulta a Mercado Pago cuando volvés a la pestaña de la expensa y, en segundo plano, durante los minutos siguientes.

- [ ] **Step 2: `CLAUDE.md`.** Entrada nueva: *«El pago en línea se confirma por tres caminos y solo uno escribe.»* Webhook, retorno y conciliación (`conciliar-pago-en-linea.ts`: vista, pestaña original con `?intentoId` y trabajo `conciliar_pago`) terminan los tres en `confirmarPagoEnLinea`, cuyo `updateMany` condicionado es la única barrera contra el doble registro. La conciliación busca por `external_reference = intentoId`. Un checkout abandonado termina `agotado` en la cola a propósito.

- [ ] **Step 3: `.env.example`.** Cambiar «Sin una URL publica no hay retorno automatico ni webhook (usar tunel en desarrollo)» por «Sin una URL publica no hay retorno automatico ni webhook; el pago se concilia igual consultando a Mercado Pago».

- [ ] **Step 4: Gate completo**

  Run: `npm run verificar && npm audit --omit=dev --audit-level=high`
  Expected: todo en verde. No se tocaron dependencias, así que `docs:versiones` no cambia.

- [ ] **Step 5: Commit**

  ```bash
  git add docs/entrega-final/16-manual-usuario.md CLAUDE.md .env.example
  git commit -m "docs(pagos): conciliacion como tercer camino de confirmacion (RF-28)"
  ```
