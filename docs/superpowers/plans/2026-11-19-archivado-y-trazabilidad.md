# Archivado y trazabilidad — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que espacios comunes, documentos y consorcios con historia se archiven (y se restauren) en
vez de borrarse, que lo cargado por error se borre definitivamente, y que un consorcio archivado
quede en solo lectura garantizada por la base.

**Architecture:** Columna `archivado_en` en las tres tablas. Un disparador
`fn_consorcio_no_archivado()` en toda tabla con `consorcio_id` (salvo cuatro excepciones) rechaza las
escrituras de un consorcio archivado con `FLAY: …`; la aplicación lo traduce a `ConsorcioArchivado` en
`conAutorizacion`, en `traducirErrorDeBase` y en la cola. Las lecturas filtran `archivadoEn: null` a
mano, como `bajaDesde` (nota 23 de `CLAUDE.md`).

**Tech Stack:** Next.js 15, Prisma, PostgreSQL 18 (PL/pgSQL), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-archivado-y-trazabilidad-design.md` (RN-22 ya está en
`docs/entrega-3/07-analisis-de-datos.md`).

## Global Constraints

- Rama `feat/archivado`. Commits en español con códigos: `RF-15`, `RF-19`, `RN-22`, `RN-15`.
- Puerta: `npm run verificar`; antes de pushear, `npx prettier --write .`.
- Migración versionada nueva: `prisma/migrations/20261119120000_archivado/migration.sql`. Ningún cambio manual.
- Mensaje del disparador, literal: `FLAY: Este consorcio está archivado: se puede consultar, pero no operar.`
- Excepciones del candado, exactas: `Habilitacion`, `Notificacion`, `ConsultaDocumental`, `ConversacionAsistente`. `Consorcio` no lleva candado.
- «Nada» para borrar definitivamente:
  - espacio: cero `Reserva` en cualquier estado;
  - consorcio: cero `Periodo`, `Gasto`, `Liquidacion`, `Pago`, `Reclamo`, `Reserva`, `Asamblea`, `DocumentoConsorcio`, `Novedad`.
- Un documento **siempre** se archiva; el objeto del almacén **nunca** se borra.
- Archivar consorcio:
  - **bloquea** con un `IntentoDePago` en `iniciado` o `rechazado` y `venceEn + 72 h > ahora`;
  - **bloquea** con una `Asamblea` en `convocada` o `en_curso`;
  - **cancela con aviso** las reservas futuras confirmadas.
- Archivar, borrar y restaurar consorcio: `conAutorizacionDeAdministradora`. Espacios y documentos: `rolesPermitidos: ['administrador']`.
- Presentación no importa infraestructura (§ 12.1.2). Errores con texto legible (RNF-10). Teléfono 390×844 (RNF-01). Toasts vía `conHecho`/`conError` (nota 24).

## Review Focus

1. **Pago en línea en carrera con el archivado**: un intento creado entre la verificación y el marcado. `eliminarConsorcio` toma `FOR UPDATE` sobre `Consorcio` y `iniciarPagoEnLinea` `FOR SHARE`. Prueba en Task 7.
2. **Reserva vieja de un espacio archivado** sigue mostrando el nombre del espacio en el historial y en «mis reservas». Prueba en Task 3.
3. **Consorcista que pide un documento archivado por URL directa** recibe «no encontrado». El administrador lo ve. Prueba en Task 5.
4. **Asistente sobre un consorcio archivado**: leer funciona (la conversación se guarda: excepción del candado); una escritura confirmada devuelve el mensaje de archivado y no un error crudo. Prueba en Task 2.
5. **Trabajo de cola de un consorcio archivado** (`indexar_documento`, `sugerir_configuracion`, aviso) termina `despachado` con `ultimoError` y no se reintenta cinco veces. Prueba en Task 2.

---

### Task 1: Migración — columnas, auditoría y candado

**Files:**
- Create: `prisma/migrations/20261119120000_archivado/migration.sql`
- Modify: `prisma/schema.prisma` (`Consorcio`, `EspacioComun`, `DocumentoConsorcio`)
- Test: `pruebas/integracion/archivado-base.spec.ts`

**Interfaces:**
- Produces: campo Prisma `archivadoEn DateTime? @map("archivado_en") @db.Timestamptz(6)` en los tres
  modelos. Función SQL `fn_consorcio_no_archivado()`. Disparadores `consorcio_no_archivado` (uno por
  tabla), `auditar_espacio_comun`, `auditar_documento_consorcio`.

- [ ] **Step 1: Write the failing tests** en `archivado-base.spec.ts` (usar `crearAdministradora`, `crearConsorcio`, `limpiar` de `./ayudas`):
  - `toda tabla con consorcio_id tiene el candado, salvo las excepciones`: consultar `information_schema.columns` (`column_name = 'consorcio_id'`, esquema `public`, solo tablas base) y `information_schema.triggers` (`trigger_name = 'consorcio_no_archivado'`). Esperar que el conjunto sin candado sea exactamente `['ConsultaDocumental','ConversacionAsistente','Habilitacion','Notificacion']`.
  - `rechaza escribir en un consorcio archivado`: `UPDATE "Consorcio" SET archivado_en = now()` y luego `prismaBase.proveedor.create(...)` para ese consorcio. Esperar rechazo con `/Este consorcio está archivado/`.
  - `rechaza borrar en un consorcio archivado`: crear un `EspacioComun`, archivar el consorcio y esperar que `prismaBase.espacioComun.delete` sea rechazado.
  - `una excepción sigue escribiendo`: con el consorcio archivado, `habilitarEnConsorcio` resuelve.
  - `restaurar vuelve a dejar escribir`: `archivado_en = NULL` y luego `proveedor.create` resuelve.
  - `audita el espacio y el documento`: el alta de un `EspacioComun` deja un asiento en `BitacoraAuditoria` para `entidad_tipo = 'EspacioComun'`, acotado a su id (nota 2).

- [ ] **Step 2: Run** `npx vitest run pruebas/integracion/archivado-base.spec.ts` — Expected: FAIL (no existe la columna `archivado_en`).

- [ ] **Step 3: Write the migration.**
  - `ALTER TABLE` de las tres tablas con `archivado_en TIMESTAMPTZ(6)` nulo.
  - `fn_consorcio_no_archivado()`, `BEFORE INSERT OR UPDATE OR DELETE FOR EACH ROW`. Toma `OLD.consorcio_id` si `TG_OP = 'DELETE'` y si no `NEW.consorcio_id`. Si es nulo, deja pasar. Si `EXISTS (SELECT 1 FROM "Consorcio" WHERE id = v AND archivado_en IS NOT NULL)`, hace `RAISE EXCEPTION` con el mensaje literal de Global Constraints. Devuelve `COALESCE(NEW, OLD)`.
  - Un bloque `DO` que recorre `information_schema.columns` (tablas base de `public` con `consorcio_id`, menos las cuatro excepciones) y crea `consorcio_no_archivado` en cada una.
  - Los dos `CREATE TRIGGER auditar_… AFTER INSERT OR UPDATE OR DELETE … EXECUTE FUNCTION fn_auditar()`, con el mismo formato que `20261103130000_auditar_consorcio`.
  - Sumar el campo a los tres modelos de `schema.prisma`.

- [ ] **Step 4: Run** `npm run db:deploy && npm run db:drift && npx vitest run pruebas/integracion/archivado-base.spec.ts` — Expected: PASS, sin deriva.

- [ ] **Step 5: Commit** `feat(archivado): columna archivado_en, auditoría y candado de solo lectura en la base (RN-22, RN-15)`

---

### Task 2: `ConsorcioArchivado` en la aplicación y en la cola

**Files:**
- Modify: `src/compartido/errores.ts`, `src/aplicacion/autorizacion.ts:19-48`, `src/aplicacion/asambleas/errores.ts:227`, `src/aplicacion/pendientes/drenar.ts:46-56`, `src/aplicacion/consorcios/mis-consorcios.ts`, `src/app/(panel)/con-consorcio.tsx` (`ConsorcioAlcanzable`)
- Test: `pruebas/integracion/archivado-base.spec.ts` (describe nuevo), `pruebas/integracion/pendientes.spec.ts`

**Interfaces:**
- Produces:
  - `class ConsorcioArchivado extends ErrorDeAplicacion`, con mensaje «Este consorcio está archivado: se puede consultar, pero no operar.» y código `'RN-22'`.
  - `traducirArchivado(error: unknown): unknown` en `src/compartido/errores.ts`. Devuelve `new ConsorcioArchivado()` si el texto del error (mensaje + `meta` serializado, como `textoDe`) contiene `Este consorcio está archivado`; si no, devuelve el mismo error.
  - `misConsorcios` y `ConsorcioAlcanzable` suman `archivadoEn: string | null` (ISO).

- [ ] **Step 1: Write the failing tests**
  - `una escritura por caso de uso devuelve ConsorcioArchivado`: archivar el consorcio por SQL y llamar `altaEspacio(repo, RELOJ, {...})` como administrador. `rejects.toBeInstanceOf(ConsorcioArchivado)`.
  - `leer sigue funcionando`: `listarEspacios` resuelve sobre el archivado.
  - `el asistente sobre un consorcio archivado` (Review Focus 4): con la implementación determinística de `asistente.spec.ts`, una lectura responde y una escritura confirmada termina con el texto de `ConsorcioArchivado`.
  - En `pendientes.spec.ts`, `un trabajo de un consorcio archivado no se reintenta` (Review Focus 5): un manejador que lanza el error crudo de la base deja el trabajo en `despachado` con `ultimoError` que contiene `archivado` y `intentos` sin cambiar el estado a `pendiente`.

- [ ] **Step 2: Run** esas pruebas — Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `conAutorizacion`: envolver `enConsorcio(...)` en `try/catch` que relanza `traducirArchivado(error)`.
  - `traducirErrorDeBase`: llamar primero a `traducirArchivado`; si cambió el error, devolverlo antes del regex `FLAY:`.
  - `drenar`: en el `catch`, si `traducirArchivado(error) instanceof ConsorcioArchivado`, marcar `despachado` con `ultimoError` y no contar el trabajo como fallido.
  - `misConsorcios`: sumar `archivadoEn` al `select` y mapearlo a ISO.

- [ ] **Step 4: Run** las mismas pruebas más `npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(archivado): traducir el candado a ConsorcioArchivado en casos de uso y cola (RN-22, RNF-10)`

---

### Task 3: Espacios — archivar, borrar si está vacío, restaurar

**Files:**
- Modify: `src/aplicacion/reservas/espacios.ts` (`listarEspacios`, `altaEspacio`, `editarEspacio`, `deshabilitarEspacio`, `habilitarEspacio`, `eliminarEspacio`), `src/aplicacion/reservas/reservar.ts:73`, `src/aplicacion/comunicacion/sugerencias.ts:99`
- Test: `pruebas/integracion/reservas.spec.ts` (describe `archivado de espacios (RN-22)`)

**Interfaces:**
- Produces:
  - `eliminarEspacio(repositorio, reloj, { usuarioId, consorcioId, espacioId }): Promise<'borrado' | 'archivado'>`.
  - `restaurarEspacio(repositorio, reloj, { usuarioId, consorcioId, espacioId }): Promise<void>`.
  - `listarEspaciosArchivados(repositorio, reloj, { usuarioId, consorcioId }): Promise<{ id: string; nombre: string; archivadoEn: string; reservasEnHistorial: number }[]>`.
  - `EspacioDelConsorcio` suma `reservasEnHistorial: number` (para el texto del modal).
  - `class EspacioArchivadoConEseNombre extends ErrorDeAplicacion`, con mensaje «Ya hay un espacio archivado con ese nombre. Restauralo desde Eliminados.» y código `'RF-15'`.

- [ ] **Step 1: Write the failing tests**
  - `un espacio sin reservas se borra definitivamente`: devuelve `'borrado'` y `espacioComun.findFirst` da `null`.
  - `un espacio con historia se archiva`: con una reserva cancelada vieja, devuelve `'archivado'`. La reserva sigue existiendo, `listarEspacios` no lo trae y `listarEspaciosArchivados` sí, con `reservasEnHistorial: 1`.
  - `archivar cancela y avisa las reservas futuras`: reserva confirmada futura → `estado: 'cancelada'` y una `Notificacion` para quien la pidió.
  - `el historial conserva el nombre` (Review Focus 2): `historialDeReservas` de esa unidad muestra el nombre del espacio archivado.
  - `no se reserva ni se edita un archivado`: `reservar` y `editarEspacio` sobre él lanzan `NoEncontrado`.
  - `alta homónima`: `altaEspacio` con el mismo nombre lanza `EspacioArchivadoConEseNombre`.
  - `restaurar`: vuelve a `listarEspacios`; las reservas canceladas siguen canceladas.
  - `un consorcista no restaura`: `RolInsuficiente`.

- [ ] **Step 2: Run** `npx vitest run pruebas/integracion/reservas.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Toda lectura de `espacioComun` *vigente* suma `archivadoEn: null`: `listarEspacios`, `editar`, `deshabilitar`, `habilitar`, `eliminar` y `reservar.ts:73`.
  - `eliminarEspacio`, en una transacción: si cuenta cero reservas, borra suspensiones y espacio (`'borrado'`); si no, cancela y avisa las futuras (como hoy) y escribe `archivadoEn: reloj.ahora()` (`'archivado'`).
  - `altaEspacio`: ante `P2002`, buscar el homónimo con `archivadoEn: { not: null }` y lanzar `EspacioArchivadoConEseNombre`.
  - `sugerencias.ts:99`: un espacio archivado cuenta como inactivo (nota 33).

