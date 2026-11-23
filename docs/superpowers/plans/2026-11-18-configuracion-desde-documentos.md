# Configuración desde la documentación, horarios, reserva con deuda y proveedor desde la factura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el espacio común tenga horario de uso y bloqueo por deuda configurable, que la factura ofrezca dar de alta su proveedor, y que reglamentos, actas y contratos dejen sugerencias de configuración aplicables con un clic.

**Architecture:** Dos columnas nuevas en `EspacioComun` con una función de dominio pura para el horario; `confirmarExtraccion` crea el proveedor en su transacción; una séptima interfaz de IA (`LectorDeConfiguracion`, tres implementaciones), un trabajo de cola `sugerir_configuracion` encolado al terminar de indexar, una tabla `SugerenciaConfiguracion`, y aplicadores que llaman a los casos de uso de configuración existentes.

**Tech Stack:** Next.js (App Router, Server Actions), Prisma + PostgreSQL, Zod, `@google/genai` (ya instalado), Vitest (`--project dominio` / `--project integracion`), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-configuracion-desde-documentos-design.md`

## Global Constraints

- Español en código, textos y commits; commits citan `RF-15` (espacios), `CU-09` (reservas), `RF-06` (carga asistida), `RF-19`/`RF-20` (documentación), `RN-14`, `RNF-14`/`RNF-15`.
- RN-14: **nada de la IA escribe configuración sin el clic de «Aplicar»**.
- Invariante 5: la interfaz nueva tiene exactamente tres implementaciones (Gemini, determinística, nula) y ninguna lanza por indisponibilidad (`Resultado<T>`).
- Invariante 1: `SugerenciaConfiguracion` lleva `consorcio_id`; se lee con `prisma` aislado. Los manejadores de cola usan `prismaBase` con el `consorcioId` explícito del documento, como `manejadorIndexacion`.
- Hora argentina para todo horario (`America/Argentina/Buenos_Aires`), nunca UTC.
- Ningún `number` para dinero; los porcentajes viajan como cadena (`'3.0000'`).
- Migraciones versionadas (`prisma/migrations/2026111812xxxx_*`), con `npm run db:drift` limpio.
- Solo se analizan los tipos de documento `reglamento_copropiedad`, `reglamento_interno`, `acta` y `contrato`.
- El depósito **no** entra en las sugerencias; el padrón tampoco.
- Rama: `feat/configuracion-desde-documentos` desde `main`, **después** de mergear el plan de arreglos (comparten `documentos/[id]/page.tsx`).
- Antes de pushear: `prettier --write .`, `npm run verificar`, `npm audit --omit=dev --audit-level=high`.

## Review Focus

- **Horario que cruza la medianoche y reserva de madrugada** (20:00–02:00, reserva 00:30–01:30): válida → Task 1.
- **Espacio sin horario** (columnas nulas, todos los existentes): ninguna reserva cambia de resultado → Task 2.
- **El modelo devuelve basura o un espacio inventado** (`espacioId` que no es del consorcio, días 31, recargo negativo, tasa en texto): se descarta esa sugerencia, el resto se guarda, el trabajo no falla → Task 7.
- **Aplicar dos veces la misma sugerencia** (doble clic, dos pestañas): la segunda no escribe dos veces ni duplica el espacio → Task 8.
- **Documento reemplazado o borrado mientras su análisis está en cola:** el manejador termina sin lanzar y no deja sugerencias huérfanas → Task 7 (FK `ON DELETE CASCADE` + `if (!documento) return`).

---

### Task 1: Horario de uso en el dominio

**Files:**
- Create: `src/dominio/reservas/horario.ts`
- Test: `pruebas/dominio/horario-de-uso.spec.ts`

**Interfaces:**
- Produces (todo puro, sin Prisma):
  - `interface HorarioDeUso { apertura: number; cierre: number }`: minutos desde las 00:00, 0..1439; `cierre <= apertura` significa que cruza la medianoche.
  - `minutosDesdeHora(hora: string): number | null`: `'10:30'` → `630`; formato inválido → `null`.
  - `horaDesdeMinutos(minutos: number): string`: `630` → `'10:30'`.
  - `errorDeHorario(apertura: string, cierre: string): string | null` (los dos vacíos → `null`).
  - `dentroDelHorario(desde: Date, hasta: Date, horario: HorarioDeUso | null): boolean`
  - `horarioParaMostrar(horario: HorarioDeUso): string`: `'de 10:00 a 23:00'`.

- [ ] **Step 1: Write the failing tests:**

```ts
const AR = (iso: string) => new Date(`${iso}-03:00`)
const SUM = { apertura: 600, cierre: 1380 } // 10:00–23:00
const NOCHE = { apertura: 1200, cierre: 120 } // 20:00–02:00
it('sin horario, todo vale', () => expect(dentroDelHorario(AR('2026-12-05T03:00'), AR('2026-12-05T04:00'), null)).toBe(true))
it('justo de apertura a cierre vale', () => expect(dentroDelHorario(AR('2026-12-05T10:00'), AR('2026-12-05T23:00'), SUM)).toBe(true))
it('un minuto antes de abrir no vale', () => expect(dentroDelHorario(AR('2026-12-05T09:59'), AR('2026-12-05T12:00'), SUM)).toBe(false))
it('pasarse del cierre no vale', () => expect(dentroDelHorario(AR('2026-12-05T22:00'), AR('2026-12-05T23:01'), SUM)).toBe(false))
it('cruzando la medianoche vale', () => expect(dentroDelHorario(AR('2026-12-05T21:00'), AR('2026-12-06T01:30'), NOCHE)).toBe(true))
it('la madrugada cae en la ventana del día anterior', () => expect(dentroDelHorario(AR('2026-12-06T00:30'), AR('2026-12-06T01:30'), NOCHE)).toBe(true))
it('en el hueco de la ventana nocturna no vale', () => expect(dentroDelHorario(AR('2026-12-06T03:00'), AR('2026-12-06T04:00'), NOCHE)).toBe(false))
it('a las 21 h argentinas (00 h UTC) se mide en hora argentina', () => expect(dentroDelHorario(AR('2026-12-05T21:00'), AR('2026-12-05T22:30'), SUM)).toBe(true))
it('errorDeHorario', () => {
  expect(errorDeHorario('', '')).toBeNull()
  expect(errorDeHorario('10:00', '')).toBe('Completá la apertura y el cierre, o dejá los dos vacíos.')
  expect(errorDeHorario('10:00', '10:00')).toBe('La apertura y el cierre no pueden ser la misma hora.')
  expect(errorDeHorario('25:00', '23:00')).toBe('Usá horas del día, de 00:00 a 23:59.')
})
it('minutos y horas ida y vuelta', () => {
  expect(minutosDesdeHora('02:00')).toBe(120); expect(minutosDesdeHora('2pm')).toBeNull()
  expect(horaDesdeMinutos(1380)).toBe('23:00'); expect(horarioParaMostrar(NOCHE)).toBe('de 20:00 a 02:00')
})
```

- [ ] **Step 2: Run** `npx vitest run --project dominio pruebas/dominio/horario-de-uso.spec.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implement.** Minuto del día argentino con `Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })`. Una sola fórmula para los dos casos:

