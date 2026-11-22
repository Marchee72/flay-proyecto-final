# Inquilinos por unidad — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El dueño y la administración asignan y terminan alquileres por unidad; el inquilino ve solo
las expensas desde su ingreso (con aviso de deuda anterior) y pierde el acceso cuando se va.

**Architecture:** Reglas puras nuevas en `src/dominio/ocupaciones/vigencia.ts` (RN-23 corte de
visibilidad, RN-24 fin del acceso). El acceso de consorcista se recalcula en un solo punto
(`sincronizarHabilitacion`, en `registrar-ocupacion.ts`) en cada alta o fin de ocupación. El corte de
visibilidad se decide una vez en `unidadesPropias` (`visibleDesde`) y lo consumen expensas, estado de
cuenta y asistente. La UI es una celda reutilizable (`CeldaInquilino`) en Unidades y en la sección
nueva Mis unidades.

**Tech Stack:** Next.js (Server Actions), Prisma + SQL crudo para `daterange`, Vitest, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-11-21-inquilinos-por-unidad-design.md`

## Global Constraints

- Rama: `feat/inquilinos-por-unidad` desde `main`. Commits en español, con `RF-03` / `RN-23` / `RN-24`
  según toque, terminando en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Vigencia de ocupación: `daterange` `[desde, hasta)`. En pantalla y en toda firma de aplicación,
  «hasta» es **inclusivo**; la conversión (`+1 día` / `−1 día`) vive solo en el repositorio de
  ocupaciones vía las funciones de dominio de la Tarea 1.
- Habilitación: `vigenciaHasta` inclusiva (vigente si `vigenciaHasta >= hoy`).
- Fechas de hoy: `RELOJ.hoy()` / `reloj.hoy()` (hora argentina), nunca `new Date()`.
- Dinero como `Decimal` / cadena; nunca `number` (invariante 2).
- Textos: trato neutro, sin tuteo ni voseo (guía § 4); botones en infinitivo (guía § 3.4).
- Copia fija:
  - Aviso: `La unidad {designacion} tiene deuda anterior al ingreso del inquilino por {importeParaMostrar(x)}. Para saldarla, corresponde comunicarse con el propietario.`
  - Error de fecha: `La fecha de fin no puede ser anterior al ingreso, el {DD/MM/AAAA}.`
  - Modal fin: `{Nombre Apellido} deja de tener acceso al consorcio desde el día siguiente, salvo que ocupe otra unidad.`
  - Ayuda de Hasta: `Fin del contrato. Vacío: sin fecha.`
  - Alquiler propio: `Unidad {designacion} en alquiler desde {DD/MM/AAAA} hasta {DD/MM/AAAA}.` (o `… sin fecha de fin.`)
  - Vacío: `No hay unidades a nombre de esta cuenta en este consorcio.`
  - Toasts `HECHO`: `'inquilino-asignado': 'Inquilino asignado.'`, `'alquiler-terminado': 'Fin del alquiler registrado.'`
- Una unidad ajena, o una ocupación ajena, responde `NoEncontrado`, nunca «prohibido» (SC-008).
- Ningún archivo nuevo escribe `where: { … consorcioId` (prueba `filtro-unico.spec.ts`): lo que toca
  `Habilitacion` vive en `registrar-ocupacion.ts` o `invitar-persona.ts`, ya en la lista blanca.
- Antes de pushear: `npm run verificar`, `npm run test:a11y`, `npm run docs:versiones`,
  `npm audit --omit=dev --audit-level=high`, `npx prettier --write .`.

## Review Focus

1. **Fin anterior al ingreso, o corrimiento del fin que pisa al inquilino siguiente** → mensaje de
   campo / `InquilinoSuperpuesto`, nada se escribe. Tests en Tarea 3.
2. **Persona que, además de inquilina, es dueña de otra unidad o administradora del consorcio** →
   terminar el alquiler no le quita el acceso. Tests en Tarea 2.
3. **Correo que ya tiene cuenta (en este u otro consorcio)** → se reutiliza la cuenta, no hay
   invitación nueva, el toast es el mismo. Tests en Tarea 3.
4. **Consorcio archivado** → las acciones no se dibujan y la acción devuelve mensaje legible.
   Test en Tarea 5.
5. **Campo oculto `volver` adulterado** → solo `unidades` o `mis-unidades`; cualquier otro valor
   redirige a `mis-unidades`. Test en Tarea 5.

---

### Task 1: Reglas de vigencia (RN-23, RN-24) y validador

**Files:**
- Create: `src/dominio/ocupaciones/vigencia.ts`
- Test: `pruebas/dominio/ocupaciones-vigencia.spec.ts`
- Modify: `docs/entrega-3/07-analisis-de-datos.md` (tabla § 7.2: filas `RN-23` y `RN-24`, sin nombres de producto)

**Interfaces:**
- Produces:
  - `hastaSemiabierto(hastaInclusivo: Date): Date` — +1 día UTC.
  - `hastaInclusivo(hastaSemiabierto: Date): Date` — −1 día UTC.
  - `visibleDesde(tipos: readonly ('propietario' | 'inquilino')[], desdes: readonly Date[]): Date | null` — `null` si algún tipo es `propietario`; si no, el día 1 (UTC) del mes del `desde` más antiguo.
  - `periodoVisible(periodo: { anio: number; mes: number }, desde: Date | null): boolean`
  - `finDelAcceso(hastas: readonly (Date | null)[]): Date | null` — hastas **inclusivos**; `null` si alguno es `null`; si no, el máximo. Lanza `Error` con lista vacía.
  - `errorDeFinDeAlquiler(desdeIso: string, hastaIso: string): string | null` — `null` si `hastaIso` vacío o ≥ `desdeIso`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

it('convierte hasta inclusivo y semiabierto', () => {
  expect(hastaSemiabierto(d('2027-02-28')).toISOString().slice(0, 10)).toBe('2027-03-01')
  expect(hastaInclusivo(d('2027-03-01')).toISOString().slice(0, 10)).toBe('2027-02-28')
})
it('el propietario ve todo; el inquilino desde el mes de ingreso', () => {
  expect(visibleDesde(['propietario'], [d('2026-03-15')])).toBeNull()
  expect(visibleDesde(['inquilino', 'propietario'], [d('2026-03-15'), d('2020-01-01')])).toBeNull()
  expect(visibleDesde(['inquilino'], [d('2026-03-15')])?.toISOString().slice(0, 10)).toBe('2026-03-01')
})
it('periodoVisible corta por mes', () => {
  const desde = d('2026-03-01')
  expect(periodoVisible({ anio: 2026, mes: 2 }, desde)).toBe(false)
  expect(periodoVisible({ anio: 2026, mes: 3 }, desde)).toBe(true)
  expect(periodoVisible({ anio: 2025, mes: 12 }, desde)).toBe(false)
  expect(periodoVisible({ anio: 2027, mes: 1 }, desde)).toBe(true)
  expect(periodoVisible({ anio: 2000, mes: 1 }, null)).toBe(true)
})
it('finDelAcceso: abierto si alguna no tiene fin, si no el último', () => {
  expect(finDelAcceso([d('2026-05-31'), null])).toBeNull()
  expect(finDelAcceso([d('2026-05-31'), d('2026-08-31')])?.toISOString().slice(0, 10)).toBe('2026-08-31')
  expect(() => finDelAcceso([])).toThrow()
})
it('errorDeFinDeAlquiler', () => {
  expect(errorDeFinDeAlquiler('2026-03-01', '')).toBeNull()
  expect(errorDeFinDeAlquiler('2026-03-01', '2026-03-01')).toBeNull()
  expect(errorDeFinDeAlquiler('2026-03-01', '2026-02-28')).toBe(
    'La fecha de fin no puede ser anterior al ingreso, el 01/03/2026.',
  )
})
```

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run --project dominio pruebas/dominio/ocupaciones-vigencia.spec.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar `src/dominio/ocupaciones/vigencia.ts`** con las firmas de arriba. La fecha del mensaje con `fechaParaMostrar` de `@/compartido/formato`. Sin imports de infraestructura.
- [ ] **Step 4: Correr y ver que pasa** — mismo comando → PASS.
- [ ] **Step 5: Agregar RN-23 y RN-24 a § 7.2** (`docs/entrega-3/07-analisis-de-datos.md`, tabla de reglas, mismo formato que RN-22): RN-23 «El inquilino accede a las liquidaciones de su unidad desde el mes de su ingreso; el propietario, a toda la historia» → «Corte por período en la capa de aplicación». RN-24 «El acceso de un consorcista sigue a sus ocupaciones: se cierra el día en que termina la última» → «Recálculo de la habilitación en cada alta o fin de ocupación».
- [ ] **Step 6: Commit** — `feat(ocupaciones): reglas de vigencia del inquilino (RN-23, RN-24)`.

---

### Task 2: El acceso sigue a la ocupación

**Files:**
- Modify: `src/infraestructura/repositorios/ocupaciones.ts`
- Modify: `src/aplicacion/consorcios/registrar-ocupacion.ts`
- Modify: `prisma/schema.prisma` (solo el comentario de `model Ocupacion`: reemplazar «y decide a quien se le cobra la expensa» por «y decide que ve cada uno y quien administra al inquilino»; sin migración)
- Test: `pruebas/integracion/inquilinos.spec.ts` (nuevo; `describe('acceso')`)

**Interfaces:**
- Consumes: `hastaSemiabierto`, `hastaInclusivo`, `finDelAcceso` (Task 1).
- Produces:
  - Repo: `OcupacionNueva.hasta` pasa a ser **inclusivo** (`registrarOcupacion` convierte con `hastaSemiabierto`; los llamadores actuales pasan `null`, no cambian).
  - Repo: `terminarOcupacion(ocupacionId: string, hastaInclusivo: Date, cliente?: Prisma.TransactionClient | PrismaClient): Promise<void>` — `UPDATE "Ocupacion" SET vigencia = daterange(lower(vigencia), $hasta::date, '[)'), actualizado_en = CURRENT_TIMESTAMP WHERE id = $id`.
  - Repo: `ocupacionesDePersonaEn(personaId: string, consorcioId: string, cliente?): Promise<{ desde: Date; hastaInclusivo: Date | null }[]>` — SQL crudo con `JOIN "Unidad"` y `un."consorcio_id" =` (como `unidadesOcupadasPor`).
  - Repo: `ocupacionPorId(ocupacionId: string): Promise<{ id: string; unidadId: string; personaId: string; tipo: TipoDeOcupacion; desde: Date; hastaInclusivo: Date | null } | null>`
  - Aplicación (en `registrar-ocupacion.ts`): `sincronizarHabilitacion(personaId: string, consorcioId: string, cliente?: Prisma.TransactionClient | PrismaClient): Promise<void>`; `exigirPropietarioDeLaUnidad` pasa a exportarse.

- [ ] **Step 1: Escribir las pruebas que fallan** en `pruebas/integracion/inquilinos.spec.ts`, con el armado de `consorcios.spec.ts` (`crearAdministradora`, `crearConsorcio`, `crearUsuario`, `habilitarEnConsorcio`, `cargarPadron` 1A/1B/1C, `relojFijo('2026-09-09T12:00:00Z')`, `afterEach` que borra `Ocupacion`, `CoeficienteHistorico`, `Unidad` y llama `limpiar()`). Helper local `habilitacion(usuarioId)` que lee la fila `consorcista` y devuelve `vigenciaHasta?.toISOString().slice(0,10) ?? null`.
  - `'terminar la única ocupación cierra el acceso el último día'`: ocupación inquilino 1A desde 2026-01-01; `terminarOcupacion(id, d('2026-09-30'))` + `sincronizarHabilitacion(persona, consorcioId)` → `'2026-09-30'`.
  - `'con otra ocupación abierta, el acceso sigue abierto'`: además propietario de 1B sin fin → tras terminar 1A, `null`.
  - `'no toca la habilitación de administrador ni de consejo'`: persona también `administrador`; tras sincronizar, la fila `administrador` conserva `vigenciaHasta: null`.
  - `'reabre el acceso de quien vuelve'`: habilitación consorcista cerrada en 2026-05-31 (escrita directo); `registrarOcupacion` (caso de uso, admin) de inquilino en 1C desde 2026-09-01 → `null`.
  - `'una persona sin usuario no crea habilitación'`: `Persona` sin `Usuario`, ocupación + sincronizar → sin filas de `Habilitacion` para nadie nuevo, sin error.
- [ ] **Step 2: Correr y ver que falla** — `npx vitest run --project integracion pruebas/integracion/inquilinos.spec.ts` (base local levantada) → FAIL.
- [ ] **Step 3: Implementar repo** (`terminarOcupacion`, `ocupacionesDePersonaEn`, `ocupacionPorId`, conversión de `hasta` en `registrarOcupacion`; `upper(vigencia)` se lee y se pasa por `hastaInclusivo`).
- [ ] **Step 4: Implementar `sincronizarHabilitacion`** en `registrar-ocupacion.ts`: busca el usuario de la persona (si no hay, retorna); lee `ocupacionesDePersonaEn`; si vacío, retorna; calcula `finDelAcceso`; si existe la fila `(usuario, consorcio, 'consorcista')` la actualiza a esa `vigenciaHasta`, si no la crea con `vigenciaDesde` = el `desde` más antiguo de esas ocupaciones. Al reabrir una fila existente no se toca su `vigenciaDesde`. Reemplaza a `habilitarComoConsorcista` (borrarla) y se llama desde `registrarOcupacion` dentro de la misma transacción que el insert (envolver insert + sincronización en `prismaBase.$transaction`).
- [ ] **Step 5: Correr y ver que pasa** — mismo comando → PASS; además `npx vitest run --project integracion pruebas/integracion/accesos.spec.ts pruebas/integracion/consorcios.spec.ts` siguen en verde.
- [ ] **Step 6: Commit** — `feat(ocupaciones): el acceso del consorcista sigue a sus ocupaciones (RN-24)`.

---

### Task 3: Asignar, terminar y ver inquilinos (casos de uso)

**Files:**
- Create: `src/aplicacion/consorcios/inquilinos.ts`
- Modify: `src/aplicacion/identidad/invitar-persona.ts` (extraer cuenta + invitación)
- Modify: `src/infraestructura/repositorios/ocupaciones.ts` (`inquilinosDe`)
- Test: `pruebas/integracion/inquilinos.spec.ts` (`describe('asignar y terminar')`)

**Interfaces:**
- Consumes: Task 1 (`errorDeFinDeAlquiler`), Task 2 (`terminarOcupacion`, `ocupacionPorId`, `sincronizarHabilitacion`, `exigirPropietarioDeLaUnidad`, `registrarOcupacion` del repo, `comoInquilinoSuperpuesto`).
- Produces:
  - `invitar-persona.ts`: `asegurarCuenta(tx: Prisma.TransactionClient, reloj: Reloj, datos: { nombre: string; apellido: string; correo: string }): Promise<{ personaId: string; usuarioId: string; credencialNueva: string | null }>` (reusa persona por correo; crea usuario `invitado` si no hay; `credencialNueva` solo si lo creó) y `encolarInvitacion(datos: { correo: string; nombre: string; consorcioNombre: string; urlBase: string; credencial: string }): Promise<void>`. `invitarPersona` pasa a usarlas en su rama de usuario nuevo; su comportamiento no cambia.
  - Repo: `interface InquilinoDeUnidad { ocupacionId: string; unidadId: string; nombre: string; correo: string | null; desde: string; hasta: string | null }` (ISO, `hasta` inclusivo) y `inquilinosDe(unidadIds: readonly string[], hoy: Date): Promise<InquilinoDeUnidad[]>` — tipo `inquilino` con `upper(vigencia) IS NULL OR upper(vigencia) > hoy`, orden por `lower(vigencia)`.
  - `inquilinos.ts`:
    - `class FechaDeFinInvalida extends ErrorDeAplicacion` (mensaje = el de `errorDeFinDeAlquiler`, código `'RF-03'`).
    - `asignarInquilino(repositorio, reloj, datos: { usuarioId: string; consorcioId: string; unidadId: string; nombre: string; apellido: string; correo: string; desde: Date; hasta: Date | null; urlBase: string }): Promise<{ ocupacionId: string }>`
    - `terminarAlquiler(repositorio, reloj, datos: { usuarioId: string; consorcioId: string; ocupacionId: string; hasta: Date }): Promise<void>`
    - `verOcupantes(repositorio, reloj, datos: { usuarioId: string; consorcioId: string }): Promise<VistaOcupantes>` con
      `interface VistaOcupantes { gestiona: boolean; unidades: { unidadId: string; designacion: string; tipo: TipoUnidad; inquilinos: InquilinoDeUnidad[] }[]; alquilo: { designacion: string; desde: string; hasta: string | null }[] }`.
      Administrador: todas las unidades vigentes (`bajaDesde: null`), `gestiona: true`. Consejo: todas, `gestiona: false`. Consorcista: solo donde es propietario vigente, `gestiona: true`. `alquilo`: las ocupaciones `inquilino` vigentes de quien consulta.

- [ ] **Step 1: Escribir las pruebas que fallan** (mismo archivo, mismo armado; dueño = consorcista propietario de 1A y 1B; vecino = propietario de 1C):
  - `'el dueño asigna un inquilino nuevo: persona, usuario invitado, ocupación y acceso'` → `asignarInquilino` sobre 1A con correo nuevo; existe `Usuario` `invitado` con ese correo, hay un `TrabajoPendiente` tipo `invitacion`, `habilitacion(inquilino)` es `null` (abierto).
  - `'con fecha de fin, el acceso cierra ese día'` → `hasta: d('2027-02-28')` → `habilitacion` `'2027-02-28'`; `verOcupantes` muestra `hasta: '2027-02-28'`.
  - `'una cuenta existente se reutiliza sin invitación'` → usuario creado antes (en **otro** consorcio); tras asignar: mismo `usuarioId`, cero trabajos `invitacion` nuevos, habilitación consorcista creada en este consorcio.
  - `'sobre la unidad del vecino, no encontrado'` → dueño sobre 1C → `rejects.toBeInstanceOf(NoEncontrado)`; y `terminarAlquiler` sobre una ocupación de 1C → `NoEncontrado`.
  - `'el dueño no termina una ocupación de propietario'` → `terminarAlquiler` sobre su propia ocupación propietario → `NoEncontrado`.
  - `'terminar cierra el acceso y libera la unidad para el siguiente'` → terminar con `hasta: d('2026-09-30')`; `habilitacion` `'2026-09-30'`; asignar otro desde `2026-10-01` funciona.
  - `'fin anterior al ingreso'` → `terminarAlquiler` con `hasta` < `desde` → `FechaDeFinInvalida` con el mensaje exacto; `asignarInquilino` con `hasta < desde` → idem.
  - `'correr el fin sobre el siguiente inquilino'` → A hasta 2026-09-30, B desde 2026-10-01; correr A a 2026-10-15 → `InquilinoSuperpuesto`.
  - `'una cochera se alquila como cualquier unidad'` → padrón de este `describe` con una unidad `C1` de `tipo: 'cochera'`; el dueño asigna en `C1` a la misma persona que ya alquila 1A → dos ocupaciones; terminar la de `C1` deja `habilitacion` en `null` (sigue 1A); terminar después 1A la cierra. `verOcupantes` del dueño lista `C1` con `tipo: 'cochera'`.
  - `'una cochera alquilada a otra persona'` → asignar `C1` a una persona distinta del inquilino de 1A → ninguna superposición (RN-09 es por unidad), cada uno con su acceso.
  - `'verOcupantes por rol'` → admin ve 1A, 1B, 1C con `gestiona: true`; dueño ve 1A y 1B; consejo `gestiona: false`; el inquilino ve `unidades: []` y `alquilo: [{ designacion: '1A', … }]`.
- [ ] **Step 2: Correr y ver que falla** → FAIL.
- [ ] **Step 3: Extraer `asegurarCuenta` y `encolarInvitacion`** de `invitar-persona.ts`; correr `pruebas/integracion/invitaciones*.spec.ts` / `accesos.spec.ts` (los que cubran invitar) → PASS sin cambios.
- [ ] **Step 4: Implementar `inquilinos.ts`**. Autorización: `conAutorizacion` sin `rolesPermitidos` (acción `'administrar inquilinos'`); si no es administrador, `exigirPropietarioDeLaUnidad({ usuarioId, unidadId, tipo: 'inquilino' }, reloj)`. La unidad se busca con `prisma.unidad.findFirst({ where: { id, bajaDesde: null } })` (aislado). Validar con `errorDeFinDeAlquiler` antes de escribir. `asignarInquilino`: en `prismaBase.$transaction` → `asegurarCuenta` → `registrarOcupacion` (repo, tipo `'inquilino'`) → `sincronizarHabilitacion`; errores por `comoInquilinoSuperpuesto`; después de la transacción, si `credencialNueva`, `encolarInvitacion` (nombre del consorcio leído por id dentro del caso de uso, no del formulario). `terminarAlquiler`: `ocupacionPorId`; si no existe, no es `inquilino` o su unidad no pasa el `findFirst` aislado → `NoEncontrado`; transacción `terminarOcupacion` + `sincronizarHabilitacion`.
- [ ] **Step 5: Correr y ver que pasa** → PASS.
- [ ] **Step 6: Commit** — `feat(ocupaciones): asignar y terminar alquileres desde la unidad (RF-03, FR-008b)`.

---

### Task 4: El inquilino ve desde su ingreso, con aviso de deuda anterior

**Files:**
- Modify: `src/aplicacion/liquidacion/ver-expensa.ts`
- Modify: `src/aplicacion/pagos/estado-de-cuenta.ts`
- Modify: `src/app/(panel)/consorcios/[consorcio]/expensas/page.tsx`
- Test: `pruebas/integracion/inquilino-expensas.spec.ts` (nuevo)
- Test: `pruebas/integracion/asistente.spec.ts` (un caso canario)

**Interfaces:**
- Consumes: `visibleDesde`, `periodoVisible` (Task 1).
- Produces:
  - `unidadesPropias(usuarioId, hoy): Promise<{ id: string; designacion: string; visibleDesde: Date | null }[]>` — el SQL suma `"tipo"` y `lower("vigencia")`; agrupa por unidad y aplica `visibleDesde(tipos, desdes)`.
  - `unidadesAlcanzables(...)` devuelve el mismo tipo (`visibleDesde: null` para administrador y consejo).
  - `UnidadConExpensas` suma `deudaAnteriorAlIngreso: string | null` (`null` si `visibleDesde` es `null` o la suma es 0).
  - `estadoDe(unidad, visibleDesde: Date | null)` (privada) y `verEstadoDeCuenta` la calcula con `unidadesPropias` para el no privilegiado.

- [ ] **Step 1: Escribir las pruebas que fallan** en `inquilino-expensas.spec.ts`, reusando `pruebas/integracion/ayudas-pago-en-linea.ts` (`prepararEscenario`, `limpiarEscenario`, `emitirMes`, `RELOJ` 2026-02-05). En el `beforeEach`, después de `prepararEscenario()`: `emitirMes(1)`; crear `nuevo` (usuario) inquilino de **1B** desde `2026-02-01` y `duenio` propietario de 1B desde `2025-01-01` con `registrarOcupacion` (admin); `emitirMes(2)`.
  - `'el inquilino nuevo ve solo desde su ingreso'` → `misExpensas(ALMACEN-de-prueba, repo, RELOJ, { usuarioId: nuevo, consorcioId })` → una unidad `1B`, períodos `['02/2026']`.
  - `'abrir por id una expensa anterior da no encontrado'` → `verExpensa` con el `detalleId` de 1B enero → `NoEncontrado`.
  - `'avisa la deuda anterior al ingreso'` → `deudaAnteriorAlIngreso === '500.00'` (gasto 1000 al 50 %, enero impago).
  - `'el aviso desaparece al saldar'` → `registrarPago` manual de 1B por el exigible de enero (con `deudaDeUnidad`) → `deudaAnteriorAlIngreso === null`.
  - `'el dueño ve toda la historia y sin aviso'` → `misExpensas` de `duenio` → `['02/2026', '01/2026']`, `deudaAnteriorAlIngreso === null`.
  - `'el inquilino de depto y cochera ve las dos, cada una desde su ingreso'` → al mismo `nuevo`, inquilino también de 1A desde `2026-02-01` (terminando antes la ocupación de `inquilino` del escenario el `2026-01-31`) → `misExpensas` devuelve `1A` y `1B`, cada una solo con `02/2026`. (El padrón del escenario no tiene cochera; el tipo no interviene en el corte, así que basta con dos unidades. La cochera queda cubierta en la Tarea 3.)
  - `'el estado de cuenta no lista movimientos anteriores'` → `verEstadoDeCuenta` de `nuevo` sobre 1B → ningún `concepto` contiene `01/2026`; `saldo` igual al del dueño (consolidado).
  - En `asistente.spec.ts`: `'el asistente no le muestra al inquilino expensas anteriores a su ingreso'` → la lectura de expensas del asistente para un inquilino con ingreso posterior no incluye el período previo (seguir el armado del archivo).
  - Almacén: `almacenEnMemoria()` de `pruebas/integracion/asistencia-ayudas.ts`.
- [ ] **Step 2: Correr y ver que falla** → FAIL.
- [ ] **Step 3: Implementar el corte en `ver-expensa.ts`**: `expensasDe(almacen, unidadId, hoy, visibleDesde)` trae todos los detalles (para mapear `detalleId → periodo`), calcula `deudaDeUnidad` sin cambio, devuelve solo los que pasan `periodoVisible`, y `deudaAnteriorAlIngreso` = suma de `saldo` de `deuda.impagos` cuyo período no pasa `periodoVisible` (con `Decimal`, `toFixed(2)`). `verExpensa` lanza `NoEncontrado` si el período no pasa el corte de la unidad alcanzable.
- [ ] **Step 4: Implementar el corte en `estado-de-cuenta.ts`**: `estadoDe` calcula el saldo corrido sobre **todos** los movimientos y después descarta los anteriores a `visibleDesde` (liquidaciones por `periodoVisible`, pagos por `fechaPago >= visibleDesde`). `resumenDeCuentas`: `ultimoMovimiento` anterior a `visibleDesde` → `null`.
- [ ] **Step 5: Dibujar el aviso en `expensas/page.tsx`**, en la vista del consorcista y en «Tus expensas»: por cada unidad con `deudaAnteriorAlIngreso`, arriba de la lista, `<p className="aviso">` con el ícono `Siren` y la copia fija (Global Constraints). Sin `role="alert"` (es estado, nota 25).
- [ ] **Step 6: Correr y ver que pasa** → PASS; además `pruebas/integracion/pago-en-linea*.spec.ts` y `ver-expensa*.spec.ts` siguen en verde.
- [ ] **Step 7: Commit** — `feat(expensas): el inquilino ve desde su ingreso y se le avisa la deuda anterior (RN-23)`.

---

### Task 5: Pantallas — celda de inquilino, Unidades y Mis unidades

**Files:**
- Create: `src/app/(panel)/consorcios/[consorcio]/ocupantes/acciones.ts`
- Create: `src/app/(panel)/consorcios/[consorcio]/ocupantes/celda-inquilino.tsx`
- Create: `src/app/(panel)/consorcios/[consorcio]/ocupantes/modal-asignar-inquilino.tsx`
- Create: `src/app/(panel)/consorcios/[consorcio]/ocupantes/modal-terminar-alquiler.tsx`
- Create: `src/app/(panel)/consorcios/[consorcio]/mis-unidades/page.tsx`
- Create: `src/aplicacion/consorcios/inquilinos-reglas.ts` (reexporta `errorDeFinDeAlquiler` sin Prisma, nota 28)
- Modify: `src/app/(panel)/consorcios/[consorcio]/unidades/page.tsx` (columna «Inquilino»)
- Modify: `src/app/(panel)/secciones.ts` (sección `mis-unidades`, ícono `House`, bloque Administración, `roles: ['consorcista']`)
- Modify: `src/app/aviso-en-url.ts` (dos claves `HECHO`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/usuarios/modal-unidad.tsx`, `usuarios/formulario.tsx`, `usuarios/acciones.ts` (sin opción «Inquilino»: `tipo` fijo `'propietario'`)
- Modify: `docs/entrega-final/16-manual-usuario.md` (subsección «Asignar y terminar un alquiler», para dueño y administrador)
- Test: `pruebas/e2e/inquilinos.spec.ts`, `pruebas/e2e/inquilinos.a11y.spec.ts`; ajustar `pruebas/e2e/usuarios.spec.ts` si usaba «Inquilino».

**Interfaces:**
- Consumes: `asignarInquilino`, `terminarAlquiler`, `verOcupantes`, `VistaOcupantes`, `InquilinoDeUnidad`, `FechaDeFinInvalida` (Task 3); `errorDeFinDeAlquiler` vía `inquilinos-reglas.ts`.
- Produces:
  - `acciones.ts`: `type Resultado = { mensaje: string } & ConValores`; `accionAsignarInquilino(previo: Resultado, datos: FormData): Promise<Resultado>`; `accionTerminarAlquiler(previo: Resultado, datos: FormData): Promise<Resultado>`. Campos: `consorcio`, `unidad` | `ocupacion`, `nombre`, `apellido`, `correo`, `desde`, `hasta`, `volver`. `volver` ∈ `{'unidades','mis-unidades'}`, otro valor → `'mis-unidades'`. Éxito: `redirect(conHecho(\`/consorcios/${consorcioId}/${volver}\`, 'inquilino-asignado' | 'alquiler-terminado'))`. Error de aplicación → `{ mensaje, valores: valoresDe(datos) }`.
  - `CeldaInquilino({ consorcioId, unidad: VistaOcupantes['unidades'][number], gestiona: boolean, volver: 'unidades' | 'mis-unidades', hoy: string })` — servidor; lista cada inquilino como `Nombre · DD/MM/AAAA – DD/MM/AAAA` (`sin fecha`) con `ModalTerminarAlquiler` si `gestiona`; `ModalAsignarInquilino` si `gestiona` y ningún inquilino tiene `hasta === null`; sin inquilinos y sin gestión, `—`.

- [ ] **Step 1: Escribir la e2e que falla** `pruebas/e2e/inquilinos.spec.ts` (armado como `usuarios.spec.ts`: `sembrarEscenario('consorcista')` + `sembrarUnidadPropia` deja al usuario dueño de 3B; `sembrarUsuarioEn(…, 'administrador')`):
  - `'el dueño asigna un inquilino desde Mis unidades y después termina el alquiler'` → entra el dueño, `/consorcios/{id}/mis-unidades`, fila `3B` → botón `Asignar inquilino` → diálogo `Asignar inquilino en 3B`: Nombre, Apellido, Correo, Asignar → toast `Inquilino asignado.` y la fila muestra el nombre; `Terminar alquiler` → diálogo → `Confirmar` → toast `Fin del alquiler registrado.`.
  - `'el error de fecha se ve al tipear'` → Hasta anterior a Desde → texto `La fecha de fin no puede ser anterior al ingreso` bajo el campo, con `aria-invalid="true"`.
  - `'el administrador ve la columna Inquilino en Unidades con las acciones'`.
  - `'consorcio archivado: sin botones'` → con `archivadoEn` sembrado, `Mis unidades` sin `Asignar inquilino`.
  - `'Mis unidades no desborda a lo ancho'` → `desbordaALoAncho(page)` falso en `mis-unidades` (el proyecto `telefono` lo corre a 390×844).
  - `'volver adulterado cae en mis-unidades'` → enviar la acción con `volver=https://ejemplo.test` (vía `page.evaluate` cambiando el `input[name=volver]`) → URL final `/consorcios/{id}/mis-unidades?…`.
- [ ] **Step 2: Escribir la a11y que falla** `pruebas/e2e/inquilinos.a11y.spec.ts`: `mis-unidades` y `unidades` sin infracciones A/AA, y también con el diálogo `Asignar inquilino` abierto (patrón de `consorcista.a11y.spec.ts`).
- [ ] **Step 3: Correr y ver que fallan** — `npm run build`, luego `CI=1 npx playwright test --project=escritorio --project=telefono pruebas/e2e/inquilinos.spec.ts` y `CI=1 npx playwright test --project=a11y pruebas/e2e/inquilinos.a11y.spec.ts` (nota 34: contra el build, `FLAY_ALMACEN=memoria`) → FAIL.
- [ ] **Step 4: Implementar acciones, modales y celda.** Los modales con `BotonModal` (`variante="boton--fantasma"` para Asignar; `boton--fantasma` para Terminar; títulos `Asignar inquilino en {designacion}` / `Terminar el alquiler de {nombre}`), `useActionState`, ids por unidad u ocupación, validador al tipear sobre Desde/Hasta con `aria-describedby="error-hasta-…"`, error de envío único al pie con `role="alert"`. Labels: `Nombre`, `Apellido`, `Correo`, `Desde`, `Hasta`, `Último día`. Botones de envío: `Asignar` / `Confirmar`.
- [ ] **Step 5: Columna en Unidades** (`<th scope="col">Inquilino</th>`, `colSpan` del pie a 3): `verOcupantes` en la página; `gestiona` = la vista dice `gestiona` **y** no archivado; consejo ve el texto sin botones.
- [ ] **Step 6: Página Mis unidades** (`conConsorcio(consorcioId, 'Mis unidades')`): `h1` `Mis unidades`, bajada `.apagado` `Las unidades a nombre de esta cuenta y sus inquilinos.`; tabla `TablaDesplazable` con `caption` `plural(n, 'unidad', 'unidades')`, columnas Unidad · Tipo · Inquilino; debajo, un `<p>` por `alquilo` con la copia fija; si `unidades` y `alquilo` vacíos, `.vacio` con ícono `House` y la copia fija. Acciones ocultas con `activo.archivadoEn`.
- [ ] **Step 7: Sección, toasts y Usuarios**: entrada en `secciones.ts`; claves en `HECHO`; quitar la opción `Inquilino` de `modal-unidad.tsx` y `formulario.tsx` (`<input type="hidden" name="tipoOcupacion" value="propietario">` o eliminar el select y fijar el valor en `acciones.ts`).
- [ ] **Step 8: Manual** — `docs/entrega-final/16-manual-usuario.md`: «Asignar y terminar un alquiler» (dueño desde Mis unidades, administrador desde Unidades; qué pasa con el acceso; qué ve el inquilino y el aviso de deuda anterior).
- [ ] **Step 9: Correr y ver que pasan** — mismo comando del Step 3 → PASS; `pruebas/e2e/usuarios.spec.ts` en verde.
- [ ] **Step 10: Commit** — `feat(ocupaciones): Mis unidades y columna de inquilino en Unidades (RF-03)`.

---

### Task 6: Puerta completa

- [ ] **Step 1:** `npx prettier --write .`
- [ ] **Step 2:** `npm run verificar` → termina sin fallas (format, lint, typecheck, dominio, deploy, drift, integración, build, e2e).
- [ ] **Step 3:** `npm run test:a11y` → 0 infracciones.
- [ ] **Step 4:** `npm run docs:versiones` y `npm audit --omit=dev --audit-level=high` → sin fallas (no se agregan dependencias).
- [ ] **Step 5:** Si algo cambió por el formateo, commit `chore: formato`. No pushear sin pedido.
