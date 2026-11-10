# Sala de asamblea en vivo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que un voto, una acreditación o un cambio de punto aparezcan en las demás pantallas abiertas en alrededor de un segundo, sin depender del servicio de tiempo real para funcionar.

**Architecture:** el servidor publica en Ably un aviso sin datos después de cada acción confirmada; cada pantalla escucha por `EventSource`, con un token propio de solo lectura, y relee la sala por el camino de siempre. Los sondeos de `EnVivo` quedan como resguardo: cada 4 s conectado y cada 3 s desconectado.

**Tech Stack:** Next.js 15 (`after`, route handlers, `useTransition`), `fetch` y `EventSource` nativos, Ably REST y SSE, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-sala-en-vivo-design.md`

## Global Constraints

- `ABLY_API_KEY` nunca llega al navegador: sin prefijo `NEXT_PUBLIC_`, nunca versionada, nunca en una respuesta, un error ni un log.
- Base de Ably: `https://main.realtime.ably.net`.
- Canal `asamblea:<asambleaId>`. Mensaje con nombre `cambio`, sin `data`.
- Token con capacidad `{"asamblea:<id>":["subscribe"]}` y la vida por omisión, 1 h.
- Publicar se corta a los 2 s. Un error de publicación se registra y se ignora.
- Sin dependencias nuevas: no se instala el paquete `ably`.
- Sin nombres de producto en `docs/entrega-1/` a `docs/entrega-3/`.
- **Sin commits.** El árbol lleva trabajo previo sin commitear y quien revisa decide cuándo commitear. Cada tarea termina con sus pruebas en verde, no con un commit.
- `npm run test:integracion` vacía las tablas: se corre siempre contra una base aparte, nunca la de demo. El comando está en la tarea 2.

## Review Focus

1. El token vence en plena reunión: la pantalla pide otro y reconecta sola, sin dos conexiones a la vez (tarea 3).
2. Una ráfaga de votos con relecturas lentas: los refrescos no se apilan, y uno colgado no traba la sala (tarea 3).
3. La reunión termina o se cambia de pantalla mientras viaja un pedido de token: no queda una conexión huérfana (tarea 3).
4. Ably responde 401, 429, 500 o no responde al publicar: el voto termina bien y la clave no aparece en el error (tareas 1 y 2).
5. Una pestaña oculta recibe avisos: no relee en segundo plano, y al volver relee una sola vez (tarea 3).

---

### Tarea 1: el puerto y sus dos implementaciones

**Files:**

- Create: `src/dominio/contratos/aviso-en-vivo.ts`
- Create: `src/infraestructura/en-vivo/ably.ts`
- Create: `src/infraestructura/en-vivo/nulo.ts`
- Modify: `src/aplicacion/dependencias.ts`
- Modify: `.env.example`
- Modify: `playwright.config.ts:26-40`
- Test: `pruebas/dominio/aviso-ably.spec.ts`

**Interfaces:**

- Produces:

```ts
// src/dominio/contratos/aviso-en-vivo.ts
export type PermisoDeEscucha = { canal: string; token: string }
export interface AvisoEnVivo {
  publicar(asambleaId: string): Promise<void>
  /** `null`: no hay servicio configurado. */
  permisoDeEscucha(asambleaId: string): Promise<PermisoDeEscucha | null>
}
// src/infraestructura/en-vivo/ably.ts
export const canalDeAsamblea = (asambleaId: string): string
export function avisoAbly(clave: string, pedir: typeof fetch = fetch): AvisoEnVivo
// src/infraestructura/en-vivo/nulo.ts
export const avisoNulo: AvisoEnVivo
// src/aplicacion/dependencias.ts
export const AVISO_EN_VIVO: AvisoEnVivo
```

- [ ] **Paso 1: escribir la prueba que falla**

En `pruebas/dominio/aviso-ably.spec.ts`, con `clave = 'app.key:secretoDePrueba'` y un `pedir` doble que registra URL e `init`:

```ts
it('publica un aviso sin datos, con Basic y corte de 2 s', async () => {
  await avisoAbly(clave, pedir).publicar('a1')
  expect(url).toBe('https://main.realtime.ably.net/channels/asamblea%3Aa1/messages')
  expect(init.headers.authorization).toBe(`Basic ${btoa(clave)}`)
  expect(JSON.parse(init.body)).toEqual({ name: 'cambio' })
  expect(init.signal).toBeInstanceOf(AbortSignal)
})
it('pide un token que solo escucha ese canal', async () => {
  const permiso = await avisoAbly(clave, pedir).permisoDeEscucha('a1')
  expect(url).toBe('https://main.realtime.ably.net/keys/app.key/requestToken')
  const pedido = JSON.parse(init.body)
  expect(pedido.keyName).toBe('app.key')
  expect(pedido.capability).toBe('{"asamblea:a1":["subscribe"]}')
  expect(pedido.nonce).toBeTruthy()
  expect(pedido.timestamp).toBeTypeOf('number')
  expect(permiso).toEqual({ canal: 'asamblea:a1', token: 'tok' })
})
it.each([401, 429, 500])('una respuesta %i rechaza sin mostrar la clave', async (status) => {
  await expect(avisoAbly(clave, conEstado(status)).publicar('a1')).rejects.not.toThrow(/secreto/)
  await expect(avisoAbly(clave, conEstado(status)).publicar('a1')).rejects.toThrow(String(status))
})
it('el aviso nulo no publica y no da permiso', async () => {
  await expect(avisoNulo.publicar('a1')).resolves.toBeUndefined()
  expect(await avisoNulo.permisoDeEscucha('a1')).toBeNull()
})
```

- [ ] **Paso 2: comprobar que falla**

Run: `npx vitest run --project dominio pruebas/dominio/aviso-ably.spec.ts`
Expected: FAIL, el módulo no existe.

- [ ] **Paso 3: implementar**

El puerto, `avisoNulo` y `avisoAbly`. `keyName` es lo anterior al primer `:` de la clave y `nonce` es `crypto.randomUUID()`. El corte es `AbortSignal.timeout(2000)`, también al pedir el token. Una respuesta no `ok` lanza `Error` con el estado HTTP y sin el cuerpo.

- [ ] **Paso 4: componer y documentar la variable**

- En `dependencias.ts`: `AVISO_EN_VIVO = process.env.ABLY_API_KEY ? avisoAbly(process.env.ABLY_API_KEY) : avisoNulo`.
- En `.env.example`: `ABLY_API_KEY=`, con el comentario «Avisos de la sala de asamblea. Vacía: la sala se actualiza cada 3 s. Solo servidor.»
- En cada `webServer` de `playwright.config.ts`: `ABLY_API_KEY: ''`, para que las pruebas no gasten mensajes.

- [ ] **Paso 5: comprobar que pasa**

Run: `npx vitest run --project dominio pruebas/dominio/aviso-ably.spec.ts`
Expected: PASS.

### Tarea 2: publicar al confirmar y dar permiso de escucha

**Files:**