```ts
const largo = (h.cierre - h.apertura + 1440) % 1440          // apertura ≠ cierre por validación
const desdeApertura = (minutoArgentino(desde) - h.apertura + 1440) % 1440
const duracion = (hasta.getTime() - desde.getTime()) / 60_000
return desdeApertura + duracion <= largo
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(reservas): horario de uso de un espacio, en hora argentina (RF-15)`

### Task 2: El espacio guarda horario y bloqueo por deuda; la reserva los respeta

**Files:**
- Create: `prisma/migrations/20261118120000_espacio_horario_y_deuda/migration.sql`
- Modify: `prisma/schema.prisma` (`EspacioComun`)
- Modify: `src/aplicacion/reservas/espacios.ts` (`EspacioDelConsorcio`, `DatosDeEspacio`, `validar`, `listarEspacios`, `altaEspacio`, `editarEspacio`)
- Modify: `src/aplicacion/reservas/reservar.ts:85-93` y reglas
- Test: `pruebas/integracion/reservas.spec.ts`

**Interfaces:**
- Consumes: `HorarioDeUso`, `dentroDelHorario`, `horarioParaMostrar`, `errorDeHorario`, `minutosDesdeHora` (Task 1).
- Produces:
  - Columnas: `aperturaMinutos Int? @map("apertura_minutos") @db.SmallInt`, `cierreMinutos Int? @map("cierre_minutos") @db.SmallInt`, `rechazaConDeuda Boolean @default(true) @map("rechaza_con_deuda")`. SQL: `CHECK ((apertura_minutos IS NULL) = (cierre_minutos IS NULL))`, `CHECK (apertura_minutos BETWEEN 0 AND 1439)`, `CHECK (cierre_minutos BETWEEN 0 AND 1439)`, `CHECK (apertura_minutos <> cierre_minutos)`. Minutos en lugar del `TIME` del diseño: Prisma mapea `TIME` a `Date` y el dominio trabaja en minutos (desvío deliberado, mismo significado).
  - `DatosDeEspacio` suma `horario?: HorarioDeUso | null` y `rechazaConDeuda?: boolean`; `EspacioDelConsorcio` suma `horario: HorarioDeUso | null` y `rechazaConDeuda: boolean`.
  - `validar` pasa a exportarse como `validarEspacio(datos: DatosDeEspacio): void` (lanza `EspacioInvalido`); Task 7 la reusa.

- [ ] **Step 1: Write the failing tests** en `reservas.spec.ts`, con un espacio dado de alta con `horario: { apertura: 600, cierre: 1380 }`:

```ts
it('fuera del horario se rechaza con el horario en el mensaje (RF-15)', async () => {
  await expect(reservar(repo, RELOJ, { …, desde: AR('2026-09-20T08:00'), hasta: AR('2026-09-20T10:00') }))
    .rejects.toThrow('se usa de 10:00 a 23:00')
})
it('sin horario, una reserva de madrugada se acepta igual que antes', async () => { /* espacio sin horario, 03:00–04:00 → ok */ })
it('con rechazaConDeuda en false, la unidad con deuda vencida reserva (CU-09)', async () => { /* liquidar con deuda vencida como el test de deuda existente; espacio con rechazaConDeuda: false → ok */ })
it('por defecto, la unidad con deuda sigue rechazada', async () => { /* el test de deuda existente sin cambios sigue verde */ })
it('alta con apertura igual al cierre es EspacioInvalido', async () => { /* horario { apertura: 600, cierre: 600 } → rejects EspacioInvalido; la base lo frenaría igual por CHECK */ })
```

