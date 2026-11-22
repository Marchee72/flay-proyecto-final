# Importación del padrón y de los ocupantes — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cargar el padrón (con dueños opcionales) y los ocupantes de un consorcio desde un Excel o CSV con plantilla descargable, validado al completo antes de escribir, y dar acceso después desde «Registrados sin acceso».

**Architecture:** Infraestructura lee el archivo (ExcelJS / CSV propio) y lo entrega como **cadenas** (`PlanillaLeida`); el dominio valida con funciones puras que devuelven errores por fila; la aplicación autoriza, arma el contexto desde la base, valida y —solo con `confirmar`— escribe en una transacción por lote. Presentación: un componente `Importador` compartido por Unidades y Usuarios.

**Tech Stack:** Next.js (App Router, server actions), Prisma + PostgreSQL, ExcelJS, Vitest (proyectos `dominio` e `integracion`), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-22-importacion-padron-y-ocupantes-design.md`

## Global Constraints

- Mensajes de commit en español con código de requerimiento: `RF-02` (padrón), `RF-03` (ocupantes, invitar). Terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Coeficiente: **nunca** pasa por `number`; se lee el texto de la celda, ≤ 8 decimales, > 0, **nunca se redondea**; suma exacta `100.00000000` (`exigirSumaExacta` / `sumarCoeficientes` de `src/dominio/coeficientes/suma.ts`).
- Archivo: `.xlsx` o `.csv`; máximo **500 KB** (`MAX_BYTES = 500 * 1024`), máximo **2000** filas de datos (`MAX_FILAS = 2000`), al menos una. No se toca `bodySizeLimit`.
- Todo o nada: una transacción por importación, por lote (`createMany` / `unnest`), `timeout: 20_000`.
- Importar **no** crea `Usuario`, **no** da habilitación, **no** encola correo, **no** llama a `sincronizarHabilitacion`.
- Ningún mensaje revela nombre, consorcio ni datos de una persona existente.
- Solo `administrador` (vía `conAutorizacion`). Controles de escritura ocultos con `!activo.archivadoEn`.
- Presentación no importa infraestructura (§ 12.1.2); la composición va en `src/aplicacion/dependencias.ts` si hace falta.
- Toasts por `conHecho` con claves nuevas en `HECHO` (`src/app/aviso-en-url.ts`); error del envío uno solo al pie con `role="alert"`.
- RNF-01 (teléfono 390×844, `--toque` 44 px) y axe A/AA.
- Antes de pushear: `prettier --write .`, `npm run verificar`, `npm run docs:versiones`, `npm audit --omit=dev --audit-level=high`.

## Review Focus

1. **El campo de archivo se vacía entre «Revisar» y «Confirmar».** React 19 resetea los campos no controlados de un `<form action>` al terminar la acción: el usuario tendría que volver a elegir el archivo. Se espera que el archivo siga elegido → Task 7 envía con `onSubmit` + `startTransition` y guarda el `File` en estado; la e2e de Task 7 confirma sin volver a elegir.
2. **Celda de coeficiente numérica** (pegado sin formato): `1.04166667` como número debe aceptarse tal cual; `0.1+0.2`-tipo o 9+ decimales debe rechazarse con fila → Task 2 (lector) y Task 3 (validador).
3. **CSV guardado por Excel en español** (Windows-1252, `;`, decimal con coma): «Designación» debe reconocerse → Task 2.
4. **El archivo cambió entre revisar y confirmar** (otro admin cargó el padrón, o se cargó un inquilino que ahora se superpone): la confirmación revalida y devuelve errores sin escribir → Tasks 4 y 5.
5. **El mismo archivo de ocupantes subido dos veces** no duplica nada → Task 5.

---

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `src/dominio/importacion/planilla.ts` | Tipos comunes, columnas por encabezado, límites, fila de ejemplo |
| `src/dominio/importacion/celdas.ts` | Coeficiente, fecha, DNI, nombre normalizado |
| `src/dominio/importacion/personas.ts` | Leer persona de una fila; resolver identidad en archivo y contra la base |
| `src/dominio/importacion/padron.ts` | `validarPadron` |
| `src/dominio/importacion/ocupantes.ts` | `validarOcupantes` |
| `src/compartido/csv.ts` | + `filasDeCsv` (lector) |
| `src/infraestructura/planillas/leer-planilla.ts` | Bytes → `PlanillaLeida` |
| `src/infraestructura/planillas/plantillas.ts` | Plantillas `.xlsx` |
| `src/infraestructura/repositorios/ocupaciones.ts` | + `registrarOcupaciones`, `ocupacionesDeUnidades` |
| `src/infraestructura/repositorios/personas.ts` | `personasConocidas` |
| `src/aplicacion/importacion/importar-padron.ts` | Caso de uso padrón |
| `src/aplicacion/importacion/importar-ocupantes.ts` | Caso de uso ocupantes |
| `src/aplicacion/importacion/plantilla.ts` | Autoriza y arma la plantilla |
| `src/aplicacion/identidad/registrados.ts` | Lista e invitación de registrados sin acceso |
| `src/aplicacion/consorcios/unidades.ts` | `cargarPadron` extrae `escribirPadron` |
| `src/app/api/plantillas/[consorcio]/[tipo]/route.ts` | Descarga de plantillas |
| `src/app/(panel)/consorcios/importador.tsx` | Componente cliente compartido |
| `src/app/(panel)/consorcios/[consorcio]/unidades/*` | Importar padrón |
| `src/app/(panel)/consorcios/[consorcio]/usuarios/*` | Importar ocupantes, registrados sin acceso |

---

### Task 1: ExcelJS, auditoría y § 14.1

**Files:**
- Modify: `package.json`, `package-lock.json`, `docs/entrega-final/14-codificacion.md` (§ 14.1)

- [ ] **Step 1:** `npm install exceljs@4.4.0`
- [ ] **Step 2:** `npm audit --omit=dev --audit-level=high` → Expected: exit 0. **Si falla:** desinstalar, instalar `read-excel-file` y `write-excel-file`, y seguir el plan con esas librerías en Task 2 (lectura) y Task 6 (plantilla sin desplegables). Anotar en el commit cuál quedó.
- [ ] **Step 3:** Agregar la librería y su versión exacta a la tabla del § 14.1 (propósito: «lectura de planillas y plantillas de importación, RF-02/RF-03»).
- [ ] **Step 4:** `npm run docs:versiones` → Expected: PASS.
- [ ] **Step 5:** Commit `build(padron): ExcelJS para importar planillas (RF-02, RF-03)`.

### Task 2: Planilla común, celdas y lector de archivos

**Files:**
- Create: `src/dominio/importacion/planilla.ts`, `src/dominio/importacion/celdas.ts`, `src/infraestructura/planillas/leer-planilla.ts`
- Modify: `src/compartido/csv.ts`
- Test: `pruebas/dominio/importacion/celdas.spec.ts`, `pruebas/dominio/importacion/planilla.spec.ts`, `pruebas/dominio/importacion/leer-planilla.spec.ts`

**Interfaces — Produces:**
```ts
// planilla.ts
export const MAX_BYTES = 500 * 1024
export const MAX_FILAS = 2000
export interface FilaLeida { numero: number; celdas: string[] }   // numero: fila de la planilla (encabezado = 1)
export interface PlanillaLeida { encabezados: string[]; filas: FilaLeida[] }
export interface ErrorDeFila { fila: number | null; columna?: string; mensaje: string }
export type Validacion<T> = { ok: true; valor: T } | { ok: false; errores: ErrorDeFila[] }
export interface Columna { clave: string; titulo: string; obligatoria: boolean }
export function normalizarTexto(s: string): string            // minúsculas, sin acentos, espacios colapsados y recortados
export function columnasDe(planilla: PlanillaLeida, esquema: readonly Columna[]):
  Validacion<{ valor: (fila: FilaLeida, clave: string) => string; filas: FilaLeida[] }>
export function esFilaDeEjemplo(fila: FilaLeida): boolean    // primera celda normalizada empieza con "ejemplo"
// celdas.ts
export function leerCoeficiente(texto: string): { valor: string } | { error: string }   // valor con punto, sin ceros de más no
export function leerFecha(texto: string): { valor: string } | { error: string }         // 'AAAA-MM-DD'
export function leerDni(texto: string): { valor: string } | { error: string }
// csv.ts
export function filasDeCsv(texto: string): string[][]
// leer-planilla.ts
export class ArchivoNoValido extends ErrorDeAplicacion {}   // código 'RF-02'
export async function leerPlanilla(bytes: Uint8Array, nombreArchivo: string): Promise<PlanillaLeida>
```

- [ ] **Step 1: Tests de celdas**

```ts
test('coeficiente acepta coma o punto y hasta 8 decimales', () => {
  expect(leerCoeficiente('1,04166667')).toEqual({ valor: '1.04166667' })
  expect(leerCoeficiente(' 8.5 ')).toEqual({ valor: '8.5' })
})
test('coeficiente rechaza sin redondear', () => {
  expect(leerCoeficiente('1.041666667')).toEqual({ error: 'El coeficiente admite hasta 8 decimales.' })
  expect(leerCoeficiente('0')).toEqual({ error: 'El coeficiente tiene que ser mayor que cero.' })
  expect(leerCoeficiente('1e-7')).toHaveProperty('error')
  expect(leerCoeficiente('')).toEqual({ error: 'Falta el coeficiente.' })
})
test('fecha en ISO o día/mes/año', () => {
  expect(leerFecha('2026-11-01')).toEqual({ valor: '2026-11-01' })
  expect(leerFecha('1/11/2026')).toEqual({ valor: '2026-11-01' })
  expect(leerFecha('31/02/2026')).toHaveProperty('error')
})
test('DNI sin puntos, 7 u 8 dígitos', () => {
  expect(leerDni('30.123.456')).toEqual({ valor: '30123456' })
  expect(leerDni('123')).toEqual({ error: 'El DNI tiene que tener 7 u 8 números.' })
})
```

- [ ] **Step 2: Tests de planilla**

```ts
test('reconoce encabezados sin acentos ni mayúsculas', () => { /* 'DESIGNACION', ' coeficiente ' → ok */ })
test('encabezado desconocido es error con su nombre', () => {
  // ['Designación','Coefciente'] → errores contiene { fila: 1, mensaje: 'La columna «Coefciente» no es de la plantilla.' }
})
test('falta obligatoria', () => { /* sin Coeficiente → 'Falta la columna «Coeficiente».' */ })
test('columna repetida es error', () => {})
test('filas vacías y de ejemplo se ignoran', () => {})
test('más de 2000 filas es error de archivo', () => { /* { fila: null, mensaje: 'El archivo tiene más de 2000 filas.' } */ })
test('sin filas de datos es error', () => { /* 'El archivo no tiene filas para cargar.' */ })
```

- [ ] **Step 3: Tests del lector** (archivos armados en el test con ExcelJS y con `TextEncoder`/bytes Windows-1252)

```ts
test('xlsx: celda de texto se lee tal cual', ...)               // '1,04166667'
test('xlsx: celda numérica se lee por su representación más corta', ...)  // 1.04166667 → '1.04166667'
test('xlsx: celda fecha → AAAA-MM-DD por componentes UTC', ...)  // new Date(Date.UTC(2026,10,1)) → '2026-11-01'
test('xlsx: celda fórmula se lee por su resultado', ...)
test('csv con ; y BOM', ...)
test('csv con , y comillas con separador adentro', ...)
test('csv en Windows-1252: «Designación» se reconoce', ...)       // bytes 0xF3 para ó
test('extensión no admitida → ArchivoNoValido «Subí un archivo .xlsx o .csv.»', ...)
test('más de 500 KB → ArchivoNoValido «El archivo pesa más de 500 KB.»', ...)
test('xlsx corrupto → ArchivoNoValido «No pudimos leer el archivo. ¿Es un Excel válido?»', ...)
```

- [ ] **Step 4:** `npx vitest run --project dominio pruebas/dominio/importacion` → FAIL (no existen).
- [ ] **Step 5: Implementar.** `leerPlanilla`: primera hoja; celdas numéricas con `String(n)`; fechas por `getUTCFullYear/Month/Date`; fórmulas por `result`; texto enriquecido unido. CSV: `TextDecoder('utf-8', { fatal: true })` y, si lanza, `TextDecoder('windows-1252')`; quitar BOM; separador = el que aparezca primero fuera de comillas en la primera línea entre `;` y `,`.
- [ ] **Step 6:** Mismo comando → PASS.
- [ ] **Step 7:** Commit `feat(padron): lectura de planillas Excel y CSV a cadenas (RF-02)`.

### Task 3: Personas y validación del padrón

**Files:**
- Create: `src/dominio/importacion/personas.ts`, `src/dominio/importacion/padron.ts`
- Test: `pruebas/dominio/importacion/personas.spec.ts`, `pruebas/dominio/importacion/padron.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`PlanillaLeida`, `columnasDe`, `leerCoeficiente`, `leerDni`, `normalizarTexto`), `errorDeCorreo` (`src/dominio/identidad/correo.ts`), `TIPOS_UNIDAD`, `sumarCoeficientes`.
- Produces:
```ts
// personas.ts
export const COLUMNAS_PERSONA: readonly Columna[]   // nombre, apellido, dni, correo, telefono (no obligatorias)
export interface PersonaDelArchivo { nombre: string; apellido: string; dni: string | null; correo: string | null; telefono: string | null }
export interface PersonaConocida { id: string; nombre: string; apellido: string; dni: string | null; correo: string | null }
export type PersonaResuelta = { existente: string } | { nueva: number }   // id de Persona | índice en `nuevas`
export function identificadoresDePersonas(planilla: PlanillaLeida): { correos: string[]; dnis: string[] }
export function resolverPersonas(
  filas: readonly { fila: number; persona: PersonaDelArchivo }[],
  conocidas: readonly PersonaConocida[],
): Validacion<{ nuevas: PersonaDelArchivo[]; porFila: Map<number, PersonaResuelta>; sinIdentificar: number }>
// padron.ts
export const COLUMNAS_PADRON: readonly Columna[]    // designacion*, tipo, coeficiente*, + COLUMNAS_PERSONA
export interface UnidadDelArchivo { fila: number; designacion: string; tipo: TipoUnidad; coeficiente: string; persona: PersonaDelArchivo | null }
export interface ResumenPadron { unidades: number; suma: string; duenos: number; sinIdentificar: number }
export interface PadronValido { unidades: UnidadDelArchivo[]; nuevas: PersonaDelArchivo[]; duenoPorFila: Map<number, PersonaResuelta>; resumen: ResumenPadron }
export function validarPadron(planilla: PlanillaLeida, contexto: { unidadesExistentes: number; archivado: boolean; personasConocidas: readonly PersonaConocida[] }): Validacion<PadronValido>
```

