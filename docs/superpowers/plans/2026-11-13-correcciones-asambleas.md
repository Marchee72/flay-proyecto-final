# Correcciones de asambleas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los defectos de asambleas del informe del 13/11 (A-1 a A-4, M-1 a M-7 y los B que son defectos) sin agregar funcionalidad nueva.

**Architecture:** Cada corrección va donde vive la regla. Las de concurrencia van en la base (candados `FOR UPDATE`/`FOR SHARE` y disparadores, con migración versionada). Las de cómputo van en el dominio puro, con TDD. Las de orquestación van en `src/aplicacion/asambleas`, y las de pantalla en `src/app/(panel)/consorcios/[consorcio]/asambleas`. Son tres ramas, una por grupo, cada una con su PR.

**Tech Stack:** TypeScript, Next.js (server actions), Prisma + PostgreSQL (plpgsql), Vitest (dominio e integración), Playwright (e2e).

**Spec:** `docs/superpowers/informes/2026-11-13-analisis-asambleas.md` (el informe; los códigos A-n/M-n/B-n son los suyos).

## Global Constraints

- Idioma: español en código, mensajes, commits y documentación.
- Commits con el código del requerimiento: RF-29 convocatoria, RF-30 poderes, RF-31 reunión y votación, RF-32 acta, RF-33 oposición. Formato `fix(asambleas): … (RF-nn, A-1)`.
- Toda regla de base, en una **migración nueva** dentro de `prisma/migrations/`. Nunca se edita una migración existente ni se toca la base a mano.
- Una función de disparador que se reemplaza se copia **entera desde su última versión** (`fn_punto_reglas` está en `20261104120000_notas_con_punto_abierto`, no en la original).
- Los mensajes de los disparadores empiezan con `FLAY: `: `traducirErrorDeBase` los convierte en `ReglaDeAsamblea` con ese texto.
- Puerta: `npm run verificar` en verde antes de cada PR, más `npm audit --omit=dev --audit-level=high`. No se agregan dependencias (sin cambios en el § 14.1).
- `npm run test:integracion` vacía la base local: correrlo **después** de terminar de mirar los datos de prueba del informe.
- Las pruebas de integración usan `armarEscenario` / `asambleaConvocada` / `enLaReunion` de `pruebas/integracion/asambleas-ayudas.ts`; las e2e, los ayudantes de `pruebas/e2e/sesion.ts`.

## Fuera de alcance (decidido)

- **B-6** (PDF final regenerado), **B-7** (verificación de huella en cada visita) y las **mejoras 1 a 9** del informe: son decisiones de diseño o rendimiento, no defectos.
- **B-9** (toast de error persistente): es el comportamiento de la nota 24 de `CLAUDE.md`.
- **B-11** (el propietario que dio un poder puede acreditarse igual): «gana el primero» es la regla de FR-016.
- **M-7** (unidad sin propietario en la base total), **decisión mía**: el cómputo no cambia, porque la base son todas las unidades con voto, como en la spec 016. Lo que se corrige es que quien convoca no se enteraba. La tarea 12 la suma al aviso de «sin contacto».

## Review Focus

1. **Nombres con tildes, mayúsculas o espacios de más** al acreditar a mano («ana  ÁLVAREZ» tiene que vincular a Ana Álvarez). → prueba en la tarea 1.
2. **Datos anteriores a la migración:** puntos provisorios cerrados antes de existir `ausentes_con_voto`, y actas que ya quedaron trabadas como la del informe. → backfill verificado en la tarea 2 y `completarActa` sobre un acta trabada en la tarea 4.
3. **Dos personas pulsan «Completar el acta» a la vez** → un solo documento. → prueba en la tarea 4.
4. **Dirección y secretaría editan la nota a la vez y una de las dos pierde la conexión a mitad de camino** → ninguna escritura pisa a otra sin avisar. → prueba en la tarea 6.
5. **Una asamblea abierta donde no aparece nadie** (cero presentes): tiene que poder cancelarse igual. → prueba en la tarea 8.

---

## Rama 1 — `fix/asambleas-votacion` (RF-31, RF-33)

### Task 1: La acreditación a mano solo vincula al titular que coincide (A-2, B-3)

**Files:**
- Modify: `src/aplicacion/asambleas/conducir.ts:194-250` (`acreditar`), `:279-287` (`designarAutoridades`, se va el bloque `sinVincular`)
- Modify: `src/aplicacion/asambleas/votar.ts:84-90` (se va el atajo a titulares)
- Modify: `src/aplicacion/asambleas/ver.ts:421-426` y `:529-533` (se va el atajo `usuarioPropietarioPorUnidad`; `representanteId` es la única fuente)
- Modify: `src/aplicacion/asambleas/errores.ts` (error nuevo)
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/direccion.tsx` (texto de ayuda en `FormularioAcreditar`)
- Create: `src/compartido/nombres.ts`
- Test: `pruebas/integracion/asambleas-votacion.spec.ts`, `pruebas/dominio/nombres.spec.ts`

**Interfaces:**
- Produces: `mismoNombre(a: string, b: string): boolean` en `src/compartido/nombres.ts`. Compara sin tildes, sin distinguir mayúsculas y colapsando espacios.
- Produces: `class SinPoderRegistrado extends ErrorDeAsamblea`, mensaje `La unidad ${designacion} no tiene un poder registrado para esta asamblea.`

- [ ] **Step 1: Escribir las pruebas que fallan**

`pruebas/dominio/nombres.spec.ts`:
```ts
it('ignora tildes, mayúsculas y espacios de más', () => {
  expect(mismoNombre('ana  ÁLVAREZ ', 'Ana Alvarez')).toBe(true)
  expect(mismoNombre('Pedro Hermano', 'Ana Alvarez')).toBe(false)
})
```

En `asambleas-votacion.spec.ts`, `describe('acreditación')`:
```ts
it('acreditar a otra persona por una unidad con titular con cuenta no le da el voto al titular', async () => {
  await abrir(repo, RELOJ, de(e.consejo))
  await acreditar(repo, RELOJ, { ...de(e.consejo), unidadId: e.unidades['1A'], nombre: 'Pedro Hermano', representacion: 'propietario' })
  const fila = await prismaBase.unidadEnAsamblea.findFirstOrThrow({ where: { asambleaId, unidadId: e.unidades['1A'] } })
  expect(fila).toMatchObject({ representanteNombre: 'Pedro Hermano', representanteId: null })
  // Ana no estaba: no vota ni se la puede designar.
  await acreditarme(repo, RELOJ, de(e.bruno)); await acreditarme(repo, RELOJ, de(e.carla))
  await expect(designarAutoridades(repo, RELOJ, { ...de(e.consejo), presidenteId: e.ana, secretarioId: e.carla })).rejects.toBeInstanceOf(NoPresente)
  const vista = await verAsamblea(repo, RELOJ, de(e.ana))
  expect(vista.yo.misUnidades.find((m) => m.unidadId === e.unidades['1A'])).toMatchObject({ acreditada: true, laRepresentoYo: false })
})