- [ ] **Step 2: Run** `npx vitest run --project integracion pruebas/integracion/reservas.spec.ts` → FAIL.
- [ ] **Step 3: Implement.** Migración más esquema (`npx prisma migrate dev --name espacio_horario_y_deuda --create-only`, completar los `CHECK` a mano y aplicar). En `validarEspacio`: si `horario` viene, `apertura`/`cierre` enteros en 0..1439 y distintos; si no, `EspacioInvalido` con el texto de `errorDeHorario`. `altaEspacio` y `editarEspacio` escriben las tres columnas (`horario === undefined` no toca nada; `null` borra el horario). `listarEspacios` las lee. En `reservar`, el paso 1 corre solo si `espacio.rechazaConDeuda`; la verificación de horario va con las reglas del paso 2, mensaje `` `${espacio.nombre} se usa ${horarioParaMostrar(h)}.` ``.
- [ ] **Step 4: Run** → PASS; `npm run db:drift` limpio.
- [ ] **Step 5: Commit** `feat(reservas): horario de uso y rechazo por deuda configurable por espacio (RF-15, CU-09)`

### Task 3: Cambiar el horario cancela las reservas que quedan afuera

**Files:**
- Modify: `src/aplicacion/reservas/espacios.ts` (`editarEspacio`, helper nuevo)
- Test: `pruebas/integracion/reservas.spec.ts`

**Interfaces:**
- Produces:
  - `editarEspacio(...): Promise<{ canceladas: number }>` (antes `void`).
  - `reservasFueraDeHorario(cliente: Pick<typeof prisma, 'reserva'>, espacioId: string, horario: HorarioDeUso | null, ahora: Date): Promise<{ id: string; solicitadaPor: string }[]>`: confirmadas, `desde > ahora`, que no cumplen `dentroDelHorario`.
  - `contarReservasAfectadas(repositorio, reloj, datos: { usuarioId; consorcioId; espacioId; horario: HorarioDeUso | null }): Promise<number>`: solo administrador; Task 8 la usa en la tarjeta.

- [ ] **Step 1: Write the failing tests:**

```ts
it('al achicar el horario se cancelan y avisan solo las futuras que no caben', async () => {
  // reservas confirmadas: 21:00–22:30 (no cabe en 10–20), 12:00–14:00 (cabe), y una en curso (desde < ahora) a las 21 h
  const { canceladas } = await editarEspacio(repo, RELOJ, { …, horario: { apertura: 600, cierre: 1200 } })
  expect(canceladas).toBe(1)
  // la de 21:00 queda 'cancelada' con motivoRechazo 'Cambió el horario de uso del espacio'; las otras dos siguen 'confirmada'
  // hay una Notificacion 'reserva_rechazada' para quien la solicitó, con cuerpo que nombra el espacio y el nuevo horario
})
it('editar sin cambiar el horario no cancela nada', async () => { /* canceladas: 0 */ })
it('contarReservasAfectadas anticipa lo mismo sin escribir', async () => { /* 1, y la reserva sigue confirmada */ })
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** En `editarEspacio`: si el horario pedido difiere del guardado, dentro de un `prisma.$transaction`: `update` del espacio, `reservasFueraDeHorario(tx, …)`, `updateMany` a `cancelada` con `motivoRechazo: 'Cambió el horario de uso del espacio'`, y `notificar(tx, …)` con `titulo: \`Reserva cancelada: ${nombre}\``, `cuerpo: \`${nombre} ahora se usa ${horarioParaMostrar(h)} y tu reserva quedó afuera, así que se canceló.\`` (sin horario no se cancela nada). Mismo patrón que `deshabilitarEspacio`. La reserva en curso no se toca porque el filtro es `desde > ahora`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(reservas): un cambio de horario cancela y avisa las reservas que quedan afuera (RF-15)`

### Task 4: Formulario del espacio con horario y bloqueo por deuda

**Files:**
- Modify: `src/app/(panel)/consorcios/[consorcio]/espacios/modal-espacio.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/reservas/acciones.ts:81-111` (`accionGuardarEspacio`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/espacios/page.tsx` (mostrar horario en la tarjeta)
- Modify: `src/app/aviso-en-url.ts`
- Create: `src/aplicacion/reservas/horario-reglas.ts` (reexporta `errorDeHorario`, `horaDesdeMinutos` para el cliente sin Prisma, decisión 28)
- Test: `pruebas/e2e/reservas.spec.ts`

**Interfaces:**
- Consumes: `errorDeHorario`, `minutosDesdeHora`, `horaDesdeMinutos` (Task 1); `editarEspacio → { canceladas }` (Task 3).
- Produces: campos del formulario `apertura`, `cierre` (`<input type="time">`) y `rechazaConDeuda` (checkbox, marcada por defecto). `HECHO['horario-cancelo-reservas'] = 'Espacio guardado. Las reservas que quedaron fuera del nuevo horario se cancelaron y se avisó a quienes las hicieron.'`