- [ ] **Step 1: Tests de personas**

```ts
test('una persona con datos parciales exige nombre y apellido', ...)   // 'Fila 3: falta el nombre del dueño.' (columna 'Nombre')
test('correo inválido usa el mensaje de errorDeCorreo', ...)
test('mismo correo en dos filas = misma persona (una sola nueva)', ...)
test('mismo DNI con otro nombre en el archivo es error en la segunda fila', ...)
test('correo de una y DNI de otra es error', ...)
test('conocida por DNI con mismo nombre normalizado se reutiliza', ...)   // 'José  PÉREZ' vs 'jose perez'
test('conocida por DNI con otro nombre es error y no revela el nombre guardado', () => {
  // mensaje === 'El DNI ya está registrado a nombre de otra persona; revisalo.'
  // y no contiene el nombre de la conocida
})
test('conocida por correo con otro nombre: «El correo ya está registrado a nombre de otra persona; revisalo.»', ...)
test('sin correo ni DNI: nueva cada vez y cuenta en sinIdentificar', ...)
```

- [ ] **Step 2: Tests del padrón**

```ts
test('padrón válido de 3 unidades con suma 100 y un dueño', ...)  // resumen { unidades: 3, suma: '100.00000000', duenos: 1, sinIdentificar: 0 }
test('consorcio con unidades: «Este consorcio ya tiene unidades cargadas. Para cambiar alguna, usá «Editar padrón».»', ...)
test('consorcio archivado es error de archivo', ...)
test('designación repetida ignorando mayúsculas y espacios', ...)  // '1A' y ' 1 a' → error en la segunda
test('tipo fuera del vocabulario', ...)   // 'Fila 4: el tipo «depto» no existe. Usá departamento, cochera, local o baulera.'
test('tipo vacío → departamento', ...)
test('suma que no cierra dice cuánto falta', ...)   // 'La suma da 99.98000000 %: faltan 0.02000000 % para llegar a 100.'
test('junta todos los errores, no corta en el primero', ...)
```