- Create: `src/aplicacion/asambleas/en-vivo.ts`
- Create: `src/app/api/asambleas/[asamblea]/en-vivo/route.ts`
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/acciones.ts:169-189,279-281`
- Test: `pruebas/integracion/asambleas-en-vivo.spec.ts`
- Test: `pruebas/e2e/asambleas.spec.ts`

**Interfaces:**

- Consumes: `AvisoEnVivo`, `PermisoDeEscucha` y `AVISO_EN_VIVO` de la tarea 1.
- Produces:

```ts
// src/aplicacion/asambleas/en-vivo.ts
export async function conAviso<T>(
  aviso: AvisoEnVivo,
  programar: (tarea: () => Promise<void>) => void,
  asambleaId: string,
  trabajo: () => Promise<T>,
): Promise<T>
export async function permisoDeEscucha(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  aviso: AvisoEnVivo,
  datos: { usuarioId: string; consorcioId: string; asambleaId: string },
): Promise<PermisoDeEscucha | null>
```

- La ruta responde `{ canal, token }` con `cache-control: no-store`, o 204, 401 o 404.

- [ ] **Paso 1: escribir la prueba que falla**

En `pruebas/integracion/asambleas-en-vivo.spec.ts`, con el mismo `beforeEach`, `afterEach` y `constituida()` de `asambleas-votacion.spec.ts`:

```ts
it('una acción aceptada publica recién después de terminar', ...)  // publicar 1 vez, tras `trabajo`
it('una acción rechazada no publica y su error sigue viaje', ...)  // rejects con el mismo error; 0 publicaciones
it('si publicar falla, la acción termina bien', ...)               // resuelve con el valor de `trabajo`
it('quien alcanza la asamblea en curso recibe permiso', ...)       // toEqual el permiso del doble
it('sin servicio no hay permiso', ...)                             // con `avisoNulo`, null
it('un usuario de otro consorcio no recibe permiso', ...)          // rejects; 0 llamadas al doble
it('una asamblea que no está en curso no da permiso', ...)         // convocada: NoEncontrado
```

`programar` es en la prueba `(t) => void pendientes.push(t())`, y se espera `Promise.all(pendientes)`.

- [ ] **Paso 2: comprobar que falla**

Preparar la base aparte y correr, con `S` en la carpeta de scripts temporales de la sesión:

```sh
docker exec flay-db psql -U postgres -d postgres -At -c "DROP DATABASE IF EXISTS flay_verif" -c "CREATE DATABASE flay_verif OWNER flay_owner"
docker exec flay-db psql -U postgres -d flay_verif -At -c "CREATE EXTENSION IF NOT EXISTS vector" -c "CREATE EXTENSION IF NOT EXISTS btree_gist" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto" -c "GRANT ALL ON SCHEMA public TO flay_owner"
sh "$S/conbase.sh" sh -c 'npx prisma migrate deploy && npx vitest run --project integracion pruebas/integracion/asambleas-en-vivo.spec.ts'
```

Expected: FAIL, el módulo no existe.

- [ ] **Paso 3: implementar `conAviso` y `permisoDeEscucha`**

- `conAviso` espera `trabajo()` y recién entonces llama a `programar`. La tarea programada captura el error de `publicar` con `console.error('AVISO_EN_VIVO_FALLO', asambleaId)`, sin el objeto de error.
- `permisoDeEscucha` usa `conAutorizacion` con `accion: 'ver asambleas'`, lee `prisma.asamblea.findFirst({ where: { id }, select: { estado: true } })`, lanza `NoEncontrado('RF-29')` si no existe o no está `en_curso`, y devuelve `aviso.permisoDeEscucha(id)`.

- [ ] **Paso 4: enganchar las acciones**

En `ejecutarEnSala`, `await conAviso(AVISO_EN_VIVO, after, base.asambleaId, () => trabajo(base))`. En `accionFinalizar`, la misma envoltura alrededor de `finalizar(...)`. `after` sale de `next/server`.

- [ ] **Paso 5: crear la ruta**

Seguir `src/app/api/asambleas/[asamblea]/ics/route.ts`, con los mismos 401 y 404 y `consorcio` en la consulta. Un `null` responde 204. Un error que no sea `ErrorDeAplicacion` se relanza: el cliente lo trata como reintento.

- [ ] **Paso 6: fijar el 401 en extremo a extremo**

En `pruebas/e2e/asambleas.spec.ts`, una prueba con `request.get` sin sesión a la ruta, que espere 401.

- [ ] **Paso 7: comprobar que pasa**

Run: `sh "$S/conbase.sh" sh -c 'npx vitest run --project integracion pruebas/integracion/asambleas-en-vivo.spec.ts'`
Expected: PASS, 7 pruebas.

### Tarea 3: la lógica de escucha y de refresco, sin navegador

**Files:**

- Create: `src/compartido/refresco-acotado.ts`
- Create: `src/compartido/escucha-en-vivo.ts`
- Test: `pruebas/dominio/refresco-acotado.spec.ts`
- Test: `pruebas/dominio/escucha-en-vivo.spec.ts`

**Interfaces:**

- Produces:

```ts
// src/compartido/refresco-acotado.ts
export function crearRefrescoAcotado(o: {
  refrescar: () => void
  puedeRefrescar: () => boolean
  esperaMs?: number // 500
  topeMs?: number // 5000
}): { avisar(): void; terminado(): void; reanudar(): void; cancelar(): void }