- [ ] **Step 4: Run** `npx vitest run pruebas/integracion/reservas.spec.ts pruebas/integracion/sugerencias-configuracion.spec.ts` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(reservas): archivar el espacio con historia y borrar solo el vacío (RF-15, RN-22)`

---

### Task 4: Espacios — pantalla

**Files:**
- Modify: `src/app/(panel)/consorcios/[consorcio]/espacios/modal-eliminar.tsx`, `src/app/(panel)/consorcios/[consorcio]/espacios/page.tsx`, `src/app/(panel)/consorcios/[consorcio]/reservas/acciones.ts:165-182`, `src/app/aviso-en-url.ts` (`HECHO`)
- Test: `pruebas/e2e/espacios-archivado.spec.ts`

**Interfaces:**
- Consumes: Task 3 (`eliminarEspacio` → `'borrado' | 'archivado'`, `restaurarEspacio`, `listarEspaciosArchivados`, `reservasEnHistorial`).
- Produces: `accionRestaurarEspacio(datos: FormData): Promise<void>`. Claves `HECHO`:
  - `'espacio-eliminado'`: «Espacio eliminado definitivamente.»
  - `'espacio-archivado'`: «Espacio archivado. Lo encontrás en Eliminados.»
  - `'espacio-restaurado'`: «Espacio restaurado.»

- [ ] **Step 1: Write the failing e2e test.** Como administrador en teléfono 390×844:
  - un espacio sin reservas muestra en el modal «se va a borrar definitivamente» y desaparece;
  - uno con reservas muestra «se va a archivar», con el número de reservas, y aparece en «Eliminados (1)»;
  - «Restaurar» lo devuelve a la lista;
  - un consorcista no ve la sección *Eliminados*.
- [ ] **Step 2: Run** `npm run build && CI=1 npx playwright test pruebas/e2e/espacios-archivado.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
  - El modal elige texto y etiqueta del botón por `espacio.reservasEnHistorial`. Textos literales del spec § 5: «Este espacio no tiene reservas: se va a borrar definitivamente.» / «Tiene n reservas en su historial: se va a archivar y lo vas a encontrar en Eliminados, desde donde podés restaurarlo.»; botones «Eliminar» / «Archivar».
  - La acción redirige con la clave según el resultado.
  - `<details>` «Eliminados (n)» al pie de la página, solo administrador.