it('el nombre del titular vincula aunque cambien tildes y mayúsculas', async () => {
  await abrir(repo, RELOJ, de(e.consejo))
  await acreditar(repo, RELOJ, { ...de(e.consejo), unidadId: e.unidades['1A'], nombre: 'ana  ÁLVAREZ', representacion: 'propietario' })
  const fila = await prismaBase.unidadEnAsamblea.findFirstOrThrow({ where: { asambleaId, unidadId: e.unidades['1A'] } })
  expect(fila.representanteId).toBe(e.ana)
})

it('acreditar como apoderado exige un poder registrado y vincula al apoderado', async () => {
  await abrir(repo, RELOJ, de(e.consejo))
  await expect(acreditar(repo, RELOJ, { ...de(e.consejo), unidadId: e.unidades['2B'], nombre: 'Cualquiera', representacion: 'apoderado' })).rejects.toBeInstanceOf(SinPoderRegistrado)
})
```
Más un caso con poder en papel de Dora a Iván, registrado **antes** de `abrir`: el resultado esperado es `representanteId: e.ivan`, `representacion: 'apoderado'` y `representanteNombre: 'Ivan Inquilino'`.

Además, la prueba «quien dirige acredita…» del `beforeEach`/`armarReunion` de `asambleas-notas-observaciones.spec.ts:57` acredita a Iván como apoderado. Si alguna aserción esperaba `representanteId: null` para él, pasa a `e.ivan`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run pruebas/dominio/nombres.spec.ts pruebas/integracion/asambleas-votacion.spec.ts -t "acredit|nombre|apoderado"`
Expected: FAIL. `mismoNombre` no existe, `representanteId` vale el de Ana y el apoderado se acredita sin poder.

- [ ] **Step 3: Implementar**

- `mismoNombre` usa `normalize('NFD')`, quita los diacríticos, `toLocaleLowerCase('es')` y colapsa `\s+`.
- `acreditar`:
  - con `representacion === 'propietario'` y sin `representanteId`, vincula solo `titulares.find((t) => t.usuarioId && mismoNombre(t.nombre, nombre))`. Si no coincide ninguno, `representanteId` queda nulo.
  - con `representacion === 'apoderado'` y sin `representanteId`, busca `prisma.poder.findFirst({ where: { asambleaId, unidadId, revocadoEn: null } })`. Sin poder, lanza `SinPoderRegistrado(designacion)`; con poder, `representanteId = poder.apoderadoId` y `nombre = await nombreDe(poder.apoderadoId)`.
- Se borra el atajo «titular con cuenta» de `votar.ts`, de los dos lugares de `ver.ts` y el bloque `sinVincular` de `designarAutoridades`.
- En `FormularioAcreditar`, debajo de «Presente», va una ayuda: «Si no es el titular con cuenta, vota por carga manual de quien dirige.»

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run pruebas/dominio/nombres.spec.ts pruebas/integracion/asambleas-*.spec.ts`
Expected: PASS (toda la suite de asambleas, incluidas las que ya existían).

- [ ] **Step 5: Commit**

```bash
git add src/compartido/nombres.ts src/aplicacion/asambleas src/app/\(panel\)/consorcios/\[consorcio\]/asambleas pruebas
git commit -m "fix(asambleas): acreditar a mano solo vincula al titular que coincide (RF-31, A-2, B-3)"
```

### Task 2: Quiénes estaban ausentes se congela al cerrar el punto (A-3)

**Files:**
- Create: `prisma/migrations/20261114100000_ausentes_al_cerrar/migration.sql`
- Modify: `prisma/schema.prisma` (modelo `PuntoAsamblea`)
- Modify: `src/dominio/asambleas/provisoria.ts`
- Modify: `src/aplicacion/asambleas/conducir.ts` (`cerrarPunto`)
- Modify: `src/aplicacion/asambleas/ver.ts` (`estadoDecision` y `puedoOponerme`)
- Modify: `src/aplicacion/asambleas/oposicion.ts:25-39` (`validar`)
- Test: `pruebas/dominio/asambleas/provisoria.spec.ts`, `pruebas/integracion/asambleas-oposicion.spec.ts`

**Interfaces:**
- Produces: la columna `PuntoAsamblea.ausentesConVoto String[] @default([]) @map("ausentes_con_voto") @db.Uuid`, escrita una sola vez, al cerrar.
- Produces: `estadoDecision(args: { provisorio; vence; ahora; padron: UnidadPadron[]; votos: Voto[]; oposiciones: string[]; ausentes: string[]; mayoria }): EstadoDecision`. El silencio que suma es el de `ausentes` menos `oposiciones`, y ya no se deduce de `padron[].presente`.

- [ ] **Step 1: Pruebas que fallan**

`provisoria.spec.ts`: a `base` se le agrega `ausentes: ['D', 'E']` y se suma este caso:
```ts
it('quien llegó después de la votación sigue contando como ausente de ese punto', () => {
  const llegoTarde = padron.map((x) => (x.unidadId === 'E' ? { ...x, presente: true } : x))
  // Sin oposiciones: D y E suman por silencio aunque E figure presente hoy.
  expect(estadoDecision({ ...base, padron: llegoTarde, ahora: despues, oposiciones: [] })).toBe('firme')
  // Se opone E: 3 de 5 y 65 de 100, sigue firme; se oponen D y E, cae.
  expect(estadoDecision({ ...base, padron: llegoTarde, ahora: despues, oposiciones: ['D', 'E'] })).toBe('caida')
})
```

`asambleas-oposicion.spec.ts`, dentro de `describe('regla «totalidad»')`:
```ts
it('la ausente que llega después del punto conserva la oposición', async () => {
  await votarYCerrar('totalidad')
  await acreditarme(repo, RELOJ, de(e.ana)) // llega tarde
  const punto = await prismaBase.puntoAsamblea.findUniqueOrThrow({ where: { id: puntoId } })
  expect(punto.ausentesConVoto.sort()).toEqual([e.unidades['1A'], e.unidades['2B']].sort())
  const vista = await verAsamblea(repo, RELOJ, de(e.ana))
  expect(vista.yo.puedoOponerme).toEqual([expect.objectContaining({ puntoId, unidadId: e.unidades['1A'] })])
  await oponerme(repo, RELOJ, { ...de(e.ana), puntoId, unidadId: e.unidades['1A'] })
  expect(await prismaBase.oposicionDecision.count({ where: { puntoId } })).toBe(1)
})