- [ ] **Step 3:** `npx vitest run --project dominio pruebas/dominio/importacion` → FAIL.
- [ ] **Step 4: Implementar.** Identidad: buscar primero por correo, después por DNI, en el archivo y en `conocidas`. Comparación de nombre: `normalizarTexto(nombre + ' ' + apellido)`. Los correos se comparan en minúsculas recortados. Los errores de suma se calculan solo si no hubo errores de coeficiente.
- [ ] **Step 5:** Mismo comando → PASS.
- [ ] **Step 6:** Commit `feat(padron): validación del padrón importado y de sus dueños (RF-02)`.

### Task 4: Importar padrón (aplicación)

**Files:**
- Create: `src/aplicacion/importacion/importar-padron.ts`, `src/infraestructura/repositorios/personas.ts`
- Modify: `src/aplicacion/consorcios/unidades.ts` (extraer `escribirPadron`), `src/infraestructura/repositorios/ocupaciones.ts`
- Test: `pruebas/integracion/importar-padron.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`leerPlanilla`, `ArchivoNoValido`), Task 3 (`validarPadron`, `identificadoresDePersonas`).
- Produces:
```ts
// unidades.ts
export async function escribirPadron(tx: Transaccion, filas: readonly { id: string; designacion: string; tipo: TipoUnidad; coeficiente: string }[], hoy: Date): Promise<void>
// personas.ts (repositorio; global, no aislado)
export async function personasConocidas(correos: readonly string[], dnis: readonly string[]): Promise<PersonaConocida[]>  // también por Usuario.correo
// ocupaciones.ts
export async function registrarOcupaciones(lista: readonly (OcupacionNueva & { id: string })[], cliente: Prisma.TransactionClient): Promise<void>  // un INSERT … SELECT FROM unnest
// importar-padron.ts
export interface FilaDeVista { fila: number; celdas: string[] }
export type ResultadoImportacion<R> =
  | { estado: 'errores'; errores: ErrorDeFila[] }
  | { estado: 'revisado'; resumen: R; columnas: string[]; vista: FilaDeVista[] }
  | { estado: 'cargado'; resumen: R }