- [ ] **Step 4: Run** el mismo comando más `npm run test:a11y` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(reservas): eliminar o archivar espacios y sección Eliminados (RF-15, RN-22)`

---

### Task 5: Documentos — archivar y restaurar

**Files:**
- Modify: `src/aplicacion/comunicacion/documentos.ts` (`listarDocumentos`, `verDocumento`, `buscarConfiguracion`, `analisisDeConfiguracion`, `reindexarDocumento`, `eliminarDocumento`), `src/aplicacion/comunicacion/consultar.ts:64`, `src/infraestructura/repositorios/fragmentos.ts:77`, `src/aplicacion/comunicacion/indexar.ts:32`, `src/aplicacion/comunicacion/sugerencias.ts:366`
- Test: `pruebas/integracion/documentos.spec.ts`, `pruebas/integracion/consulta-documental.spec.ts`

**Interfaces:**
- Produces:
  - `eliminarDocumento(repositorio, reloj, { usuarioId, consorcioId, documentoId }): Promise<void>`: **sin** el parámetro `almacen`; archiva.
  - `restaurarDocumento(repositorio, reloj, { usuarioId, consorcioId, documentoId }): Promise<void>`.
  - `listarDocumentosArchivados(repositorio, reloj, { usuarioId, consorcioId }): Promise<{ id: string; titulo: string; tipo: string; archivadoEn: string }[]>`.

- [ ] **Step 1: Write the failing tests**
  - `eliminar archiva y conserva el archivo`: con el almacén en memoria, después de `eliminarDocumento` el objeto sigue existiendo, la fila tiene `archivadoEn` y `listarDocumentos` no lo trae.
  - `el administrador ve el archivado; el consorcista no` (Review Focus 3): `verDocumento` resuelve para el administrador y lanza `NoEncontrado` para un consorcista, aunque el documento sea `visibleConsorcistas`.
  - `la consulta documental no cita un archivado`: en `consulta-documental.spec.ts`, después de archivar el único documento indexado, `buscarFragmentos` no devuelve sus fragmentos.
  - `indexar o sugerir sobre un archivado no hace nada`: el manejador termina sin error y sin escribir.
  - `el acta firmada no se archiva`: sigue lanzando `DocumentoDeActa`.
  - `restaurar`: vuelve a `listarDocumentos` y a la búsqueda **sin** reindexar (los fragmentos siguen ahí).

- [ ] **Step 2: Run** `npx vitest run pruebas/integracion/documentos.spec.ts pruebas/integracion/consulta-documental.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `archivadoEn: null` en toda lectura de documento *vigente*. En `verDocumento`, solo si el acceso no incluye `administrador`.
  - En `fragmentos.ts`, `AND d.archivado_en IS NULL` dentro del `WHERE`, antes del `ORDER BY`.
  - `indexar.ts` y `sugerencias.ts:366`: si el documento está archivado, devolver sin hacer nada.
  - Quitar `almacen` de `eliminarDocumento` y de su acción.