it('la lista de ausentes no se puede cambiar después de cerrar', async () => {
  await votarYCerrar('totalidad')
  await expect(prismaBase.$executeRaw`UPDATE "PuntoAsamblea" SET ausentes_con_voto = '{}' WHERE id = ${puntoId}::uuid`).rejects.toThrow(/se fija al cerrarlo/)
})
```
La prueba existente «solo se opone el propietario de una unidad ausente» sigue igual: Bruno estuvo presente al votar y sigue rechazado con `NoEraAusente`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run pruebas/dominio/asambleas/provisoria.spec.ts pruebas/integracion/asambleas-oposicion.spec.ts`
Expected: FAIL por el parámetro `ausentes` desconocido y la columna inexistente.

- [ ] **Step 3: Migración**

En este orden, para que el backfill pase con el disparador viejo:
1. `ALTER TABLE "PuntoAsamblea" ADD COLUMN "ausentes_con_voto" UUID[] NOT NULL DEFAULT '{}';`
2. Backfill de los puntos cerrados, con la mejor información disponible:
   ```sql
   UPDATE "PuntoAsamblea" p SET ausentes_con_voto = ARRAY(
     SELECT u.unidad_id FROM "UnidadEnAsamblea" u
     WHERE u.asamblea_id = p.asamblea_id AND NOT u.presente AND NOT u.sin_voto)
   WHERE p.estado = 'cerrado';
   ```
3. `CREATE OR REPLACE FUNCTION fn_punto_reglas()` copiada de `20261104120000_notas_con_punto_abierto`, con `OR NEW.ausentes_con_voto IS DISTINCT FROM OLD.ausentes_con_voto` agregado a la lista de «se fija al cerrarlo».
4. `CREATE OR REPLACE FUNCTION fn_oposicion_reglas()` copiada de `20261103120000_asambleas`. La consulta a `UnidadEnAsamblea` sigue para `sin_voto`, y la condición pasa a ser `IF NOT (NEW.unidad_id = ANY(v_punto.ausentes_con_voto)) THEN RAISE EXCEPTION 'FLAY: Solo puede oponerse el propietario de una unidad ausente con voto.'`.

Después, sumar la columna al modelo y correr `npx prisma generate`.

- [ ] **Step 4: Implementar en el dominio y la aplicación**

- `estadoDecision` recorre `args.ausentes`, salta las que están en `oposiciones` y busca el coeficiente en `padron`.
- `cerrarPunto` escribe `ausentesConVoto` con `padron.filter((u) => !u.presente && !u.sinVoto).map((u) => u.unidadId)`, para **todos** los puntos y no solo los provisorios. Esa misma lista alimenta el aviso a los ausentes.
- `ver.ts` le pasa `ausentes: p.ausentesConVoto` a `estadoDecision`. `puedoOponerme` filtra las unidades propias que están en `p.ausentesConVoto`, sin `sinVoto` y sin oposición previa.
- `oposicion.ts` `validar` reemplaza el chequeo de `presente` por `punto.ausentesConVoto.includes(datos.unidadId)` y mantiene el de `sinVoto`.

- [ ] **Step 5: Correr y ver que pasan; verificar el backfill**

Run: `npm run db:deploy && npm run db:drift && npx vitest run pruebas/dominio/asambleas pruebas/integracion/asambleas-*.spec.ts`
Expected: PASS y sin deriva.

Verificación manual sobre la base local (antes de cualquier `test:integracion`, que la vacía): `SELECT orden, ausentes_con_voto FROM "PuntoAsamblea" WHERE asamblea_id = '9d2fd0d4-b819-4206-8cb2-2db5a6d9f964'`. En el punto 1 aparece **solo 3C**, porque Inés ya figura presente. Es el límite conocido del backfill: anotarlo en el PR.

- [ ] **Step 6: Commit**

```bash
git commit -am "fix(asambleas): la oposición y el silencio se cuentan con los ausentes al votar (RF-33, A-3)"
```
(Incluir la migración nueva con `git add prisma/migrations/20261114100000_ausentes_al_cerrar`.)

### Task 3: Ningún voto queda guardado sin contar, y la carga manual no pisa un voto propio (B-1, B-2)

**Files:**
- Create: `prisma/migrations/20261114110000_voto_con_candado/migration.sql`
- Modify: `src/aplicacion/asambleas/conducir.ts` (`cerrarPunto`: lectura dentro de la transacción)
- Test: `pruebas/integracion/asambleas-votacion.spec.ts`

**Interfaces:**
- Consumes: el `cerrarPunto` con `ausentesConVoto` de la tarea 2.

- [ ] **Step 1: Pruebas que fallan**

```ts
it('un voto concurrente con el cierre queda contado o rechazado, nunca guardado sin contar', async () => {
  for (let i = 0; i < 5; i++) {
    // Escenario con el punto i abierto y Ana y Bruno presentes (usar armarReunion propia del describe).
    const [voto] = await Promise.allSettled([
      votar(repo, RELOJ, { ...de(e.ana), puntoId, unidadId: e.unidades['1A'], eleccion: { sentido: 'positivo' } }),
      cerrarPunto(repo, RELOJ, { ...de(e.consejo), puntoId }),
    ])
    const punto = await prismaBase.puntoAsamblea.findUniqueOrThrow({ where: { id: puntoId }, include: { votos: true } })
    const contados = Object.values((punto.conteo as { porOpcion: Record<string, { unidades: number }> }).porOpcion).reduce((s, c) => s + c.unidades, 0)
    expect(contados).toBe(punto.votos.length)
    if (voto.status === 'rejected') expect(String(voto.reason)).toMatch(/no está en votación/)
  }
})

it('la carga manual no pisa un voto propio aunque llegue a la vez', async () => {
  const [propio, manual] = await Promise.allSettled([
    votar(repo, RELOJ, { ...de(e.ana), puntoId, unidadId: e.unidades['1A'], eleccion: { sentido: 'positivo' } }),
    cargarVoto(repo, RELOJ, { ...de(e.consejo), puntoId, unidadId: e.unidades['1A'], eleccion: { sentido: 'negativo' } }),
  ])
  const voto = await prismaBase.votoAsamblea.findFirstOrThrow({ where: { puntoId, unidadId: e.unidades['1A'] } })
  if (propio.status === 'fulfilled') expect(voto).toMatchObject({ origen: 'propio', sentido: 'positivo' })
  if (manual.status === 'rejected') expect(manual.reason).toBeInstanceOf(UnidadYaVoto)
})
```
Para la primera prueba, cada vuelta arma su propia asamblea con un punto. Reutilizar el `armarReunion` que ya tenga el `describe` o escribir uno local: lo que la decide es la aserción.