// src/compartido/escucha-en-vivo.ts
export type Permiso = { canal: string; token: string }
export type ResultadoPermiso = Permiso | 'sin-servicio' | 'reintentar'
export type Oyentes = { alAbrir(): void; alMensaje(): void; alError(): void }
export function crearEscucha(o: {
  pedirPermiso: () => Promise<ResultadoPermiso>
  abrir: (permiso: Permiso, oyentes: Oyentes) => { cerrar(): void }
  alCambio: () => void
  alConectado: (conectado: boolean) => void
}): { iniciar(): void; detener(): void }
```

- [ ] **Paso 1: escribir las pruebas que fallan**

Con `vi.useFakeTimers()`. Para `crearRefrescoAcotado`:

```ts
it('veinte avisos seguidos: un refresco ya y uno solo al terminar', ...)
// 20 avisar → 1; terminado + 500 ms → 2; terminado + 500 ms → sigue en 2
it('no repite antes de 500 ms aunque la relectura termine enseguida', ...)
it('un refresco lento retiene el siguiente', ...)
// avisar x2; 3000 ms sin terminado → 1
it('un refresco colgado se libera a los 5 s', ...)
// avisar x2; 5000 ms → 2
it('con la pestaña oculta no refresca, y al volver lo hace una vez', ...)
// puedeRefrescar false; avisar x3 → 0; true y reanudar x2 → 1
it('reanudar sin avisos pendientes no refresca', ...)
it('cancelar descarta lo pendiente', ...)
```

Para `crearEscucha`:

```ts
it('sin servicio no abre ni reintenta', ...)
it('marca conectado al abrir y desconectado ante un error', ...)
it('cada mensaje avisa un cambio', ...)
it('un token vencido: cierra, pide otro y reabre una sola conexión', ...)
// alError → cerrar 1 vez; tras 1 s, pedirPermiso 2 y abrir 2; una sola abierta
it('la espera crece hasta 30 s y vuelve a 1 s al conectar', ...)
// 1, 2, 4, 8, 16, 30, 30
it('al reconectar avisa un cambio, y en la primera conexión no', ...)
it('detener cancela el reintento y cierra la conexión', ...)
it('un permiso que llega después de detener no abre nada', ...)
```

- [ ] **Paso 2: comprobar que fallan**

Run: `npx vitest run --project dominio pruebas/dominio/refresco-acotado.spec.ts pruebas/dominio/escucha-en-vivo.spec.ts`
Expected: FAIL, los módulos no existen.

- [ ] **Paso 3: implementar `crearRefrescoAcotado`**

Un ciclo queda ocupado desde que se llama a `refrescar` hasta que pasaron `esperaMs` **y** llegó `terminado`, o hasta `topeMs`. Un `avisar` durante el ciclo marca que falta otro, y al liberarse se lanza ese. Si `puedeRefrescar` da falso, `avisar` solo anota que quedó sucio.

- [ ] **Paso 4: implementar `crearEscucha`**

`'reintentar'`, un rechazo de `pedirPermiso` y `alError` agendan un intento con espera `min(30_000, 1000 * 2 ** intentos)`. `alAbrir` pone `intentos` en 0. Tras cada `await`, si ya se llamó a `detener`, no se abre nada.

- [ ] **Paso 5: comprobar que pasan**

Run: `npx vitest run --project dominio pruebas/dominio/refresco-acotado.spec.ts pruebas/dominio/escucha-en-vivo.spec.ts`
Expected: PASS.

### Tarea 4: conectar la sala y cerrar la documentación

**Files:**

- Create: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/sala-en-vivo.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/page.tsx:21,67`
- Modify: `specs/016-asambleas/research.md` (R-01)
- Modify: `docs/entrega-final/14-codificacion.md` (§ «Condición sobre la capa gratuita»)
- Modify: `CLAUDE.md` (nota nueva, 29)