- [ ] **Step 1: Write the failing e2e:** el administrador edita el SUM con horario 10:00–23:00 → la tarjeta del espacio dice «de 10:00 a 23:00»; un consorcista intenta reservar a las 08:00 y ve «se usa de 10:00 a 23:00»; al tipear apertura sin cierre aparece el error de campo debajo, con `aria-invalid`.
- [ ] **Step 2: Run** `npx playwright test pruebas/e2e/reservas.spec.ts -g horario` → FAIL.
- [ ] **Step 3: Implement.** Dos `type="time"` en un `fieldset` «Horario de uso» con la ayuda «Vacío si se usa a cualquier hora. Si el cierre es antes que la apertura, cruza la medianoche.» Validación al tipear con `errorDeHorario` (`error-apertura-<sufijo>`, sin `role`), siguiendo la decisión 28. Casilla «Rechazar reservas de unidades con deuda vencida». La acción convierte con `minutosDesdeHora` (los dos vacíos → `horario: null`) y redirige con `'horario-cancelo-reservas'` si `canceladas > 0`, o con `'espacio-guardado'` si no.
- [ ] **Step 4: Run** la e2e en escritorio y teléfono → PASS.
- [ ] **Step 5: Commit** `feat(reservas): el formulario del espacio configura horario y deuda (RF-15)`

### Task 5: Dar de alta el proveedor desde la factura