- [ ] **Step 2: Correr y ver que fallan** (la primera puede pasar por azar; la segunda falla de forma estable cuando la carga manual entra segunda).

Run: `npx vitest run pruebas/integracion/asambleas-votacion.spec.ts -t "concurrente|pisa"`

- [ ] **Step 3: Migración**

`fn_voto_inmutable` copiada de `20261103120000_asambleas`, con dos cambios:
- la lectura del punto pasa a `SELECT * INTO v_punto FROM "PuntoAsamblea" p WHERE p.id = … FOR SHARE;`
- en `TG_OP = 'UPDATE'`: `IF OLD.origen = 'propio' AND NEW.origen = 'carga_manual' THEN RAISE EXCEPTION 'FLAY: Esa unidad ya votó este punto: solo quien la representa puede cambiar su voto.'; END IF;`

- [ ] **Step 4: `cerrarPunto` lee con candado**

Dentro de `prisma.$transaction`, primero `` tx.$queryRaw`SELECT id FROM "PuntoAsamblea" WHERE id = ${punto.id}::uuid FOR UPDATE` ``, y **después** se leen con `tx` los votos, el padrón y el estado del punto (repetir `transicionPunto`). El cálculo del resultado y el aviso se mueven adentro. El `propietariosVigentesDe` de los ausentes puede quedar dentro, porque usa `prismaBase`. `cargarVoto` deja de leer el previo: la regla vive en el disparador, y `conReglas` se queda con `() => new UnidadYaVoto()` para el duplicado.

- [ ] **Step 5: Correr y ver que pasan**

Run: `npm run db:deploy && npm run db:drift && npx vitest run pruebas/integracion/asambleas-*.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -am "fix(asambleas): cierre y votos con candado; la carga manual no pisa un voto propio (RF-31, B-1, B-2)"
```

- [ ] **Step 7: Cierre de la rama** — `npm run verificar` en verde, `npm audit --omit=dev --audit-level=high`, push y PR a `main` con los hallazgos A-2, A-3, B-1, B-2 y B-3. Push y PR, solo con el visto bueno del usuario.

---

## Rama 2 — `fix/asambleas-acta` (RF-32)

### Task 4: Firmas atómicas y una salida para el acta trabada (A-1)

**Files:**
- Modify: `src/aplicacion/asambleas/acta.ts:471-566` (`firmar`) y una función nueva `completarActa`
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/acciones.ts` (`accionCompletarActa`)
- Modify: `src/app/aviso-en-url.ts` (clave `acta-completada` en `HECHO`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/acta/page.tsx` (botón)
- Test: `pruebas/integracion/asambleas-acta.spec.ts`

**Interfaces:**
- Produces: `completarActa(repositorio, reloj, dependencias: DependenciasActa, datos: { usuarioId; consorcioId; asambleaId }): Promise<{ completa: boolean }>`. Es idempotente: con el acta ya firmada devuelve `{ completa: true }` sin escribir nada. La puede pedir quien dirigió o cualquier firmante; para el resto, `NoEncontrado('RF-32')`.
- `firmar` mantiene la firma pública y su `{ completa }`.

- [ ] **Step 1: Pruebas que fallan** (en `describe('firma')`):

```ts
it('las dos últimas firmas a la vez cierran el acta una sola vez', async () => {
  for (const u of [e.carla, e.ivan]) await firmar(repo, DESPUES, deps, { ...de(u), contrasena: secretoDeFirma })
  const r = await Promise.all([e.ana, e.bruno].map((u) => firmar(repo, DESPUES, deps, { ...de(u), contrasena: secretoDeFirma })))
  expect(r.some((x) => x.completa)).toBe(true)
  const acta = await prismaBase.actaAsamblea.findFirstOrThrow({ where: { asambleaId } })
  expect(acta.estado).toBe('firmada')
  expect(await prismaBase.documentoConsorcio.count({ where: { tipo: 'acta' } })).toBe(1)
  expect((await prismaBase.asamblea.findUniqueOrThrow({ where: { id: asambleaId } })).estado).toBe('acta_firmada')
})

it('un acta con las cuatro firmas y sin cerrar se completa a pedido, una sola vez', async () => {
  const acta = await prismaBase.actaAsamblea.findFirstOrThrow({ where: { asambleaId } })
  // Simula el acta trabada del informe: firmas escritas sin pasar por el cierre.
  await prismaBase.firmanteActa.updateMany({ where: { actaId: acta.id }, data: { firmadoEn: DESPUES.ahora(), hashFirmado: acta.hashContenido } })
  const r = await Promise.all([completarActa(repo, DESPUES, deps, de(e.consejo)), completarActa(repo, DESPUES, deps, de(e.ana))])
  expect(r).toEqual([{ completa: true }, { completa: true }])
  expect(await prismaBase.documentoConsorcio.count({ where: { tipo: 'acta' } })).toBe(1)
  await expect(completarActa(repo, DESPUES, deps, de(e.elsa!))).rejects.toBeInstanceOf(NoEncontrado)
})

it('con firmas pendientes, completar no hace nada', async () => {
  expect(await completarActa(repo, DESPUES, deps, de(e.consejo))).toEqual({ completa: false })
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run pruebas/integracion/asambleas-acta.spec.ts -t "a la vez|a pedido|pendientes"`
Expected: FAIL. La primera deja el acta en `a_firmar`, y `completarActa` no existe.