- [ ] **Step 4: Run** el mismo comando — Expected: PASS.
- [ ] **Step 5: Commit** `feat(documentos): archivar sin borrar el archivo y excluir de la consulta (RF-19, RF-20, RN-22)`

---

### Task 6: Documentos — pantalla

**Files:**
- Modify: `src/app/(panel)/consorcios/[consorcio]/documentos/[id]/modal-eliminar.tsx`, `src/app/(panel)/consorcios/[consorcio]/documentos/page.tsx`, `src/app/(panel)/comunicacion/acciones.ts:147-160`, `src/app/aviso-en-url.ts`
- Test: `pruebas/e2e/documentos-archivado.spec.ts`

**Interfaces:**
- Consumes: Task 5.
- Produces: `accionRestaurarDocumento(datos: FormData): Promise<void>`. Claves `HECHO`:
  - `'documento-archivado'`: «Documento archivado. Lo encontrás en Eliminados.» (reemplaza a `'documento-eliminado'`);
  - `'documento-restaurado'`: «Documento restaurado.»

- [ ] **Step 1: Write the failing e2e test.**
  - El modal dice «se va a archivar»; el documento pasa a «Eliminados (1)», desde donde se abre y se restaura.
  - El consorcista no ve la sección.
- [ ] **Step 2: Run** `npm run build && CI=1 npx playwright test pruebas/e2e/documentos-archivado.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Texto del modal: «Se va a archivar: deja de mostrarse y de usarse en las consultas, pero el archivo se conserva y podés restaurarlo desde Eliminados.» Botón «Archivar».
- [ ] **Step 4: Run** el mismo comando más `npm run test:a11y` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(documentos): archivar documentos y sección Eliminados (RF-19, RN-22)`