export async function importarPadron(repositorio: RepositorioHabilitaciones, reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; bytes: Uint8Array; nombreArchivo: string; confirmar: boolean },
): Promise<ResultadoImportacion<ResumenPadron>>
```

- [ ] **Step 1: Tests de integración** (con `crearAdministradora`, `crearConsorcio`, `crearUsuario`, `habilitarEnConsorcio`, `limpiar` de `pruebas/integracion/ayudas.ts`; el xlsx se arma en el test con ExcelJS)

```ts
test('revisar no escribe nada', ...)                       // estado 'revisado'; prisma.unidad.count() === 0
test('confirmar carga unidades, historia, personas y ocupaciones de propietario desde hoy', ...)
test('dueño existente por DNI con mismo nombre se reutiliza (no se crea Persona)', ...)
test('dueño reutilizado con usuario NO recibe habilitación en este consorcio', ...)
test('con errores no escribe nada', ...)
test('confirmar con el padrón ya cargado entre revisar y confirmar → errores, sin escribir', ...)
test('consorcista no puede importar (NoEncontrado/RolInsuficiente como hoy)', ...)
test('96 unidades con dueño entran en una transacción', ...)   // no supera el timeout
```

- [ ] **Step 2:** `npx vitest run --project integracion pruebas/integracion/importar-padron.spec.ts` → FAIL.
- [ ] **Step 3: Implementar.** `cargarPadron` pasa a usar `escribirPadron` (sin cambio de comportamiento: sus pruebas existentes deben seguir verdes). `importarPadron`: `conAutorizacion` con `rolesPermitidos: ['administrador']`, `accion: 'importar el padrón'`; `ArchivoNoValido` → `{ estado: 'errores', errores: [{ fila: null, mensaje }] }`; contexto = `prisma.unidad.count()`, `archivadoEn` del consorcio, `personasConocidas(...)`; sin `confirmar` devuelve `revisado` con la vista (designación, tipo, coeficiente, dueño); con `confirmar` escribe en `prisma.$transaction(..., { timeout: 20_000 })`: `escribirPadron`, `tx.persona.createMany` (ids en memoria, DNI normalizado en `documento`), `registrarOcupaciones` tipo `propietario`, `desde: reloj.hoy()`, `hasta: null`. Unicidad de `Persona` violada por carrera → traducir a error de archivo «Otra carga usó el mismo correo o DNI recién; volvé a revisar el archivo.».
- [ ] **Step 4:** Mismo comando + `npx vitest run --project integracion pruebas/integracion` de padrón existente → PASS.
- [ ] **Step 5:** Commit `feat(padron): importar el padrón con sus dueños en una transacción (RF-02)`.

### Task 5: Validar e importar ocupantes

**Files:**
- Create: `src/dominio/importacion/ocupantes.ts`, `src/aplicacion/importacion/importar-ocupantes.ts`
- Modify: `src/infraestructura/repositorios/ocupaciones.ts`
- Test: `pruebas/dominio/importacion/ocupantes.spec.ts`, `pruebas/integracion/importar-ocupantes.spec.ts`

**Interfaces:**
- Consumes: Tasks 2–4 (`resolverPersonas`, `registrarOcupaciones`, `personasConocidas`, `ResultadoImportacion`).
- Produces:
```ts
// ocupantes.ts
export const COLUMNAS_OCUPANTES: readonly Columna[]   // unidad*, vinculo*, nombre*, apellido*, dni, correo, telefono, desde, hasta
export interface OcupacionExistente { unidadId: string; personaId: string; tipo: TipoDeOcupacion; desde: string; hasta: string | null }  // fechas 'AAAA-MM-DD', hasta inclusivo
export interface OcupanteDelArchivo { fila: number; unidadId: string; vinculo: TipoDeOcupacion; desde: string; hasta: string | null; persona: PersonaDelArchivo }
export interface ResumenOcupantes { propietarios: number; inquilinos: number; yaEstaban: number; sinIdentificar: number }
export interface OcupantesValidos { aCrear: OcupanteDelArchivo[]; yaEstaban: number[]; nuevas: PersonaDelArchivo[]; porFila: Map<number, PersonaResuelta>; resumen: ResumenOcupantes }
export function validarOcupantes(planilla: PlanillaLeida, contexto: {
  hoy: string; archivado: boolean; unidades: readonly { id: string; designacion: string }[];
  ocupaciones: readonly OcupacionExistente[]; personasConocidas: readonly PersonaConocida[] }): Validacion<OcupantesValidos>