- [ ] **Step 3: Implementar**

- `firmar`: valida la contraseña fuera de la transacción, como hoy. Después abre `prisma.$transaction` con `` tx.$queryRaw`SELECT id FROM "ActaAsamblea" WHERE id = ${acta.id}::uuid FOR UPDATE` ``, relee **su** firmante con `tx` (si ya firmó, `YaFirmo`) y escribe la firma. Al salir llama al `cerrarSiCompleta` interno.
- `cerrarSiCompleta(reloj, dependencias, datos)` (no se exporta): lee el acta y sus firmantes.
  - Si el estado no es `a_firmar`, devuelve `{ completa: estado === 'firmada' }`. Si falta alguna firma, `{ completa: false }`.
  - Si no, arma el PDF final y lo guarda **fuera** de la transacción, igual que hoy. Después abre una transacción con `FOR UPDATE` sobre el acta, **relee el estado** (si ya no es `a_firmar`, sale sin escribir) y hace lo que hoy hace la rama de la última firma: documento, trabajo `indexar_documento`, acta `firmada`, asamblea `acta_firmada` y avisos.
- `completarActa` = `conAutorizacion(..., { accion: 'firmar el acta' })`, la exigencia de dirigió-o-firmante y después `cerrarSiCompleta`.
- En la página, si `acta.estado === 'a_firmar'`, todos los firmantes tienen `firmadoEn` y quien mira es firmante o dirigió, aparece un `<form action={accionCompletarActa}>` con `BotonEnviar texto="Completar el acta" enviando="Completando…"` y la ayuda «Todas las firmas están: falta publicar el acta.».
- `accionCompletarActa` usa `ejecutar(..., 'acta-completada', 'acta')`; en `HECHO`, `'acta-completada': 'Acta publicada en la documentación del consorcio.'`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run pruebas/integracion/asambleas-acta.spec.ts`
Expected: PASS, las existentes incluidas.

- [ ] **Step 5: Commit**

```bash
git commit -am "fix(asambleas): la última firma cierra el acta con candado; completar el acta trabada (RF-32, A-1)"
```

### Task 5: El reemplazo de un firmante cumple la misma regla que la designación (B-5)

**Files:**
- Modify: `src/aplicacion/asambleas/acta.ts:587-599`
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/acta/page.tsx:96-102` (lista `presentesConUsuario`)
- Test: `pruebas/integracion/asambleas-acta.spec.ts`

- [ ] **Step 1: Prueba que falla**

```ts
it('un apoderado no reemplaza a un firmante', async () => {
  const firmante = await prismaBase.firmanteActa.findFirstOrThrow({ where: { usuarioId: e.ana } })
  // Iván es apoderado de 2B en este escenario y además preside: se usa un apoderado sin cargo.
  await expect(reemplazarFirmante(repo, DESPUES, { ...de(e.consejo), firmanteId: firmante.id, nuevoUsuarioId: e.ivan })).rejects.toBeInstanceOf(FirmanteInvalido)
})
```
Si `e.ivan` ya es firmante (preside), la prueba pasaría por la otra condición. En ese caso, en el `beforeEach` de un `describe` propio, registrar un segundo poder en papel a un usuario nuevo (`crearUsuario` + `habilitarEnConsorcio`) y acreditarlo: lo que se prueba es la representación `apoderado`.

- [ ] **Step 2: Correr y ver que falla.** Run: `npx vitest run pruebas/integracion/asambleas-acta.spec.ts -t "apoderado no reemplaza"`

- [ ] **Step 3: Implementar.** La consulta de `presentes` de `reemplazarFirmante` agrega `representacion: 'propietario'`, igual que `designarFirmantes`. La lista de la página filtra `u.representacion === 'propietario'`.

- [ ] **Step 4: Correr y ver que pasa.** Run: `npx vitest run pruebas/integracion/asambleas-acta.spec.ts` → PASS.

- [ ] **Step 5: Commit** — `fix(asambleas): el reemplazo de firmante exige un propietario presente (RF-32, B-5)`

### Task 6: Las notas del acta no se pisan entre dirección y secretaría (M-1)

**Files:**
- Modify: `src/aplicacion/asambleas/acta.ts:84-100` (`guardarNotas`)
- Modify: `src/aplicacion/asambleas/errores.ts`
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/acciones.ts:340-356` (`accionNotas`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/notas-acta.tsx`
- Test: `pruebas/integracion/asambleas-notas-observaciones.spec.ts`

**Interfaces:**
- Produces: `guardarNotas(repositorio, reloj, datos: Datos & { puntoId: string; notas: string; anterior: string }): Promise<void>`. Escribe solo si lo guardado sigue igual a `anterior` (`''` equivale a nulo).
- Produces: `class NotasCambiaron extends ErrorDeAsamblea { constructor(public readonly actuales: string) }`, mensaje `Otra persona cambió las notas de este punto: quedó su versión y la tuya está abajo para copiar.`
- `accionNotas` devuelve `{ ok: false; error: string; actuales?: string }` cuando hay conflicto.

- [ ] **Step 1: Prueba que falla**

```ts
it('una nota escrita sobre una versión vieja no pisa la de otra persona', async () => {
  await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntos[0].id })
  await guardarNotas(repo, RELOJ, { ...de(e.carla), puntoId: puntos[0].id, notas: 'Secretaría: tres presupuestos', anterior: '' })
  await expect(guardarNotas(repo, RELOJ, { ...de(e.consejo), puntoId: puntos[0].id, notas: 'Dirección: pintura lavable', anterior: '' })).rejects.toMatchObject({ actuales: 'Secretaría: tres presupuestos' })
  const p = await prismaBase.puntoAsamblea.findUniqueOrThrow({ where: { id: puntos[0].id } })
  expect(p.notas).toBe('Secretaría: tres presupuestos')
})
```
Ajustar las llamadas existentes a `guardarNotas` del mismo archivo para que pasen `anterior`.

- [ ] **Step 2: Correr y ver que falla.** Run: `npx vitest run pruebas/integracion/asambleas-notas-observaciones.spec.ts`

- [ ] **Step 3: Implementar**