---

### Task 7: Consorcio — eliminar o archivar, y restaurar

**Files:**
- Create: `src/aplicacion/consorcios/archivar-consorcio.ts`
- Modify: `src/aplicacion/pagos/iniciar-pago-en-linea.ts:67`
- Test: `pruebas/integracion/archivar-consorcio.spec.ts`

**Interfaces:**
- Produces, en `archivar-consorcio.ts`:
  - `type PreviaDeEliminarConsorcio = { accion: 'borrar' | 'archivar'; pagosEnCurso: number; asambleasEnCurso: number; reservasFuturas: number }`
  - `previaDeEliminarConsorcio(repositorio, reloj, { usuarioId, consorcioId }): Promise<PreviaDeEliminarConsorcio>`
  - `eliminarConsorcio(repositorio, reloj, { usuarioId, consorcioId }): Promise<'borrado' | 'archivado'>`
  - `restaurarConsorcio(repositorio, reloj, { usuarioId, consorcioId }): Promise<void>`
  - Errores, código `'RN-22'`:
    - `ConsorcioConPagosEnCurso(n)`: «Hay n pagos en línea sin confirmar; podés archivar cuando terminen.»
    - `ConsorcioConAsambleaEnCurso`: «Hay una asamblea convocada o en curso; podés archivar cuando termine.»
  - Las tres funciones resuelven el `administradoraId` del consorcio con `prismaBase` y autorizan con `conAutorizacionDeAdministradora`.