**Interfaces:**

- Consumes: `crearRefrescoAcotado` y `crearEscucha` de la tarea 3, la ruta de la tarea 2 y `EnVivo` de `src/app/(panel)/en-vivo.tsx`.
- Produces: `export function SalaEnVivo({ consorcioId, asambleaId }: { consorcioId: string; asambleaId: string })`.

- [ ] **Paso 1: crear `SalaEnVivo`**

Componente cliente que une las piezas:

- Dibuja `<EnVivo cadaMs={conectado ? 4000 : 3000} />`.
- `refrescar` es `iniciar(() => router.refresh())`, con `iniciar` de `useTransition`. Cuando `pendiente` pasa a `false`, llama a `terminado()`.
- `puedeRefrescar` es `!document.hidden && navigator.onLine`. Los eventos `visibilitychange` y `online` llaman a `reanudar()`.
- `pedirPermiso` hace `fetch` a la ruta. 204, 401 y 404 son `'sin-servicio'`; otro estado no `ok` es `'reintentar'`.
- `abrir` crea el `EventSource` contra `https://main.realtime.ably.net/sse?v=1.2&channels=<canal>&accessToken=<token>`, con los dos valores por `encodeURIComponent`.
- La limpieza del efecto llama a `detener()` y `cancelar()`.

- [ ] **Paso 2: montarlo**

En `page.tsx`, reemplazar `<EnVivo />` por `<SalaEnVivo consorcioId={...} asambleaId={...} />`, bajo la misma condición `en_curso`.

- [ ] **Paso 3: actualizar la documentación**

- R-01: la decisión nueva con sus razones, y el sondeo de 3 s como resguardo. Quitar «WebSockets o un proveedor de tiempo real» de las alternativas descartadas.
- § 14: una entrada corta con el servicio, su uso, los límites relevados del plan Free y que el plan gratuito no vale para uso comercial.
- Nota 29 de `CLAUDE.md`: el aviso va sin datos; `conAviso` es el único punto que publica; sin clave corre la implementación nula; el sondeo sigue siendo el motor de la cola (nota 21).

- [ ] **Paso 4: verificar sin servidor**

Run: `npx prettier --write . && npm run lint && npm run typecheck && npm run test:dominio`
Expected: todo en verde.

Después, la integración completa contra `flay_verif`:

Run: `sh "$S/conbase.sh" sh -c 'npx vitest run --project integracion'`
Expected: 367 pruebas en verde, 360 previas y 7 nuevas.

- [ ] **Paso 5: verificar la compilación y las pantallas**

Requiere que quien revisa dé el visto bueno, porque el servidor de desarrollo se detuvo por falta de memoria y el build pisa `.next`.

Run: `npm run build && npm run test:a11y`
Expected: build sin errores y accesibilidad en verde. Después, las pruebas de extremo a extremo contra una base aparte.

- [ ] **Paso 6: prueba manual con Ably real**

Con la clave real y dos navegadores en la misma asamblea en curso, registrar:

- tiempo de voto a pantalla ajena, en cinco votos;
- la consola no muestra errores de conexión;
- al cortar y volver la red, la sala se pone al día sola;
- al quitar `ABLY_API_KEY` y reiniciar, la sala sigue andando cada 3 s;
- buscar la clave en las respuestas de la pestaña Red: no aparece, solo el token.

- [ ] **Paso 7: limpiar**

Run: `docker exec flay-db psql -U postgres -d postgres -At -c "DROP DATABASE IF EXISTS flay_verif"`
Expected: `DROP DATABASE`.