// ocupaciones.ts
export async function ocupacionesDeUnidades(unidadIds: readonly string[]): Promise<OcupacionExistente[]>  // todas, pasadas y futuras; ids de consulta aislada
// importar-ocupantes.ts
export async function importarOcupantes(repositorio, reloj, datos: { usuarioId; consorcioId; bytes; nombreArchivo; confirmar }): Promise<ResultadoImportacion<ResumenOcupantes>>
```

- [ ] **Step 1: Tests de dominio**

```ts
test('unidad por designación normalizada', ...)                    // '1 a' encuentra '1A'
test('unidad inexistente o dada de baja', ...)   // 'Fila 5: no hay ninguna unidad «9Z» en este consorcio.'
test('vínculo fuera del vocabulario', ...)       // 'Usá propietario o inquilino.'
test('desde vacío = hoy; hasta < desde es error', ...)
test('dos inquilinos superpuestos en el archivo: error en la segunda fila', ...)
test('inquilino superpuesto con uno de la base: error', ...)
test('dos propietarios en la misma unidad es válido', ...)
test('misma persona, unidad y vínculo solapado con uno existente → yaEstaban', ...)
test('inquilino de la base que es la misma persona solapada → yaEstaban, no error RN-09', ...)
test('padrón vacío: «Primero cargá el padrón.»', ...)
```

- [ ] **Step 2: Tests de integración**

```ts
test('confirmar crea personas y ocupaciones con sus fechas', ...)
test('subir el mismo archivo dos veces no duplica (segunda: yaEstaban = todas)', ...)
test('no da habilitación ni encola invitación', ...)         // trabajoPendiente sin 'invitacion'
test('inquilino cargado entre revisar y confirmar → errores, sin escribir', ...)
test('unidad de otro consorcio no se encuentra (aislamiento)', ...)
```

- [ ] **Step 3:** `npx vitest run --project dominio pruebas/dominio/importacion/ocupantes.spec.ts` y `npx vitest run --project integracion pruebas/integracion/importar-ocupantes.spec.ts` → FAIL.
- [ ] **Step 4: Implementar.** Solapamiento con rangos inclusivos `[desde, hasta ?? '9999-12-31']`. Unidades desde `prisma.unidad.findMany({ where: { bajaDesde: null } })` (aislada; nota 23). Fechas a `Date` como `new Date(\`${s}T00:00:00.000Z\`)` (mismo formato que `reloj.hoy()`). Exclusión de la base → `comoInquilinoSuperpuesto` → error de archivo.
- [ ] **Step 5:** Mismos comandos → PASS.
- [ ] **Step 6:** Commit `feat(ocupaciones): importar propietarios e inquilinos desde planilla (RF-03)`.

### Task 6: Plantillas descargables

**Files:**
- Create: `src/infraestructura/planillas/plantillas.ts`, `src/aplicacion/importacion/plantilla.ts`, `src/app/api/plantillas/[consorcio]/[tipo]/route.ts`
- Test: `pruebas/dominio/importacion/plantillas.spec.ts`, `pruebas/integracion/plantilla.spec.ts`

**Interfaces:**
- Consumes: `COLUMNAS_PADRON`, `COLUMNAS_OCUPANTES`, `leerPlanilla`, `validarPadron`.
- Produces:
```ts
export async function plantillaPadron(): Promise<Uint8Array>
export async function plantillaOcupantes(designaciones: readonly string[]): Promise<Uint8Array>
export async function plantillaPara(repositorio, reloj, datos: { usuarioId: string; consorcioId: string; tipo: 'padron' | 'ocupantes' }): Promise<{ nombre: string; bytes: Uint8Array }>
// GET /api/plantillas/{consorcio}/{padron|ocupantes}.xlsx — 401 sin sesión, 404 sin acceso o tipo desconocido
```

- [ ] **Step 1: Tests**

```ts
test('plantilla de padrón: encabezados = títulos de COLUMNAS_PADRON en orden', ...)  // leída con leerPlanilla
test('plantilla de padrón: la fila de ejemplo se ignora al validar', ...)
test('plantilla de padrón: columna Coeficiente con formato texto (numFmt "@")', ...)
test('plantilla de padrón: hoja «Instrucciones» existe', ...)
test('plantilla de ocupantes: desplegable de Unidad con las designaciones vigentes', ...)  // dataValidation list
test('ruta: consorcista recibe 404; administrador recibe xlsx con content-disposition', ...)
```

- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3: Implementar.** Desplegables: Tipo, Vínculo y Unidad como `dataValidation` de tipo lista; las designaciones en una hoja oculta «Listas» (una lista inline tiene tope de 255 caracteres). Fila de ejemplo con primera celda `Ejemplo — borrar esta fila`. Hoja «Instrucciones» con las reglas del spec (§ Formato y § Validaciones) en castellano llano. Ruta con el patrón de `src/app/api/exportar/[consorcio]/[tabla]/route.ts`; `content-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `cache-control: no-store`.
- [ ] **Step 4:** Correr → PASS.
- [ ] **Step 5:** Commit `feat(padron): plantillas de padrón y ocupantes para descargar (RF-02, RF-03)`.

### Task 7: Pantallas de importación

**Files:**
- Create: `src/app/(panel)/consorcios/importador.tsx`
- Modify: `src/app/(panel)/consorcios/acciones.ts` (+ `accionImportarPadron`), `src/app/(panel)/consorcios/[consorcio]/unidades/page.tsx`, `src/app/(panel)/consorcios/[consorcio]/usuarios/acciones.ts` (+ `accionImportarOcupantes`), `src/app/(panel)/consorcios/[consorcio]/usuarios/page.tsx`, `src/app/aviso-en-url.ts` (claves `padronImportado`, `ocupantesImportados`)
- Test: `pruebas/e2e/importacion.spec.ts`

**Interfaces:**
- Consumes: `importarPadron`, `importarOcupantes`, `ResultadoImportacion`.
- Produces:
```ts
export type EstadoImportacion = { mensaje: string; resultado?: ResultadoImportacion<unknown> }
export function Importador(props: {
  accion: (previo: EstadoImportacion, datos: FormData) => Promise<EstadoImportacion>
  consorcioId: string; plantillaHref: string; titulo: string; textoConfirmar: (resumen: unknown) => string
}): JSX.Element
```

- [ ] **Step 1: E2E** (escritorio y teléfono)

```ts
test('bajar la plantilla de padrón, completarla, revisar y confirmar sin volver a elegir el archivo', ...)
// → toast de padronImportado; la tabla de unidades muestra las designaciones
test('archivo con errores muestra «Fila N: …» y no carga', ...)
test('importar ocupantes desde Usuarios y verlos en «Registrados sin acceso»', ...)  // usa Task 8; si Task 8 no está, verificar en Ocupantes
test('consorcio archivado no muestra los botones de importar', ...)
```

- [ ] **Step 2:** `npm run build && npx playwright test pruebas/e2e/importacion.spec.ts` (con `CI=1`, nota 34) → FAIL.
- [ ] **Step 3: Implementar.** `Importador` guarda el `File` en estado y envía con `onSubmit` → `event.preventDefault()` → `startTransition(() => accion(formData))` armando el `FormData` a mano (archivo + `consorcio` + `confirmar`), para que React no resetee el campo. Revisar → muestra errores (lista bajo un único `role="alert"`; tope 50 visibles + «y N más») o resumen + tabla de vista (`TablaDesplazable`) con botón primario de confirmar. Las acciones leen `datos.get('archivo') as File`, pasan `new Uint8Array(await archivo.arrayBuffer())` y, con `estado: 'cargado'`, `redirect(conHecho(ruta, clave))`. Textos de `HECHO`: `padronImportado: 'Padrón importado.'`, `ocupantesImportados: 'Ocupantes importados.'`. Unidades: el importador se muestra sobre el cargador solo si no hay unidades. Usuarios: botón «Importar ocupantes» junto a «Invitar persona» solo con padrón cargado.
- [ ] **Step 4:** Mismo comando → PASS; `npm run test:a11y` → PASS.
- [ ] **Step 5:** Commit `feat(padron): importar padrón y ocupantes desde la pantalla (RF-02, RF-03)`.

### Task 8: Registrados sin acceso e invitar

**Files:**
- Create: `src/aplicacion/identidad/registrados.ts`, `src/app/(panel)/consorcios/[consorcio]/usuarios/registrados.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/usuarios/acciones.ts`, `.../usuarios/page.tsx`, `src/app/aviso-en-url.ts` (claves `registradoInvitado`, `registradosInvitados`)
- Test: `pruebas/integracion/registrados.spec.ts`, `pruebas/e2e/importacion.spec.ts` (caso de invitar)

**Interfaces:**
- Consumes: `asegurarCuenta`, `encolarInvitacion` (`src/aplicacion/identidad/invitar-persona.ts`), `sincronizarHabilitacion` (`registrar-ocupacion.ts`), `ocupacionesVigentesDe`, `errorDeCorreo`.
- Produces:
```ts
export interface Registrado { personaId: string; nombre: string; dni: string | null; correo: string | null; unidades: { designacion: string; tipo: TipoDeOcupacion }[]; tieneUsuario: boolean }
export async function registradosSinAcceso(repositorio, reloj, datos: { usuarioId: string; consorcioId: string }): Promise<Registrado[]>
export async function invitarRegistrado(repositorio, reloj, datos: { usuarioId; consorcioId; consorcioNombre; urlBase; personaId: string; correo?: string }): Promise<void>
export async function invitarRegistrados(repositorio, reloj, datos: { usuarioId; consorcioId; consorcioNombre; urlBase }): Promise<{ invitados: number; quedan: number }>
export class CorreoEnUso extends ErrorDeAplicacion {}   // 'Ese correo ya pertenece a otra persona registrada.'  código 'RF-03'
```

- [ ] **Step 1: Tests de integración**

```ts
test('lista a quien ocupa una unidad vigente y no tiene habilitación vigente acá', ...)
test('incluye a quien tiene usuario en otro consorcio (tieneUsuario: true)', ...)
test('no incluye a quien ya tiene habilitación vigente acá', ...)
test('invitar sin usuario: crea usuario invitado, habilitación consorcista y encola invitación', ...)
test('invitar con usuario: solo habilitación, sin correo', ...)
test('invitar sin correo exige correo; lo guarda en la Persona', ...)
test('correo de otra Persona o de otro Usuario → CorreoEnUso, sin decir de quién', ...)
test('invitar a todos: invita solo a los que tienen correo y es reanudable', ...)   // segunda llamada: invitados 0
test('persona de otro consorcio no se puede invitar desde este (NoEncontrado)', ...)
```

- [ ] **Step 2:** `npx vitest run --project integracion pruebas/integracion/registrados.spec.ts` → FAIL.
- [ ] **Step 3: Implementar.** Lista: unidades aisladas (`bajaDesde: null`) → `ocupacionesVigentesDe(ids, hoy)` → personas; habilitaciones vigentes con `prisma.habilitacion` (aislada, como `listarUsuarios`); excluir las que tienen. `invitarRegistrado`: verificar que la persona esté en esa lista (si no, `NoEncontrado`); una transacción por persona: guardar correo si vino, `asegurarCuenta`, `sincronizarHabilitacion`; fuera de la transacción `encolarInvitacion` si hay credencial nueva. `invitarRegistrados`: recorre los que tienen correo, uno por transacción, y corta a los 20 s devolviendo cuántos quedan (mismo tope que la generación de documentos, nota 14). Pantalla: sección «Registrados sin acceso» bajo la tabla de usuarios, con «Invitar» (modal que pide correo si falta) e «Invitar a todos los que tienen correo»; con `quedan === 0` → `conHecho(ruta, 'registradosInvitados')` (texto `'Invitaciones en cola.'`); con `quedan > 0` → `conError(ruta, \`Invitamos a ${invitados}; quedan ${quedan}: volvé a apretar para seguir.\`)`. `registradoInvitado`: `'Invitación en cola.'`.
- [ ] **Step 4:** Mismo comando + e2e del caso → PASS.
- [ ] **Step 5:** Commit `feat(usuarios): registrados sin acceso e invitación en lote (RF-03)`.

### Task 9: Documentación y gate

**Files:**
- Modify: `docs/entrega-final/16-manual-usuario.md` (sección del administrador: importar padrón, importar ocupantes, invitar registrados), `docs/entrega-final/14-codificacion.md` si hace falta, `docs/README.md`/`README.md` solo si cambia el estado de un documento.

- [ ] **Step 1:** Escribir las tres subsecciones del manual, citando RF-02/RF-03.
- [ ] **Step 2:** `prettier --write .`
- [ ] **Step 3:** `npm run verificar` → Expected: todo verde.
- [ ] **Step 4:** `npm run test:a11y && npm run docs:versiones && npm audit --omit=dev --audit-level=high` → Expected: verde.
- [ ] **Step 5:** Commit `docs(padron): manual de importación de padrón y ocupantes (RF-02, RF-03)`.