- [ ] **Step 1: Write the failing tests**
  - `un consorcio sin movimiento se borra`: con padrón, un espacio, un proveedor, tramos de vencimiento y accesos, devuelve `'borrado'` y no queda ninguna fila con su `consorcio_id`. La bitácora tiene el `BORRA` del `Consorcio`.
  - `con un gasto se archiva`: devuelve `'archivado'`; `misConsorcios` lo trae con `archivadoEn`; `registrarGasto` lanza `ConsorcioArchivado`.
  - `pago en línea abierto bloquea`: un `IntentoDePago` `iniciado` con `venceEn` en el futuro → `ConsorcioConPagosEnCurso`. Uno `vencido`, o con `venceEn` hace 73 h, no bloquea.
  - `asamblea convocada bloquea` → `ConsorcioConAsambleaEnCurso`. Una `finalizada` no bloquea.
  - `cancela reservas futuras con aviso`.
  - `carrera con un pago` (Review Focus 1): `Promise.allSettled` de `eliminarConsorcio` e `iniciarPagoEnLinea`. Nunca terminan las dos bien con el consorcio archivado *y* un intento `iniciado` nuevo.
  - `solo el nivel administradora`: un administrador de consorcio sin habilitación de administradora recibe `RolInsuficiente`.
  - `restaurar`: vuelve a aceptar `registrarGasto`.