**Files:**
- Modify: `src/aplicacion/gastos/extraccion.ts:218-322` (`confirmarExtraccion`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/gastos/asistida/[id]/page.tsx:78-150` y su formulario (el componente que recibe `proveedores`)
- Modify: la acción que llama a `confirmarExtraccion` (`grep -rn "confirmarExtraccion(" src/app`)
- Test: `pruebas/integracion/extraccion.spec.ts`

**Interfaces:**
- Produces: `confirmarExtraccion` suma `nuevoProveedor?: { razonSocial: string; cuit: string } | null`. Ignorado si viene `proveedorId`. Campos del formulario: `altaProveedor` (checkbox), `proveedorRazonSocial`, `proveedorCuit`.

- [ ] **Step 1: Write the failing tests:**

```ts
it('con nuevoProveedor crea el proveedor en la misma confirmación y le ata el gasto (RF-06)', async () => {
  const { gastoId } = await confirmarExtraccion(repo, RELOJ, { …, proveedorId: null, nuevoProveedor: { razonSocial: 'Ascensores Sur SRL', cuit: '30-71234567-9' } })
  const gasto = await prismaBase.gasto.findUniqueOrThrow({ where: { id: gastoId }, include: { proveedor: true } })
  expect(gasto.proveedor).toMatchObject({ razonSocial: 'Ascensores Sur SRL', cuit: '30712345679', rubroHabitualId: gasto.rubroId })
})
it('si el CUIT ya está en el padrón, usa ese proveedor y no duplica', async () => { /* count de proveedor sigue en 1 */ })
it('un CUIT inválido rechaza con CuitInvalido y no crea el gasto', async () => { /* gasto.count 0 */ })
it('editar la razón social o el CUIT detectados cuenta como corrección', async () => { /* camposCorregidos contiene 'proveedor' o 'cuit' */ })
```

(El valor normalizado de `cuit` sale de `normalizarCuit`, `src/dominio/proveedores/cuit.ts`: ajustar la expectativa a lo que devuelva.)

- [ ] **Step 2: Run** `npx vitest run --project integracion pruebas/integracion/extraccion.spec.ts -t proveedor` → FAIL.
- [ ] **Step 3: Implement.** Validar antes de la transacción: razón social no vacía (`ProveedorIncompleto`), `normalizarCuit` (`CuitInvalido`); los dos errores se importan de `aplicacion/proveedores`. Dentro de `prisma.$transaction`, antes de `gasto.create`: `tx.proveedor.findFirst({ where: { cuit } })` ?? `tx.proveedor.create({ data: sinConsorcio({ razonSocial, cuit, rubroHabitualId: rubro.id }) })`. Si el `create` lanza `P2002` (carrera), se relee por CUIT. `camposCorregidos` suma `'proveedor'` si la razón social difiere de `proveedorDetectado` y `'cuit'` si el CUIT normalizado difiere de `normalizarCuit(cuitDetectado)`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: UI.** Cuando la página no encontró proveedor (`proveedor === undefined`) y `propuesta.proveedor` y `propuesta.cuit` existen: casilla marcada «Dar de alta como proveedor» con dos inputs editables (Razón social, CUIT) precargados. Si se elige un proveedor en el select, la casilla se desmarca y se oculta. La acción arma `nuevoProveedor` solo si la casilla viene `on` y el select está vacío.
- [ ] **Step 6: Run** la e2e de carga asistida (`pruebas/e2e/asistencia.spec.ts`) → PASS, sumando un caso: un comprobante determinístico con proveedor desconocido muestra la casilla, y al confirmar el proveedor aparece en Proveedores.
- [ ] **Step 7: Commit** `feat(gastos): la factura ofrece dar de alta su proveedor al confirmar (RF-06, RN-14)`

### Task 6: La interfaz `LectorDeConfiguracion` y sus tres implementaciones

**Files:**
- Modify: `src/dominio/contratos/asistencia.ts`
- Modify: `src/infraestructura/asistencia/nula.ts`, `determinista.ts`, `gemini.ts`
- Modify: `src/aplicacion/dependencias.ts` (`ASISTENCIA.lector`)
- Modify: `pruebas/integracion/asistencia-implementaciones.spec.ts` («seis» → «siete»)
- Modify: `CLAUDE.md` (lista de la invariante 5) y `docs/entrega-final/14-codificacion.md` § 14.3 si enumera las interfaces
- Create: `pruebas/fixtures/reglamento-de-prueba.txt` (texto que la determinística reconoce)

**Interfaces:**
- Produces, en `asistencia.ts`:

```ts
export interface EspacioSugerido {
  nombre: string
  capacidadMaxima?: number | null
  anticipacionMinimaHoras?: number
  anticipacionMaximaDias?: number
  duracionMaximaHoras?: number
  reservasMaxMesUnidad?: number
  /** 'HH:MM' en hora argentina. */
  horario?: { apertura: string; cierre: string } | null
  rechazaConDeuda?: boolean
}
export type SugerenciaLeida = { cita: string } & (
  | { tipo: 'espacio_nuevo'; datos: EspacioSugerido }
  | { tipo: 'espacio_cambio'; espacioId: string; datos: Partial<EspacioSugerido> }
  /** Tramos en convención de boleta (decisión 27): el 1º a 0 %. Porcentajes como cadena. */
  | { tipo: 'vencimientos'; datos: { tramos?: { diaDelMes: number; recargoPorcentaje: string }[]; tasaMoraMensual?: string } }
  | { tipo: 'asambleas'; datos: { reglaMayoria?: 'presentes' | 'totalidad'; anticipacionDias?: number; topeApoderado?: number; umbralSinVoto?: number } }
  | { tipo: 'instrucciones_pago'; datos: { texto: string } }
)
export interface LectorDeConfiguracion {
  leer(texto: string, contexto: { espaciosExistentes: { id: string; nombre: string }[] }): Promise<Resultado<SugerenciaLeida[]>>
}
```

  `Asistencia` suma `lector: LectorDeConfiguracion`.

- [ ] **Step 1: Write the failing tests** en `asistencia-implementaciones.spec.ts`: «cada una expone las siete interfaces» (sumar `lector`); la nula devuelve `{ disponible: false }` en `lector.leer` sin lanzar; la determinística, con el texto de `reglamento-de-prueba.txt` y `espaciosExistentes: [{ id: 'e1', nombre: 'Quincho' }]`, devuelve exactamente: un `espacio_nuevo` «SUM» con `horario { apertura: '10:00', cierre: '23:00' }` y `anticipacionMinimaHoras: 48`, un `espacio_cambio` sobre `e1` con `duracionMaximaHoras: 6`, y un `vencimientos` con `tasaMoraMensual: '3.0000'`; con cualquier otro texto devuelve `[]`.
- [ ] **Step 2: Run** `npx vitest run --project integracion pruebas/integracion/asistencia-implementaciones.spec.ts` → FAIL.
- [ ] **Step 3: Implement.** Nula: `noDisponible(\`${MOTIVO} Configurá el consorcio desde sus pantallas.\`)`. Determinística: reconoce el fixture por una frase fija (por ejemplo, `/SUM.*10 a 23 horas/`) y devuelve las tres sugerencias de arriba. Gemini: mismo patrón que `extractor` (salida estructurada con `responseSchema`, Zod del lado nuestro, salida fuera de esquema → `noDisponible`). Prompt: lista de lo configurable con unidades (horas, días, minutos 'HH:MM'), tramos en convención «pagando hasta el día N, recargo X %», «devolvé solo lo que el texto fija explícitamente, con la cita literal», `espacioId` solo de `espaciosExistentes`. Texto recortado a los primeros 200 000 caracteres (decisión del constructor; `ponytail:` comentario con el tope). `dependencias.ts`: `lector: { async leer(t, c) { return (await resolverAsistencia()).lector.leer(t, c) } }`.
- [ ] **Step 4: Run** → PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(asistencia): LectorDeConfiguracion con sus tres implementaciones (RNF-14, RNF-15)`

### Task 7: Sugerencias guardadas al indexar y bajo pedido

**Files:**
- Create: `prisma/migrations/20261118130000_sugerencias_configuracion/migration.sql`
- Modify: `prisma/schema.prisma` (modelo, enums, valor `sugerir_configuracion` en `TipoTrabajo`)
- Create: `src/aplicacion/comunicacion/sugerencias.ts`
- Modify: `src/aplicacion/comunicacion/indexar.ts` (encolar al terminar)
- Modify: `src/aplicacion/comunicacion/documentos.ts` (`TIPOS_ANALIZABLES`, `buscarConfiguracion`)
- Modify: `src/aplicacion/pendientes/manejadores.ts`
- Modify: `src/aplicacion/asambleas/configuracion.ts` (exportar `ESQUEMA` como `ESQUEMA_CONFIGURACION_ASAMBLEAS`)
- Test: `pruebas/integracion/sugerencias-configuracion.spec.ts`

**Interfaces:**
- Consumes: `LectorDeConfiguracion`, `SugerenciaLeida` (Task 6); `validarEspacio` (Task 2); `validarReglaVencimientos` (`src/dominio/liquidacion/vencimientos.ts`); `ESQUEMA_CONFIGURACION_ASAMBLEAS`; `errorDeInstrucciones`.
- Produces:
  - Modelo `SugerenciaConfiguracion { id, consorcioId, documentoId (FK ON DELETE CASCADE), tipo TipoSugerencia, datos Json @db.JsonB, cita String @db.Text, estado EstadoSugerencia @default(pendiente), resueltaPor String? @db.Uuid, resueltaEn DateTime?, creadoEn, actualizadoEn }`, `@@index([consorcioId, documentoId, estado])`. Enums `TipoSugerencia { espacio_nuevo espacio_cambio vencimientos asambleas instrucciones_pago }`, `EstadoSugerencia { pendiente aplicada descartada }`. `espacioId` de `espacio_cambio` viaja dentro de `datos`. Grants: los de `flay_app` por defecto (la migración inicial los da a toda tabla nueva).
  - `TIPOS_ANALIZABLES: readonly TipoDocumento[] = ['reglamento_copropiedad', 'reglamento_interno', 'acta', 'contrato']`.
  - `manejadorSugerencias(lector: LectorDeConfiguracion): Manejador`, con carga `{ documentoId: string }`.
  - `vigenteDelConsorcio(cliente, consorcioId): Promise<ConfiguracionVigente>`: espacios (con horario y deuda), tramos, tasa, reglas de asamblea e instrucciones.
  - `cambiosDe(sugerencia: SugerenciaLeida, vigente: ConfiguracionVigente): { campo: string; actual: string; propuesto: string }[]`: textos ya legibles; tramos en la convención de la pantalla vía `escalonadoDesdeTramos`. Task 8 la usa para mostrar.
  - `buscarConfiguracion(repositorio, reloj, datos: { usuarioId; consorcioId; documentoId }): Promise<void>`: solo administrador, documento `indexado` y de tipo analizable (si no, `ErrorDeAplicacion` «Este documento no se analiza para configuración.»).

- [ ] **Step 1: Write the failing tests** (`sugerencias-configuracion.spec.ts`; documento sembrado `indexado` con `FragmentoDocumento` que contienen el texto del fixture, y el lector determinístico):

```ts
it('el análisis guarda las sugerencias con su cita, pendientes', async () => {
  await manejadorSugerencias(asistenciaDeterminista.lector)({ documentoId })
  const filas = await prismaBase.sugerenciaConfiguracion.findMany({ where: { documentoId } })
  expect(filas.map((f) => f.tipo).sort()).toEqual(['espacio_cambio', 'espacio_nuevo', 'vencimientos'])
  expect(filas.every((f) => f.estado === 'pendiente' && f.cita.length > 0)).toBe(true)
})
it('reanalizar reemplaza las pendientes y conserva las aplicadas y descartadas', async () => { /* marcar una como descartada, correr otra vez: 1 descartada + las demás nuevas pendientes, sin duplicar */ })
it('una sugerencia igual a la configuración vigente no se guarda', async () => { /* poner tasa 3 % antes: no hay 'vencimientos' */ })
it('una sugerencia inválida se descarta y el resto se guarda', async () => { /* lector doble que devuelve un espacio_cambio con espacioId ajeno y un tramo día 31: solo queda la válida; el manejador no lanza */ })
it('con la nula no queda nada y el trabajo no lanza', async () => {})
it('documento borrado mientras esperaba: termina sin lanzar', async () => {})
it('la indexación encola el análisis solo para reglamento, acta y contrato', async () => {
  // manejadorIndexacion con dobles sobre un 'poliza' y un 'reglamento_interno': un solo TrabajoPendiente 'sugerir_configuracion', del reglamento
})
it('buscarConfiguracion: el administrador encola; el consorcista no; la póliza no', async () => {})
```

- [ ] **Step 2: Run** `npx vitest run --project integracion pruebas/integracion/sugerencias-configuracion.spec.ts` → FAIL.
- [ ] **Step 3: Implement** migración y esquema (`ALTER TYPE "TipoTrabajo" ADD VALUE 'sugerir_configuracion';`, como `20261103150000_acta_asistida`). Si la auditoría por disparadores cubre las tablas de configuración, sumar `SugerenciaConfiguracion` siguiendo el patrón de `fn_auditar()`.
- [ ] **Step 4: Implement `manejadorSugerencias`.** Lee el documento con `prismaBase`; si no existe o su tipo no está en `TIPOS_ANALIZABLES`, sale. Arma el texto uniendo `FragmentoDocumento.contenido` por `numeroFragmento`. Llama a `lector.leer` con los espacios activos del consorcio; si no está disponible, sale sin escribir. Por cada sugerencia: valida (el `espacioId` existe en ese consorcio; `validarEspacio` con el horario convertido por `minutosDesdeHora`; `validarReglaVencimientos` sobre lo mezclado con lo vigente; `ESQUEMA_CONFIGURACION_ASAMBLEAS.safeParse` sobre lo mezclado; `errorDeInstrucciones`) y descarta si falla o si `cambiosDe` da vacío. En una transacción: `deleteMany` de las `pendiente` de ese documento y `createMany` de las nuevas.
- [ ] **Step 5: Encolar.** En `manejadorIndexacion`, después del último `update` a `indexado`, si `TIPOS_ANALIZABLES.includes(documento.tipo)`: `INSERT INTO "TrabajoPendiente" (tipo, carga) VALUES ('sugerir_configuracion'::"TipoTrabajo", jsonb_build_object('documentoId', …))`, sin `proximo_intento` (decisión 9). `buscarConfiguracion` usa el mismo `INSERT`. En `MANEJADORES`: `sugerir_configuracion: manejadorSugerencias(ASISTENCIA.lector)`.
- [ ] **Step 6: Run** → PASS; `npm run db:drift` limpio.
- [ ] **Step 7: Commit** `feat(documentos): reglamentos, actas y contratos dejan sugerencias de configuración (RF-19, RN-14)`

### Task 8: Ver, aplicar y descartar sugerencias

**Files:**
- Modify: `src/aplicacion/comunicacion/sugerencias.ts`
- Modify: `src/aplicacion/comunicacion/documentos.ts` (`DocumentoDelConsorcio.sugerenciasPendientes`)
- Test: `pruebas/integracion/sugerencias-configuracion.spec.ts`

**Interfaces:**
- Consumes: `cambiosDe`, `vigenteDelConsorcio` (Task 7); `altaEspacio`, `editarEspacio → { canceladas }`, `contarReservasAfectadas` (Tasks 2–3); `guardarReglaVencimientos`; `guardarConfiguracion`; `guardarInstruccionesDePago`.
- Produces:
  - `interface SugerenciaVisible { id: string; tipo: TipoSugerencia; titulo: string; cita: string; estado: EstadoSugerencia; cambios: { campo: string; actual: string; propuesto: string }[]; aplicable: boolean; reservasAfectadas: number }`. Ejemplos de `titulo`: «Nuevo espacio: SUM», «Cambios en Quincho», «Vencimientos y mora», «Reglas de asamblea», «Instrucciones de pago».
  - `listarSugerencias(repositorio, reloj, datos: { usuarioId; consorcioId; documentoId }): Promise<SugerenciaVisible[]>`: solo administrador; pendientes primero; `cambios` recalculados al mirar; `aplicable = false` si el `espacio_cambio` apunta a un espacio inexistente o deshabilitado.
  - `aplicarSugerencia(repositorio, reloj, datos: { usuarioId; consorcioId; sugerenciaId }): Promise<{ canceladas: number }>`
  - `descartarSugerencia(repositorio, reloj, datos: { usuarioId; consorcioId; sugerenciaId }): Promise<void>`
  - `class SugerenciaYaResuelta extends ErrorDeAplicacion`: mensaje `'Esta sugerencia ya se aplicó o se descartó.'`, `'RN-14'`.
  - `DocumentoDelConsorcio` suma `sugerenciasPendientes: number | null` (`null` para quien no administra).

- [ ] **Step 1: Write the failing tests:**

```ts
it('aplicar un espacio_nuevo crea el espacio por altaEspacio y marca quién y cuándo', async () => {
  await aplicarSugerencia(repo, RELOJ, { usuarioId: administrador, consorcioId, sugerenciaId: sumNuevo })
  // EspacioComun 'SUM' con aperturaMinutos 600, cierreMinutos 1380, anticipacionMinimaHoras 48
  // sugerencia: estado 'aplicada', resueltaPor = administrador, resueltaEn = RELOJ.ahora()
})
it('aplicar un espacio_cambio mezcla con lo vigente: solo cambia lo sugerido', async () => {})
it('aplicar vencimientos con solo la mora conserva los tramos vigentes', async () => {})
it('si el caso de uso rechaza, la sugerencia sigue pendiente y el error es el del caso de uso', async () => { /* mora '1.0000' con un recargo vigente de 5 % → rejects con el mensaje del dominio; estado 'pendiente' */ })
it('aplicar dos veces: la segunda es SugerenciaYaResuelta y no escribe', async () => {})
it('un cambio de horario aplicado cancela y devuelve cuántas; listar lo anticipaba', async () => { /* reservasAfectadas = 1 antes; aplicar → { canceladas: 1 } */ })
it('descartar no toca la configuración', async () => {})
it('consorcista: listar, aplicar y descartar son RolInsuficiente', async () => {})
it('sugerencia de otro consorcio: NoEncontrado', async () => {})
it('listarDocumentos da sugerenciasPendientes al administrador y null al resto', async () => {})
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `aplicarSugerencia`: dentro de `conAutorizacion` (administrador) lee la sugerencia aislada (`NoEncontrado`); si no está `pendiente`, `SugerenciaYaResuelta`. Parsea `datos` con el Zod del tipo. Mezcla con lo vigente y llama al caso de uso del tipo con el mismo `usuarioId` y `consorcioId` (los errores burbujean sin tocar la fila). Después, `updateMany({ where: { id, estado: 'pendiente' }, data: { estado: 'aplicada', resueltaPor, resueltaEn: reloj.ahora() } })`; si `count === 0`, otro pedido ganó y se devuelve igual. Comentario `ponytail:`: la escritura de configuración y la marca no son una sola transacción porque cada caso de uso abre la suya; el doble aplicar lo frena el estado más la unicidad del caso de uso (nombre de espacio). Conversión de horario `'HH:MM'` → minutos con `minutosDesdeHora`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(documentos): aplicar o descartar una sugerencia de configuración con un clic (RN-14)`

### Task 9: Pantalla de sugerencias

**Files:**
- Create: `src/app/(panel)/consorcios/[consorcio]/documentos/[id]/sugerencias.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/documentos/[id]/page.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/documentos/page.tsx` (columna del administrador)
- Modify: `src/app/(panel)/comunicacion/acciones.ts`
- Modify: `src/app/aviso-en-url.ts`
- Modify: `docs/entrega-final/16-manual-usuario.md` (documentación y espacios comunes)
- Test: `pruebas/e2e/comunicacion.spec.ts`, `pruebas/e2e/servicios.a11y.spec.ts`

**Interfaces:**
- Consumes: `listarSugerencias`, `aplicarSugerencia`, `descartarSugerencia` (Task 8); `buscarConfiguracion`, `TIPOS_ANALIZABLES` (Task 7).
- Produces: acciones `accionAplicarSugerencia`, `accionDescartarSugerencia`, `accionBuscarConfiguracion` (`FormData`: `consorcio`, `documento`, `sugerencia`), todas con redirect a la página del documento. `HECHO`: `'sugerencia-aplicada': 'Configuración aplicada.'`, `'sugerencia-aplicada-con-cancelaciones': 'Configuración aplicada. Las reservas que quedaron fuera del nuevo horario se cancelaron y se avisó a quienes las hicieron.'`, `'sugerencia-descartada': 'Sugerencia descartada.'`, `'analisis-encolado': 'Estamos leyendo el documento. Las sugerencias aparecen acá en un momento.'`. Los errores del caso de uso salen por `conError`.

- [ ] **Step 1: Write the failing e2e** (`FLAY_ASISTENCIA=determinista`): el administrador sube el reglamento de prueba (PDF del fixture) → en la página del documento aparece «Configuración que menciona este documento» con la tarjeta «Nuevo espacio: SUM», la tabla actual → propuesto y la cita en un `blockquote`. Aplicar → «Configuración aplicada.» y en Espacios está «SUM» con «de 10:00 a 23:00». Descartar otra → pasa a la historia plegada. En el listado, la fila muestra «N sugerencias». En teléfono 390×844 las tarjetas no desplazan a lo ancho. El consorcista no ve la sección. Para drenar la cola, usar el disparo que ya usan las e2e de indexación.
- [ ] **Step 2: Run** `npx playwright test pruebas/e2e/comunicacion.spec.ts -g sugerencias` → FAIL.
- [ ] **Step 3: Implement.** Sección solo para administrador y tipos analizables. Una tarjeta por sugerencia pendiente: `h3` con el `titulo`, tabla de tres columnas (Qué / Ahora / Propuesto) y `<blockquote>` con la cita. Si `aplicable`: con `reservasAfectadas > 0`, el aviso «Aplicar cancela N reservas confirmadas.» y **Aplicar** dentro de un `BotonModal` `boton--peligro` que confirma; si no, un `<form>` con botón primario. Siempre **Descartar** (terciario). Las resueltas van en un `<details>` «Ya revisadas (N)», con su estado y fecha. Botón «Buscar configuración» (fantasma) en la cabecera del documento si está `indexado`. Mientras haya un `sugerir_configuracion` en cola para ese documento, `EnVivo` sondea (decisión 21); el caso de uso de la página expone `analizando: boolean`. En el listado, «N sugerencias» enlaza a `…/documentos/<id>#sugerencias`.
- [ ] **Step 4: Run** la e2e en escritorio y teléfono y `npm run test:a11y` → PASS.
- [ ] **Step 5: Manual de usuario:** párrafo en Documentación (qué se sugiere, que nada se aplica sin el clic, el botón para documentos viejos) y en Espacios comunes (horario, medianoche, deuda).
- [ ] **Step 6: Commit** `feat(documentos): pantalla de sugerencias de configuración (RF-19, RN-14)`

### Task 10: Cierre

- [ ] `CLAUDE.md`: nota nueva en «Lo que no se adivina» con lo no obvio: horario en minutos y madrugada en la ventana del día anterior; sugerencias que se aplican por los casos de uso existentes y no son atómicas con la marca; solo cuatro tipos de documento se analizan; la quinta cola `sugerir_configuracion` en la decisión 18.
- [ ] `prettier --write .`, `npm run verificar`, `npm run docs:versiones` y `npm audit --omit=dev --audit-level=high` → verdes.
- [ ] PR `feat/configuracion-desde-documentos` → `main` con capturas en teléfono de la tarjeta de sugerencia y del formulario del espacio.