- `guardarNotas` hace un `updateMany` con `where: { id, asambleaId, OR: anterior === '' ? [{ notas: null }, { notas: '' }] : [{ notas: anterior }] }`. Con `count === 0`, relee el punto: si no existe, `NoEncontrado`; si existe, `NotasCambiaron(punto.notas ?? '')`.
- `CampoNota` manda `anterior = guardado.current`. Ante un conflicto con `actuales`:
  - deja `guardado.current = actuales`;
  - lleva el `textarea` a `actuales` (con `ref`, porque no es controlado);
  - pasa el texto propio a `alPerder(puntoId, notas)`, que ya lo muestra en «No se guardó: copialo»;
  - avisa con `avisar(error, 'problema')`. Esto vale también con el campo montado.

- [ ] **Step 4: Correr y ver que pasa.** Run: `npx vitest run pruebas/integracion/asambleas-notas-observaciones.spec.ts` → PASS.

- [ ] **Step 5: Commit** — `fix(asambleas): las notas del punto no se pisan entre dirección y secretaría (RF-32, M-1)`

### Task 7: El borrador de IA, con ortografía y sin nombres propios (M-6)

**Files:**
- Modify: `src/infraestructura/asistencia/gemini.ts:482-496` (el prompt pasa a una constante exportada `SISTEMA_ACTA`)
- Test: `pruebas/dominio/asistencia-acta.spec.ts` (nuevo)

- [ ] **Step 1: Prueba que falla**

```ts
import { SISTEMA_ACTA } from '@/infraestructura/asistencia/gemini'
it('el prompt del acta pide ortografía, omite el cero y despersonaliza', () => {
  expect(SISTEMA_ACTA).toMatch(/orden del día/)
  expect(SISTEMA_ACTA).toMatch(/tildes/)
  expect(SISTEMA_ACTA).toMatch(/noVotaron.*0.*no lo menciones/s)
  expect(SISTEMA_ACTA).toMatch(/nombres propios/)
})
```
Si importar `gemini.ts` arrastra `@google/genai` al entorno de dominio, mover `SISTEMA_ACTA` a `src/infraestructura/asistencia/prompts-acta.ts` (sin dependencias) e importarlo desde ahí.

- [ ] **Step 2: Correr y ver que falla.** Run: `npx vitest run pruebas/dominio/asistencia-acta.spec.ts`

- [ ] **Step 3: Reescribir el prompt.** Mismas reglas, con ortografía completa («Redactás», «del día», «reunión») y tres reglas nuevas:
  - «Escribí con la ortografía completa del castellano, tildes incluidas.»
  - «Si "noVotaron" es 0, no lo menciones; si es 1, decí "una unidad presente no votó".»
  - «Las notas y las observaciones pueden traer nombres propios: no los copies; usá fórmulas impersonales ("un propietario pidió…").»

- [ ] **Step 4: Correr y ver que pasa.** Revisar a mano con `asambleas-acta-borrador.spec.ts`: si usa el redactor determinista, no cambia nada.

- [ ] **Step 5: Commit** — `fix(asambleas): el borrador del acta con ortografía y sin nombres propios (RF-32, M-6)`

- [ ] **Step 6: Cierre de la rama** — `npm run verificar` en verde, audit, push y PR con A-1, B-5, M-1 y M-6 (con el visto bueno del usuario).

---

## Rama 3 — `fix/asambleas-sala` (RF-29, RF-31)

### Task 8: Cancelar sin quórum desde la sala, y la apertura y la cancelación en vivo (A-4, M-2)