- [ ] **Step 2: Run** `npx vitest run pruebas/integracion/archivar-consorcio.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `eliminarConsorcio`, en una transacción con `SELECT … FROM "Consorcio" WHERE id = $1 FOR UPDATE`, dentro de `enConsorcio`:
    - cuenta el movimiento;
    - si no hay, borra en orden de claves foráneas (guía: el orden de `limpiar()` en `pruebas/integracion/ayudas.ts`, restringido al consorcio). Verificar que el disparador de suma de coeficientes (RN-01) admite borrar el padrón entero; si no, borrar con el mismo mecanismo que usa `limpiar()`;
    - si hay, verifica los dos bloqueos, cancela y avisa las reservas futuras (reusar lo de Task 3) y escribe `archivadoEn`.
  - `iniciarPagoEnLinea`: `SELECT 1 FROM "Consorcio" WHERE id = $1 FOR SHARE` al abrir su transacción.
- [ ] **Step 4: Run** el mismo comando más `pruebas/integracion/pago-en-linea.spec.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(consorcios): eliminar el vacío, archivar con historia y restaurar (RN-22, CCyC 2067)`

---

### Task 8: Consorcio — pantallas y solo lectura

**Files:**
- Modify:
  - `src/app/(panel)/consorcios/page.tsx`: sección «Archivados (n)», con «Restaurar» para quien administra la administradora (`misAdministradoras` no vacío);
  - `src/app/(panel)/consorcios/acciones.ts`: `accionEliminarConsorcio`, `accionRestaurarConsorcio`;
  - `src/app/(panel)/consorcios/[consorcio]/page.tsx`: botón «Eliminar» con modal de la previa;
  - `src/app/(panel)/consorcios/[consorcio]/layout.tsx`: aviso fijo;
  - las páginas de `src/app/(panel)/consorcios/[consorcio]/**/page.tsx` que dibujan formularios de escritura;
  - `src/app/aviso-en-url.ts`.
- Test: `pruebas/e2e/consorcio-archivado.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`activo.archivadoEn`), Task 7.
- Produces: claves `HECHO`:
  - `'consorcio-eliminado'`: «Consorcio eliminado definitivamente.»
  - `'consorcio-archivado'`: «Consorcio archivado. Lo encontrás en Archivados.»
  - `'consorcio-restaurado'`: «Consorcio restaurado.»

- [ ] **Step 1: Write the failing e2e test.**
  - Un consorcio con un gasto se archiva desde su resumen.
  - La lista lo muestra en «Archivados». Entrar muestra el aviso «Este consorcio está archivado desde el dd/mm/aaaa. Podés consultar su historia, pero no operar.».
  - En Gastos y Espacios no hay botones de alta.
  - Un consorcista entra y ve sus expensas.
  - «Restaurar» lo devuelve.
  - Un consorcio con asamblea convocada muestra el bloqueo en el modal.
- [ ] **Step 2: Run** `npm run build && CI=1 npx playwright test pruebas/e2e/consorcio-archivado.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
  - El modal muestra la previa: borrar / archivar / bloqueado con el motivo, y en ese caso el botón queda deshabilitado.
  - El aviso usa `.aviso` y vive en el layout, una vez.
  - En cada página con formularios, el booleano que hoy decide mostrarlos (`administra`, etc.) se combina con `!activo.archivadoEn`. Para listarlas: `grep -rln "action={" "src/app/(panel)/consorcios/[consorcio]"`.
- [ ] **Step 4: Run** el mismo comando más `npm run test:a11y` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(consorcios): archivar desde el resumen, sección Archivados y solo lectura (RN-22, RNF-01)`

---

### Task 9: Documentación de lo construido y puerta

**Files:**
- Modify: `docs/entrega-final/15-pruebas.md`, `docs/entrega-final/16-manual-usuario.md` (eliminar/archivar/restaurar en las tres secciones; «RN-01 a RN-22» en el encabezado), `docs/entrega-final/18-seguridad.md` (tablas auditadas + candado), `CLAUDE.md` (nota 35)

- [ ] **Step 1:** Redactar `CLAUDE.md` nota 35:
  - el candado vive en la base;
  - las cuatro excepciones y por qué;
  - la prueba de `information_schema` obliga a decidir para cada tabla nueva con `consorcio_id`;
  - `traducirArchivado` en `conAutorizacion`, en `traducirErrorDeBase` y en la cola;
  - «Eliminar» decide borrar o archivar;
  - toda lectura de lo vigente filtra `archivadoEn: null`, y la historia no.
- [ ] **Step 2:** Sumar PR-xx en `15-pruebas.md` apuntando a `archivado-base.spec.ts`, `archivar-consorcio.spec.ts` y las e2e. En `18-seguridad.md`, `EspacioComun` y `DocumentoConsorcio` en la lista de auditadas.
- [ ] **Step 3: Run** `npx prettier --write . && npm run verificar && npm run docs:versiones && npm audit --omit=dev --audit-level=high` — Expected: todo en verde.
- [ ] **Step 4: Commit** `docs(archivado): manual, pruebas, seguridad y nota de CLAUDE.md (RN-22)`