**Files:**
- Modify: `src/aplicacion/asambleas/en-vivo.ts:36-44` (`permisoDeEscucha` acepta `convocada` y `en_curso`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/page.tsx:67-69` (`SalaEnVivo` también con `convocada`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/acciones.ts` (`accionAbrir` y `accionCancelar` con `conAviso`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/direccion.tsx` (botón de cancelar en el paso 1, sin constituir)
- Create: `pruebas/e2e/asambleas-escenario.ts` (la siembra del `beforeAll` de `pruebas/e2e/asambleas.spec.ts`, más `confirmarUnaVez`, movidos acá y reusados por los dos archivos)
- Create: `pruebas/e2e/asambleas-sala.spec.ts`
- Test: `pruebas/integracion/asambleas-en-vivo.spec.ts`, `pruebas/integracion/asambleas-votacion.spec.ts`

**Interfaces:**
- Produces: `sembrarAsambleaE2E(opciones?: { fechaHora?: Date; reglaMayoria?: 'presentes' | 'totalidad' }): Promise<{ ada; bruno; cora; dino; eva; asambleaId; ruta: () => string; limpiar: () => Promise<void> }>` y `confirmarUnaVez(page, asambleaId, etiqueta, enviando, destino)` en `pruebas/e2e/asambleas-escenario.ts`.

- [ ] **Step 1: Pruebas que fallan**

Integración. En `asambleas-en-vivo.spec.ts`, la prueba «una asamblea que no está en curso no da permiso» pasa a usar una asamblea en **borrador** o **finalizada**, y se suma:
```ts
it('quien alcanza una asamblea convocada recibe permiso, para enterarse cuando se abra', async () => { /* convocada → permiso no nulo */ })
```
En `asambleas-votacion.spec.ts`:
```ts
it('abierta y sin constituir, quien puede dirigir la cancela aunque no haya nadie', async () => {
  await abrir(repo, RELOJ, de(e.consejo))
  await cancelar(repo, RELOJ, { ...de(e.consejo), motivo: 'Sin quórum' })
  expect((await prismaBase.asamblea.findUniqueOrThrow({ where: { id: asambleaId } })).estado).toBe('cancelada')
})
```
E2E, en `asambleas-sala.spec.ts` (proyecto `telefono`):
```ts
test('sin quórum, quien dirige cancela desde la sala y quien esperaba lo ve sin recargar', async ({ browser }) => {
  // Dino tiene la convocada abierta; Bruno abre la asamblea.
  // Dino ve «En curso» sin recargar (≤ 10 s).
  // Bruno, sin constituir: «Cancelar por falta de quórum» → confirma → estado «Cancelada».
  // Dino ve «Asamblea cancelada» sin recargar.
})
```

- [ ] **Step 2: Correr y ver que fallan.**

Run: `npx vitest run pruebas/integracion/asambleas-en-vivo.spec.ts pruebas/integracion/asambleas-votacion.spec.ts -t "convocada|cancela"` y `npx playwright test pruebas/e2e/asambleas-sala.spec.ts`.
La prueba de integración de cancelar puede pasar ya (el caso de uso lo permite): queda como regresión. Las de permiso y la e2e fallan.

- [ ] **Step 3: Implementar**

- `permisoDeEscucha` lanza `NoEncontrado` salvo con `estado IN ('convocada','en_curso')`. En la página, `SalaEnVivo` se monta si `vista.estado === 'convocada' || vista.estado === 'en_curso'`.
- `accionAbrir` y `accionCancelar` envuelven el trabajo en `conAviso(AVISO_EN_VIVO, after, b.asambleaId, () => …)`, igual que `accionFinalizar`.
- En `Direccion`, paso `acreditacion`, si `!vista.constituida`: `BotonModal` con etiqueta «Cancelar por falta de quórum», variante `boton--peligro` y un `<form action={accionCancelar}>` con `Ocultos`, `textarea name="motivo"` (precargado con «No se alcanzó el quórum.») y `BotonEnviar texto="Confirmar cancelación" enviando="Cancelando…"`.

- [ ] **Step 4: Correr y ver que pasan.** Los dos comandos del paso 2 → PASS. También `npx playwright test pruebas/e2e/asambleas.spec.ts`, para confirmar que mover la siembra no lo rompió.

- [ ] **Step 5: Commit** — `fix(asambleas): cancelar sin quórum desde la sala; abrir y cancelar llegan en vivo (RF-29, RF-31, A-4, M-2)`

### Task 9: La sala no deja enviar dos veces y la toma de dirección se confirma (M-4, B-4, B-8, B-10, B-12)

**Files:**
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/direccion.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/sala.tsx` (form «Estoy presente»)
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/boton-enviar.tsx` (prop opcional `clase`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/observacion.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/acciones.ts:327-338` (`accionObservacion` sin `conAviso` y con el comentario corregido)
- Test: `pruebas/e2e/asambleas-sala.spec.ts`

**Interfaces:**
- Consumes: `confirmarUnaVez` y `sembrarAsambleaE2E` de la tarea 8.
- Produces: `BotonEnviar({ texto, enviando, clase = 'boton boton--primario' })`.

- [ ] **Step 1: Prueba que falla**

```ts
test('constituir con doble clic envía una sola vez', async ({ browser }) => {
  // Bruno abre, se acreditan Bruno y Cora y designa autoridades.
  // confirmarUnaVez(page, asambleaId, 'Verificar quórum y constituir', 'Constituyendo…', /asambleas\//)
  // No aparece el toast «La asamblea ya está constituida.».
})
test('tomar la dirección pide confirmación', async ({ browser }) => {
  // Cora (consejo; sembrarla con rol consejo) pulsa «Tomar la dirección» → se abre el diálogo y nada cambia hasta «Confirmar».
})
```

- [ ] **Step 2: Correr y ver que falla.** Run: `npx playwright test pruebas/e2e/asambleas-sala.spec.ts -g "doble clic|dirección"`

- [ ] **Step 3: Implementar**

- Cada `<form action={(datos) => { iniciarTransicion(async () => …) }}>` de `Direccion` y el de «Estoy presente» pasan a `action={async (datos) => { aplicarOptimista?.(…); await notificarResultado(…) }}`. La acción del form ya corre en una transición, así que el optimista sigue andando y `useFormStatus` queda pendiente hasta que termina. El botón de envío es `BotonEnviar` con `enviando`:

  | Botón | `texto` | `enviando` |
  |---|---|---|
  | Acreditar | «Acreditar» | «Acreditando…» |
  | Designar | «Designar» | «Designando…» |
  | Constituir | «Verificar quórum y constituir» | «Constituyendo…» |
  | Abrir punto | «Abrir el punto N: …» | «Abriendo…» |
  | Cargar voto | «Cargar voto» | «Cargando…» |
  | Cerrar punto | «Confirmar cierre» | «Cerrando…» |
  | Estoy presente | «Estoy presente (…)» | «Registrando…» |

- «Tomar la dirección» va dentro de un `BotonModal` titulado «Tomar la dirección», con el texto «{nombre} deja de dirigir: los modales que tenga abiertos dejan de funcionar.» y `BotonEnviar texto="Confirmar" enviando="Tomando…"`.
- B-10: en las opciones de presidente y secretario, la etiqueta junta todas las unidades que representa la persona: `` `${designaciones.join(', ')} — ${representante}` ``, sin el titular entre paréntesis.
- B-8: `Observacion` muestra «Sin guardar» (`role="status"`) cuando el texto difiere de lo último guardado, más la ayuda «Guardala antes de que quien dirige finalice: lo que no se guardó se pierde.».
- B-12: `accionObservacion` deja de envolver en `conAviso`. Se reemplaza el cuerpo por una función propia sin publicar, y el comentario se corrige a «Se guarda con el botón; no refresca la sala de nadie.».

- [ ] **Step 4: Correr y ver que pasan.** Run: `npx playwright test pruebas/e2e/asambleas-sala.spec.ts pruebas/e2e/asambleas.spec.ts` y `npm run test:a11y` → PASS.

- [ ] **Step 5: Commit** — `fix(asambleas): la sala frena el doble envío y confirma la toma de dirección (RF-31, M-4, B-4, B-8, B-10, B-12)`

### Task 10: La sala muestra que una decisión quedó provisoria (M-5)

**Files:**
- Modify: `src/compartido/avance-asamblea.ts` (función nueva `marcaDePunto`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/avance-orden.tsx` (usa `marcaDePunto`, sin `textoResultado` local)
- Test: `pruebas/dominio/asambleas/avance.spec.ts`

**Interfaces:**
- Produces: `marcaDePunto(p: { estado: 'pendiente' | 'abierto' | 'cerrado'; resultado: 'aprobado' | 'rechazado' | 'sin_decision' | null; provisorio: boolean; modalidad: 'binaria' | 'opcion_multiple'; opcionGanadora: string | null }): string`

- [ ] **Step 1: Prueba que falla**

```ts
it('marca lo provisorio en la sala', () => {
  const p = { estado: 'cerrado', resultado: 'aprobado', provisorio: true, modalidad: 'binaria', opcionGanadora: null } as const
  expect(marcaDePunto(p)).toBe('Aprobado, provisoria')
  expect(marcaDePunto({ ...p, provisorio: false })).toBe('Aprobado')
  expect(marcaDePunto({ ...p, estado: 'abierto' })).toBe('Ahora')
  expect(marcaDePunto({ ...p, estado: 'pendiente', resultado: null })).toBe('Falta')
  expect(marcaDePunto({ ...p, modalidad: 'opcion_multiple', provisorio: false, opcionGanadora: 'Empresa X' })).toBe('Aprobada: Empresa X')
})
```

- [ ] **Step 2: Correr y ver que falla.** Run: `npx vitest run pruebas/dominio/asambleas/avance.spec.ts`

- [ ] **Step 3: Implementar.** Se mueve la lógica de `textoResultado` y de `marca` a `marcaDePunto`; `comunes.tsx` `textoResultado` la llama para no duplicar. Mismas etiquetas de hoy, más «, provisoria».

- [ ] **Step 4: Correr y ver que pasa.** Mismo comando → PASS.

- [ ] **Step 5: Commit** — `fix(asambleas): la sala muestra cuando una decisión quedó provisoria (RF-33, M-5)`

### Task 11: Una opción con coma sigue siendo una sola opción (M-3)

**Files:**
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/formulario-asamblea.tsx:322-397`
- Test: `pruebas/e2e/asambleas-sala.spec.ts`

- [ ] **Step 1: Prueba que falla**

```ts
test('una opción con coma no se parte', async ({ browser }) => {
  // Bruno (consejo) crea una asamblea: punto «Entre opciones»; escribe «Limpiar, Inc.» + Enter y «Brillo S.A.» + Enter; guarda el borrador.
  // Se ven los chips «1. Limpiar, Inc.» y «2. Brillo S.A.»; en la base, opcionPunto del punto = ['Limpiar, Inc.', 'Brillo S.A.'].
})
```

- [ ] **Step 2: Correr y ver que falla.** Run: `npx playwright test pruebas/e2e/asambleas-sala.spec.ts -g "coma"`

- [ ] **Step 3: Implementar.**
  - En el `onChange` se va la rama `valor.includes(',')`: el texto queda entero en el borrador.
  - El chip se crea con Enter, como hoy, o con un botón «Agregar opción» nuevo al lado del campo.
  - El rótulo pasa a «Opciones (Enter para agregar otra — gana la más votada)», el id del campo a `punto-${i}-opciones` (actualizar también `:137`) y el placeholder a «Ej.: Presupuesto A».

- [ ] **Step 4: Correr y ver que pasa.** Mismo comando y `npm run test:a11y` → PASS.

- [ ] **Step 5: Commit** — `fix(asambleas): las opciones se agregan con Enter y admiten comas (RF-29, M-3)`

### Task 12: Quien convoca se entera de las unidades sin propietario (M-7)

**Files:**
- Modify: `src/aplicacion/asambleas/convocar.ts` (`ResultadoConvocatoria`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/asambleas/[asamblea]/page.tsx:184-192` (texto del aviso) y `src/aplicacion/asambleas/ver.ts` (`VistaAsamblea.unidadesSinPropietario`)
- Modify: `src/app/aviso-en-url.ts` (texto de `asamblea-convocada-sin-contacto`, si menciona solo propietarios)
- Test: `pruebas/integracion/asambleas-convocatoria.spec.ts`

**Interfaces:**
- Produces: `ResultadoConvocatoria { sinContacto: …; sinPropietario: string[] }` (designaciones) y `VistaAsamblea.unidadesSinPropietario: string[]`, solo para quien puede dirigir o administra; para el resto, `[]`.

- [ ] **Step 1: Prueba que falla**

```ts
it('informa las unidades sin propietario vigente, que cuentan en la base y no reciben aviso', async () => {
  // Quitar la ocupación de 2B (dar de baja la vigencia de Dora antes de HOY) y convocar.
  const r = await convocar(repo, HOY, { usuarioId: e.consejo, consorcioId: e.consorcioId, asambleaId })
  expect(r.sinPropietario).toEqual(['2B'])
  expect((await verAsamblea(repo, HOY, de(e.consejo))).unidadesSinPropietario).toEqual(['2B'])
  expect((await verAsamblea(repo, HOY, de(e.ana))).unidadesSinPropietario).toEqual([])
})
```

- [ ] **Step 2: Correr y ver que falla.** Run: `npx vitest run pruebas/integracion/asambleas-convocatoria.spec.ts -t "sin propietario"`

- [ ] **Step 3: Implementar.** Se calcula como las unidades vigentes sin fila en `propietariosVigentesDe`. El aviso de la página arma un párrafo con dos oraciones:
  - si hay propietarios sin cuenta: «N propietarios no tienen cuenta en Flay: les llega la convocatoria por correo si lo tienen cargado.»
  - si hay unidades sin propietario: «Las unidades 3C no tienen propietario cargado: cuentan en la base del cómputo pero nadie recibe el aviso.»

  Esto también corrige la concordancia «Un propietario… les llega».

- [ ] **Step 4: Correr y ver que pasa.** Mismo comando → PASS.

- [ ] **Step 5: Commit** — `fix(asambleas): la convocatoria avisa de unidades sin propietario (RF-29, M-7)`

### Task 13: Documentación y cierre

**Files:**
- Modify: `CLAUDE.md` (notas 30 y 32)
- Modify: `docs/superpowers/informes/2026-11-13-analisis-asambleas.md` (una línea al principio: «Corregido en los PR …», con la lista de hallazgos fuera de alcance)

- [ ] **Step 1:** Nota 30 de `CLAUDE.md`, se agrega:
  - «Quién estaba ausente se congela **por punto** al cerrarlo (`ausentes_con_voto`): la oposición y el silencio conforme se miden contra eso, no contra el padrón final.»
  - «La última firma y `completarActa` cierran el acta bajo `FOR UPDATE`; un acta con las cuatro firmas sin cerrar se completa desde su pantalla.»
  - «El voto y el cierre del punto se serializan (`FOR SHARE`/`FOR UPDATE`).»

  Nota 32: «Las notas se guardan con compare-and-set (`anterior`): la segunda escritura sobre una versión vieja no pisa, devuelve `NotasCambiaron`.»
- [ ] **Step 2:** `npm run verificar` en verde, `npm audit --omit=dev --audit-level=high` y el escaneo de gitleaks de `CLAUDE.md`.
- [ ] **Step 3:** Commit `docs(asambleas): notas 30 y 32 con las correcciones (RF-31, RF-32)`. Push y PR de la rama 3 con A-4, M-2, M-3, M-4, M-5, M-7 y B-4, B-8, B-10 y B-12, con el visto bueno del usuario.
