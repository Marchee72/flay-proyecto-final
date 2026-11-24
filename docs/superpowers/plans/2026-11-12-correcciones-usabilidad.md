# Correcciones de la prueba de usabilidad (críticos y altos) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los 5 hallazgos críticos (C1–C5) y los 10 altos (A1–A10) del informe de usabilidad del 12/11/2026, para que un consorcio se pueda operar de punta a punta sin tocar la base.

**Architecture:** Cada corrección respeta las capas: la regla va al dominio o al caso de uso de `src/aplicacion/`, la pantalla solo llama. Se reutilizan los casos de uso que ya existen sin interfaz (`registrarOcupacion`, `editarProveedor`, `altaAdministradora`, `desbloquearUsuario`, `fijarContrasena`) y se agregan los mínimos que faltan. Solo hay una migración (A7). El trabajo se reparte en 8 ramas independientes, cada una con su PR y revisión del otro integrante.

**Tech Stack:** Next.js 15 (acciones de servidor, `useActionState`), Prisma 6 + PostgreSQL, Zod, Vitest (proyectos `dominio` e `integracion`), Playwright (`escritorio`, `telefono`, `a11y`).

**Spec:** `docs/superpowers/informes/2026-11-12-prueba-usabilidad.md` (secciones «Críticos» y «Altos»).

## Global Constraints

- Idioma: español en código, textos, nombres y commits. Cada commit cita su código (`RF-nn` / `RNF-nn`) y el hallazgo (`C1`, `A3`…).
- Dinero: ninguna firma pública acepta ni devuelve `number` para importes; viajan como cadena (`Prisma.Decimal` adentro).
- Presentación no importa infraestructura (nota 5 de `CLAUDE.md`): la pantalla llama a `src/aplicacion/**` y recibe las dependencias de `src/aplicacion/dependencias.ts`.
- Todo caso de uso nuevo pasa por `conAutorizacion` / `conAutorizacionDePlataforma`; sin acceso se lanza `NoEncontrado`, nunca «prohibido».
- Las tablas sin `consorcio_id` (`Ocupacion`, `DetalleLiquidacion`…) se alcanzan por su padre aislado (nota 10).
- Quien lee el padrón vigente filtra `bajaDesde: null` (nota 23).
- Los mensajes de éxito van por `conHecho(ruta, clave)` con la clave en `HECHO` de `src/app/aviso-en-url.ts` (nota 24); los errores de campo por `useActionState`.
- La validación de un campo se escribe una vez en el dominio y se usa al tipear y al guardar (nota 28); un error de campo lleva `aria-invalid` y `aria-describedby="error-<campo>"`.
- Sin dependencias nuevas. Si alguna tarea la necesitara, se detiene y se consulta.
- Puerta antes de cada PR: `npx prettier --write .`, `npm run verificar`, `npm run test:a11y`, `npm audit --omit=dev --audit-level=high` y gitleaks (comando en `CLAUDE.md`). Los secretos ficticios de prueba van en una variable `secreto…` bajo `pruebas/`.
- Base: integración contra la base local; **no** correr `npm run test:integracion` sobre una base con la semilla demo cargada (nota 1).

## Review Focus

1. **Un vecino con varias unidades y un solo PDF faltante:** la lista muestra todas sus expensas y solo esa fila dice «documento no disponible». Test en la Tarea 1.
2. **Invitar un correo que ya existe como `Persona` sin usuario** (por ejemplo, un propietario cargado para una asamblea): se reutiliza la persona y no estalla la clave única `Persona.correo`. Test en la Tarea 5.
3. **Un administrador intentando quitarse su propio acceso de administrador:** se rechaza con un mensaje claro. Test en la Tarea 6.
4. **Pedir un enlace para cambiar la clave con un correo inexistente, invitado o suspendido:** misma respuesta, ningún correo encolado, nada que revele si la cuenta existe. Test en la Tarea 7.
5. **Pago manual cargado cerca de la medianoche argentina:** se acepta el día de hoy en Argentina y se rechaza el siguiente, aunque en UTC ya sea el día siguiente. Test en la Tarea 16.

---

## Rama 1 — `fix/expensas-indicadores` (C1, C3, C4)

### Task 1: Un PDF faltante no tira la lista de expensas (C1, RF-08)

**Files:**
- Modify: `src/aplicacion/liquidacion/ver-expensa.ts` (en `aVisible`, el campo `direccion`, hoy en las líneas 300-302)
- Test: `pruebas/integracion/estado-de-expensa.spec.ts`

**Interfaces:**
- Produces: `ExpensaVisible.direccion` sigue siendo `string | null`; ahora también es `null` cuando el objeto no está en el almacén.

- [ ] **Step 1: Write the failing test** `'una expensa sin su PDF en el almacén queda sin dirección y no tira la lista'`. Usá el escenario del archivo y dale a la unidad dos liquidaciones con `claveDocumento`: una `'falta.pdf'` y otra `'esta.pdf'`. El almacén doble es `{ resolverLecturaAutorizada: async (clave) => { if (clave === 'falta.pdf') throw new NoEncontrado('FR-018'); return \`https://objetos/${clave}\` } }`. Afirmá que `misExpensas(...)` resuelve, que la expensa de `falta.pdf` tiene `direccion === null` y que la otra tiene `'https://objetos/esta.pdf'`. Afirmá también que `verExpensa(...)` sobre la de `falta.pdf` resuelve con `direccion === null`.
- [ ] **Step 2: Run** `npx vitest run --project integracion pruebas/integracion/estado-de-expensa.spec.ts` → FAIL con `NoEncontrado`.
- [ ] **Step 3: Implement.** En `aVisible`, envolver `almacen.resolverLecturaAutorizada(...)` y convertir **solo** `NoEncontrado` en `null`; cualquier otro error se relanza.
- [ ] **Step 4: Run** el mismo comando → PASS.
- [ ] **Step 5: Commit** `fix(expensas): un PDF faltante deja la fila sin documento en vez de tirar la lista (RF-08, C1)`

### Task 2: El indicador de proveedores no falla por columna ambigua (C3, RF-21)

**Files:**
- Modify: `src/infraestructura/repositorios/indicadores.ts:25-33` (`alcance`) y `:139-143` (`desempenoProveedores`)
- Test: `pruebas/integracion/indicadores.spec.ts`

**Interfaces:**
- Produces: `alcance(consorcios?: string[], columna: Prisma.Sql = Prisma.raw('consorcio_id')): Prisma.Sql`. Sin el segundo argumento, todos los llamadores actuales siguen igual.

- [ ] **Step 1: Write the failing test** `'I-3 devuelve el desempeño de proveedores del consorcio activo'`: refrescar las vistas como lo hacen los otros tests del archivo, llamar a `verProveedores(repo, RELOJ, { usuarioId: administrador, consorcioId })` y afirmar que resuelve a un arreglo cuyos elementos tienen todos `consorcioId === consorcioId`.
- [ ] **Step 2: Run** `npx vitest run --project integracion pruebas/integracion/indicadores.spec.ts` → FAIL con `42702 column reference "consorcio_id" is ambiguous`.
- [ ] **Step 3: Implement.** Agregar el parámetro `columna` a `alcance` y, en `desempenoProveedores`, llamar a `alcance(consorcios, Prisma.raw('v.consorcio_id'))`.
- [ ] **Step 4: Run** → PASS. Correr también `npm run validar:indicadores` → sin errores.
- [ ] **Step 5: Commit** `fix(indicadores): calificar consorcio_id en I-3 (RF-21, C3)`

### Task 3: El consejo y el administrador que ocupan una unidad ven sus propias expensas (C4, RF-08)

**Files:**
- Modify: `src/aplicacion/liquidacion/ver-expensa.ts` (`unidadesAlcanzables` :98-130, `misExpensas` :132-154)
- Modify: `src/app/(panel)/consorcios/[consorcio]/expensas/page.tsx:55-59` y el render de la sección de unidades propias
- Test: `pruebas/integracion/estado-de-expensa.spec.ts`, `pruebas/e2e/expensa.spec.ts`

**Interfaces:**
- Produces: `unidadesPropias(usuarioId: string, hoy: Date): Promise<{ id: string; designacion: string }[]>` (exportada): la rama de ocupación vigente que hoy vive dentro de `unidadesAlcanzables`. `unidadesAlcanzables` la reutiliza para los roles que no administran.
- Produces: `misExpensas` devuelve **solo** las unidades propias, sea cual sea el rol (`verExpensa` sigue usando `unidadesAlcanzables`).

- [ ] **Step 1: Write the failing tests** (integración): `'misExpensas del consejo trae solo la unidad que ocupa'` (consejo + consorcista con ocupación en `2A`, de 4 unidades → un solo elemento, `designacion === '2A'`) y `'misExpensas del administrador sin ocupación es vacío'` → `[]`.
- [ ] **Step 2: Run** → FAIL (hoy el consejo recibe las 4 unidades).
- [ ] **Step 3: Implement** `unidadesPropias` y usarla en `misExpensas`. En la página, `misExpensas` corre siempre (sacar el `esDeLaAdministracion ? Promise.resolve([])`). La sección de unidades propias se dibuja cuando `unidades.length > 0`, debajo del panorama de la administración cuando también corresponde, con el título «Tus expensas».
- [ ] **Step 4: Write e2e** `'el consejo que es propietario abre y ve su propia expensa'` en `pruebas/e2e/expensa.spec.ts`: sembrar con `sembrarUsuarioEn(escenario, 'consejo')` más una ocupación propia (como `sembrarUnidadPropia`), entrar, ir a Expensas, hacer clic en el período de su unidad y esperar el encabezado `Expensa MM/AAAA · unidad <designación>`.
- [ ] **Step 5: Run** integración y `npx playwright test pruebas/e2e/expensa.spec.ts` → PASS.
- [ ] **Step 6: Commit** `fix(expensas): mostrar las expensas propias también al consejo y al administrador (RF-08, C4)`

---

## Rama 2 — `feat/accesos-y-ocupantes` (C2, A2, A3)

### Task 4: Validador de correo en el dominio (A2, RF-03)

**Files:**
- Create: `src/dominio/identidad/correo.ts`
- Test: `pruebas/dominio/correo.spec.ts`

**Interfaces:**
- Produces: `errorDeCorreo(texto: string): string | null`. Recorta espacios antes de validar. Mensajes exactos: vacío → `'Escribí el correo.'`; inválido → `'Ese correo no tiene un formato válido: revisá que tenga @ y un dominio, como nombre@ejemplo.com.'`. Es válido si cumple `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.

- [ ] **Step 1: Write the failing test** `describe('errorDeCorreo (RF-03)')`: `''` y `'   '` → `'Escribí el correo.'`; `'ana@'`, `'ana@flay'` y `'ana flay@x.com'` → el mensaje de formato; `'ana@flay.demo'` y `' ANA@Flay.Demo '` → `null`.
- [ ] **Step 2: Run** `npx vitest run --project dominio pruebas/dominio/correo.spec.ts` → FAIL (no existe el módulo).
- [ ] **Step 3: Implement** `errorDeCorreo`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(identidad): validador de correo en el dominio (RF-03, A2)`

### Task 5: Invitar con unidad, y sumar a quien ya tiene cuenta (C2, A2, A3, RF-03)

**Files:**
- Modify: `src/aplicacion/identidad/invitar-persona.ts` (`invitarPersona`, `altaDelInvitado`; se reemplaza `CorreoYaRegistrado`)
- Modify: `src/infraestructura/repositorios/ocupaciones.ts` (`registrarOcupacion` acepta un cliente de transacción)
- Modify: `src/app/(panel)/consorcios/[consorcio]/usuarios/acciones.ts`, `formulario.tsx`, `page.tsx`; `src/app/aviso-en-url.ts`
- Test: `pruebas/integracion/accesos.spec.ts` (nuevo); ajustar `pruebas/integracion/identidad.spec.ts` donde espere `CorreoYaRegistrado`

**Interfaces:**
- Consumes: `errorDeCorreo` (Task 4).
- Produces:
  - `registrarOcupacion(ocupacion: OcupacionNueva, cliente: Prisma.TransactionClient | PrismaClient = prismaBase)` en el repositorio.
  - `invitarPersona(repo, reloj, datos & { unidad?: { unidadId: string; tipo: TipoDeOcupacion } | null }): Promise<{ usuarioId: string; yaTeniaCuenta: boolean }>`.
  - Errores nuevos en `invitar-persona.ts`: `CorreoInvalido(mensaje: string)` y `YaTieneAcceso`, con el texto `'Esa persona ya tiene acceso a este consorcio con ese rol.'`.
  - `HECHO['acceso-sumado'] = 'Ya tenía cuenta en Flay: le dimos acceso a este consorcio.'`

- [ ] **Step 1: Write the failing tests** en `accesos.spec.ts`:
  - `'invitar con unidad deja la ocupación vigente desde la vigencia'` → `ocupantesVigentes(unidadId, 'propietario', hoy)` contiene la `personaId` del invitado.
  - `'invitar un correo mal formado no crea nada'` → rechaza con `CorreoInvalido`; la cantidad de `usuario` no cambia.
  - `'invitar a quien ya tiene cuenta en otro consorcio le suma el acceso sin crear usuario ni correo'` → `yaTeniaCuenta === true`, la cantidad de usuarios no cambia, `repositorio.accesoVigente(usuarioId, consorcioId, hoy)` no es nulo y no hay `TrabajoPendiente` de tipo `invitacion` con ese destino.
  - `'invitar de nuevo con el mismo rol avisa'` → `YaTieneAcceso`.
  - `'una persona cargada sin usuario se reutiliza'` (Review Focus 2) → crear antes una `Persona` con ese correo; la invitación resuelve y `persona.count({ where: { correo } }) === 1`.
  - `'la unidad de otro consorcio no se acepta'` → `NoEncontrado`.
- [ ] **Step 2: Run** `npx vitest run --project integracion pruebas/integracion/accesos.spec.ts` → FAIL.
- [ ] **Step 3: Implement** en `altaDelInvitado`, en este orden:
  1. `errorDeCorreo` → `CorreoInvalido`.
  2. Si la unidad viene: `prisma.unidad.findFirst({ where: { id, bajaDesde: null } })` (aislada), y si no aparece, `NoEncontrado`.
  3. Si ya hay `Usuario` con ese correo: si ya tiene una habilitación vigente con ese rol en el consorcio, `YaTieneAcceso`; si no, crear la habilitación. Con la unidad, registrar la ocupación. No se encola nada y se devuelve `yaTeniaCuenta: true`.
  4. Si no: reutilizar la `Persona` con ese correo si existe, si no crearla; crear el usuario, la habilitación y la ocupación **dentro de la misma transacción** (pasando `tx` al repositorio) y encolar la invitación como hoy.
- [ ] **Step 4: Run** → PASS. Correr `pruebas/integracion/identidad.spec.ts` y ajustar lo que esperaba `CorreoYaRegistrado`.
- [ ] **Step 5: UI.** `formulario.tsx`: dos campos que se muestran solo con `rol === 'consorcista'`:
  - `unidad`: select con la primera opción `''` = «Sin unidad por ahora», más las unidades vigentes ordenadas con `ordenarUnidades`, que la página obtiene igual que `unidades/page.tsx`.
  - `tipoOcupacion`: Propietario / Inquilino.

  La acción redirige con `'acceso-sumado'` cuando `yaTeniaCuenta`, y con `'invitado'` si no. El correo mal formado se avisa al tipear con `errorDeCorreo` (nota 28).
- [ ] **Step 6: Commit** `feat(usuarios): invitar con unidad y sumar a quien ya tiene cuenta (RF-03, C2, A2, A3)`

### Task 6: Asignar unidad y quitar acceso desde Usuarios (C2, A3, RF-03)

**Files:**
- Create: `src/aplicacion/identidad/quitar-acceso.ts`
- Modify: `src/aplicacion/identidad/listar-usuarios.ts` (`UsuarioDelConsorcio`)
- Modify: `src/aplicacion/consorcios/registrar-ocupacion.ts` (traducir la exclusión de la base)
- Modify: `src/infraestructura/repositorios/ocupaciones.ts` (consulta nueva)
- Modify: `src/app/(panel)/consorcios/[consorcio]/usuarios/page.tsx`, `acciones.ts`; create `modal-unidad.tsx`, `modal-quitar.tsx`; `src/app/aviso-en-url.ts`
- Test: `pruebas/integracion/accesos.spec.ts`, `pruebas/e2e/usuarios.spec.ts` (nuevo)

**Interfaces:**
- Produces:
  - `ocupacionesVigentesDe(unidadIds: string[], fecha: Date): Promise<{ unidadId: string; personaId: string; tipo: TipoDeOcupacion }[]>` en el repositorio.
  - `UsuarioDelConsorcio` suma `personaId: string`, `habilitaciones: { id: string; rol: Rol }[]` y `unidades: { designacion: string; tipo: TipoDeOcupacion }[]`. Las unidades se leen partiendo de `prisma.unidad.findMany({ where: { bajaDesde: null } })` (aislada) y después `ocupacionesVigentesDe`.
  - `quitarAcceso(repo, reloj, { usuarioId: string; consorcioId: string; habilitacionId: string }): Promise<void>`, solo para administrador. La habilitación se busca con `prisma.habilitacion.findFirst` (aislada) y, si no está, `NoEncontrado`. Si es del propio usuario con rol `administrador`, lanza `NoPodesQuitarteElAcceso`: `'No podés quitarte tu propio acceso de administrador: pedíselo a otro administrador.'`. El efecto es **inmediato**: si `vigenciaDesde >= hoy`, la fila se borra; si no, `vigenciaHasta = hoy − 1 día` (el repositorio considera vigente `vigenciaHasta >= hoy`).
  - En `registrarOcupacion` (aplicación): la violación de exclusión de Postgres (`23P01`) se traduce a `InquilinoSuperpuesto`: `'La unidad ya tiene un inquilino vigente en esas fechas.'`.
  - `HECHO['unidad-asignada'] = 'Unidad asignada.'`, `HECHO['acceso-quitado'] = 'Acceso quitado. Ya no puede entrar a este consorcio.'`

- [ ] **Step 1: Write the failing tests** (integración):
  - `'quitar el acceso de un consorcista lo deja afuera hoy mismo'` → `accesoVigente(..., hoy)` es `null`.
  - `'una habilitación otorgada hoy se borra al quitarla'`.
  - `'el administrador no puede quitarse su propio acceso'` (Review Focus 3) → `NoPodesQuitarteElAcceso`.
  - `'quitar una habilitación de otro consorcio es no encontrado'`.
  - `'listarUsuarios trae las unidades vigentes de cada persona'` → `[{ designacion: '1A', tipo: 'propietario' }]`.
  - `'un segundo inquilino superpuesto se rechaza con mensaje'` → `InquilinoSuperpuesto`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `ocupacionesVigentesDe`, la extensión de `listarUsuarios`, `quitarAcceso` y la traducción del `23P01`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: UI.** La tabla de Usuarios suma la columna «Unidades» (`1A · propietario`, o «—»). Por fila:
  - «Asignar unidad» → `modal-unidad.tsx` (unidad, tipo, desde = hoy) → acción que llama al `registrarOcupacion` existente con la `personaId` de la fila.
  - Por cada rol, «Quitar» → `modal-quitar.tsx`, que confirma con el texto «¿Quitarle a {nombre} el acceso de {rol} a este consorcio?» y llama a `quitarAcceso`.

  Los modales usan el componente `Modal` existente (`src/app/(panel)/modal.tsx`), nunca `confirm()`.
- [ ] **Step 6: Write e2e** `pruebas/e2e/usuarios.spec.ts` → `'el administrador asigna una unidad a un invitado y el invitado la ve en Expensas'`: sembrar un administrador y un consorcista sin unidad; el administrador asigna la `1A` desde Usuarios; el consorcista entra y en Expensas **no** ve «No hay unidades a tu nombre».
- [ ] **Step 7: Run** integración, e2e y `npm run test:a11y` → PASS.
- [ ] **Step 8: Commit** `feat(usuarios): asignar unidad y quitar acceso desde la nómina (RF-03, C2, A3)`

---

## Rama 3 — `feat/recuperar-acceso` (C5)

### Task 7: Enlace para cambiar la clave, por pedido propio o del administrador (C5, RF-03)

**Files:**
- Create: `src/aplicacion/identidad/credencial.ts` (mover `resumen` acá y sumar `nuevaCredencial`)
- Create: `src/aplicacion/identidad/restablecer.ts`
- Modify: `src/aplicacion/identidad/invitar-persona.ts` (usar `credencial.ts`; `fijarContrasena` también pone `bloqueadoHasta: null`)
- Create: `src/app/(sesion)/recuperar/page.tsx`, `src/app/(sesion)/recuperar/formulario.tsx`; modify `src/app/(sesion)/acciones.ts`, `src/app/(sesion)/ingresar/page.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/usuarios/page.tsx`, `acciones.ts`; `src/app/aviso-en-url.ts`
- Test: `pruebas/integracion/restablecer.spec.ts` (nuevo), `pruebas/e2e/ingresar.spec.ts`

**Interfaces:**
- Consumes: `errorDeCorreo` (Task 4), `encolar('correo_directo', { destino, titulo, cuerpo })` (carga ya validada por `CORREO_DIRECTO` en `manejadores.ts`).
- Produces:
  - `nuevaCredencial(): { credencial: string; hash: string }` y `resumen(credencial: string): string`.
  - `HORAS_DE_VIGENCIA_DEL_RESTABLECIMIENTO = 2`.
  - `pedirRestablecimiento(reloj: Reloj, datos: { correo: string; urlBase: string }): Promise<void>`. Solo actúa si existe un usuario con ese correo y `estado === 'activo'`: le pone `invitacionHash`, le pone `invitacionVence = ahora + 2 h` y encola un `correo_directo` con `titulo: 'Cambiá tu contraseña'` y `cuerpo: 'Pediste cambiar tu contraseña de Flay. Entrá a <urlBase>/invitacion/<credencial> en las próximas 2 horas para elegir una nueva. Si no fuiste vos, ignorá este correo.'`. En cualquier otro caso no hace nada y **nunca lanza** por el correo.
  - `enviarEnlaceDeClave(repo, reloj, { usuarioId: string; consorcioId: string; destinatarioId: string; urlBase: string }): Promise<void>`, solo para administrador. El destinatario tiene que tener una habilitación vigente en el consorcio (consulta aislada) y, si no, `NoEncontrado`. Primero le levanta el bloqueo (`bloqueadoHasta: null`). Si es `invitado`, lanza `TodaviaInvitado`: `'Todavía no aceptó la invitación: usá «Reenviar».'`. Si no, hace lo mismo que `pedirRestablecimiento`.
  - `HECHO['enlace-enviado'] = 'Le mandamos un correo con un enlace para elegir una contraseña nueva.'`

- [ ] **Step 1: Write the failing tests** en `restablecer.spec.ts`:
  - `'un usuario activo recibe el enlace, y el enlace fija la clave y levanta el bloqueo'` → hay un `TrabajoPendiente` `correo_directo` para ese destino; con la credencial sacada de la carga, `fijarContrasena` resuelve, y el usuario queda con `bloqueadoHasta === null` y una clave nueva verificable.
  - `'un correo inexistente, invitado o suspendido no encola nada y no lanza'` (Review Focus 4) → tres llamadas que resuelven, sin trabajos nuevos.
  - `'el enlace vence a las 2 horas'` → con un reloj 2 h 1 min después, `fijarContrasena` lanza `InvitacionNoValida`.
  - `'el administrador de otro consorcio no puede mandar el enlace'` → `NoEncontrado`.
  - `'a un invitado se le indica Reenviar'` → `TodaviaInvitado`.
- [ ] **Step 2: Run** `npx vitest run --project integracion pruebas/integracion/restablecer.spec.ts` → FAIL.
- [ ] **Step 3: Implement** `credencial.ts`, `restablecer.ts` y el cambio en `fijarContrasena`.
- [ ] **Step 4: Run** → PASS, junto con `identidad.spec.ts`.
- [ ] **Step 5: UI.**
  - `/recuperar`: campo de correo y botón «Mandarme el enlace». La acción valida con `errorDeCorreo` y después **siempre** responde `'Si ese correo tiene cuenta en Flay, te mandamos un enlace para elegir una contraseña nueva. Revisá también el correo no deseado.'`.
  - Ingreso: enlace «¿Olvidaste tu contraseña?» a `/recuperar`, y debajo del botón un texto fijo, que no depende del estado de la cuenta: «Después de cinco intentos fallidos el ingreso se pausa quince minutos.».
  - Usuarios: en las filas `activo`, la acción «Enviar enlace para cambiar la clave»; si `bloqueado`, además la etiqueta «Bloqueado». Llama a `enviarEnlaceDeClave` y redirige con `'enlace-enviado'`.
- [ ] **Step 6: Write e2e** en `ingresar.spec.ts` → `'desde el ingreso se llega a pedir el enlace y la respuesta no revela si el correo existe'`: el mismo texto para un correo sembrado y para `nadie@ejemplo.test`.
- [ ] **Step 7: Run** e2e y `npm run test:a11y` → PASS.
- [ ] **Step 8: Commit** `feat(identidad): recuperar la contraseña y enlace del administrador (RF-03, C5)`

---

## Rama 4 — `fix/formularios-conservan` (A1, A10)

### Task 8: Ayuda para devolver lo tipeado (A1, RNF-10)

**Files:**
- Create: `src/app/valores-de-formulario.ts` (sin `'use client'`, para que lo importen las acciones)
- Test: `pruebas/dominio/valores-de-formulario.spec.ts`

**Interfaces:**
- Produces: `type ConValores = { valores?: Record<string, string> }` y `valoresDe(datos: FormData, sin: readonly string[] = []): Record<string, string>`. Descarta las claves que empiezan con `$ACTION`, las listadas en `sin` y los `File`.

- [ ] **Step 1: Write the failing test**: con un `FormData` de `{ importe: '0', descripcion: 'x', '$ACTION_KEY': 'k', contrasena: 's', archivo: new File([], 'a') }`, `valoresDe(fd, ['contrasena'])` es `{ importe: '0', descripcion: 'x' }`.
- [ ] **Step 2: Run** `npx vitest run --project dominio pruebas/dominio/valores-de-formulario.spec.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(formularios): ayuda para devolver lo tipeado tras un rechazo (RNF-10, A1)`

### Task 9: Los formularios no borran lo tipeado (A1, RNF-10)

**Files (acción + formulario de cada uno):**
- `src/app/(panel)/consorcios/[consorcio]/gastos/acciones.ts` + `formulario.tsx`
- `.../reclamos/acciones.ts` + `modal-reclamo.tsx`
- `.../reservas/acciones.ts` + `modal-reserva.tsx`
- `.../usuarios/acciones.ts` + `formulario.tsx`
- `.../proveedores/acciones.ts` + `formulario.tsx`
- `.../pagos/acciones.ts` + `formulario.tsx`
- `src/app/(panel)/consorcios/acciones.ts` + `consorcios/nuevo/formulario.tsx`
- Test: `pruebas/e2e/formularios-conservan.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `ConValores`, `valoresDe` (Task 8).
- Produces: el `Resultado` de cada acción pasa a ser `{ mensaje: string } & ConValores`.

- [ ] **Step 1: Write the failing e2e tests:**
  - `'un gasto rechazado conserva importe, fecha y descripción'`: importe `0`, fecha `2026-11-10`, descripción «Prueba» → aparece el error y los tres campos siguen con esos valores.
  - `'un reclamo rechazado conserva el título'`: detalle `x`.
  - `'una reserva rechazada conserva desde y hasta'`: hasta anterior a desde.
- [ ] **Step 2: Run** `npx playwright test pruebas/e2e/formularios-conservan.spec.ts --project=escritorio` → FAIL (los campos quedan vacíos).
- [ ] **Step 3: Implement.** Toda devolución de error es `{ mensaje, valores: valoresDe(datos) }`, y cada `input`, `select` y `textarea` usa `defaultValue={estado.valores?.<campo> ?? <valor inicial de hoy>}`. Si el reset de React 19 pisa los `defaultValue`, montar el `<form>` con `key` igual a un contador que cambia con cada resultado. Vencimientos no se toca: es controlado y ya conserva.
- [ ] **Step 4: Run** e2e (`escritorio` y `telefono`) → PASS.
- [ ] **Step 5: Commit** `fix(formularios): conservar lo tipeado cuando el servidor rechaza (RNF-10, A1)`

### Task 10: El ingreso distingue «falta» y «formato» de «no coincide» (A10, RNF-10)

**Files:**
- Modify: `src/app/(sesion)/acciones.ts` (`accionIngresar`), `src/app/(sesion)/formularios.tsx`
- Test: `pruebas/e2e/ingresar.spec.ts`

**Interfaces:**
- Consumes: `errorDeCorreo` (Task 4), `valoresDe` (Task 8).

- [ ] **Step 1: Write the failing e2e tests:** `'con el correo vacío pide el correo'` → `'Escribí el correo.'`; `'con un correo mal formado lo dice'` → el mensaje de formato de la Task 4; `'sin contraseña la pide'` → `'Escribí tu contraseña.'`; `'después de una clave incorrecta el correo sigue escrito'`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Antes de `ingresar`, `errorDeCorreo` y la contraseña vacía. Toda devolución lleva `valores: valoresDe(datos, ['contrasena'])`, y el campo de correo usa `defaultValue`. El mensaje único de credenciales (FR-001c) no cambia.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `fix(ingreso): mensajes para campo vacío y correo mal formado, y conservar el correo (RNF-10, A10)`

---

## Rama 5 — `feat/corregir-cargas` (A4)

### Task 11: Editar y eliminar un gasto con el período abierto (A4, RF-04)

**Files:**
- Create: `src/aplicacion/gastos/editar-gasto.ts`
- Modify: `src/aplicacion/gastos/registrar-gasto.ts` (exportar `IMPORTE_VALIDO`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/gastos/[id]/page.tsx`, `gastos/acciones.ts`, `gastos/formulario.tsx` (modo edición); create `gastos/[id]/modal-eliminar.tsx`; `src/app/aviso-en-url.ts`
- Test: `pruebas/integracion/corregir-gastos.spec.ts` (nuevo)

**Interfaces:**
- Produces:
  - `editarGasto(repo, reloj, { usuarioId; consorcioId; gastoId; rubroId; clasificacion: Clasificacion; proveedorId: string | null; importe: string; fecha: Date; descripcion: string }): Promise<void>`, solo para administrador. El período no se edita. Exige `exigirPeriodoConGastos(periodo.estado)` y valida el importe con `IMPORTE_VALIDO` / `ImporteInvalido`.
  - `eliminarGasto(repo, reloj, { usuarioId; consorcioId; gastoId }): Promise<{ periodoId: string }>`. Exige el período abierto y lanza `GastoConVinculos`, con el texto `'Este gasto tiene comprobantes o un reclamo asociado: corregí sus datos en lugar de borrarlo.'`, si tiene comprobantes, una extracción o un reclamo que lo referencien.
  - `FormularioGasto` acepta `gasto?: { id; rubroId; clasificacion; proveedorId; importe; fecha; descripcion }`. Con `gasto` oculta el período y llama a la acción de edición.
  - `HECHO['gasto-actualizado'] = 'Gasto actualizado.'`, `HECHO['gasto-eliminado'] = 'Gasto eliminado.'`

- [ ] **Step 1: Write the failing tests:**
  - `'editar un gasto del período abierto cambia el importe y deja rastro en la bitácora'` → `importe` nuevo y una fila de `BitacoraAuditoria` de `UPDATE` sobre `Gasto` de esta corrida.
  - `'editar un gasto de un período liquidado se rechaza'` → `PeriodoNoAdmiteGastos`.
  - `'editar con importe 0 se rechaza'` → `ImporteInvalido`.
  - `'un consorcista no puede editar'` → `RolInsuficiente`.
  - `'un gasto de otro consorcio es no encontrado'`.
  - `'eliminar un gasto sin vínculos lo borra'`.
  - `'eliminar un gasto con comprobante se rechaza'` → `GastoConVinculos`.
- [ ] **Step 2: Run** `npx vitest run --project integracion pruebas/integracion/corregir-gastos.spec.ts` → FAIL.
- [ ] **Step 3: Implement** los dos casos de uso.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: UI.** En el detalle del gasto, para el administrador y con el período abierto: «Editar» (modal con `FormularioGasto` y `gasto`) y «Eliminar» (`modal-eliminar.tsx`: «¿Eliminar este gasto de $ X?»). Al eliminar se vuelve a `/gastos?periodo=<id>`. Con el período cerrado o liquidado se ve una línea: «El período está {estado}: lo que haya que corregir va como ajuste en el período siguiente.». El enlace «Corregir gastos» de «Revisar y liquidar» lleva a esa lista.
- [ ] **Step 6: Commit** `feat(gastos): editar y eliminar gastos del período abierto (RF-04, A4)`

### Task 12: Editar proveedores desde la lista (A4, RF-04)

**Files:**
- Modify: `src/app/(panel)/consorcios/[consorcio]/proveedores/page.tsx`, `acciones.ts`, `formulario.tsx`; `src/app/aviso-en-url.ts`
- Test: `pruebas/integracion/proveedores.spec.ts`

**Interfaces:**
- Consumes: `editarProveedor` (ya existe en `src/aplicacion/proveedores/proveedores.ts:102`). El CUIT **no** se edita, por decisión ya tomada ahí.
- Produces: `FormularioProveedor` acepta `proveedor?: { id; razonSocial; cuit; rubroHabitualId; telefono; correo }`. Con `proveedor`, el CUIT se muestra de solo lectura con la ayuda «El CUIT no se cambia: si está mal, cargá el proveedor de nuevo.». `HECHO['proveedor-actualizado'] = 'Proveedor actualizado.'`

- [ ] **Step 1: Write the failing test** `'editar cambia la razón social y deja el CUIT'` (si `proveedores.spec.ts` ya lo cubre, sumar solo `'un consorcista no puede editar'` → `RolInsuficiente`).
- [ ] **Step 2: Run** → FAIL, o PASS si ya estaba cubierto; en ese caso se sigue con la UI.
- [ ] **Step 3: UI.** Columna de acciones con «Editar» por fila, solo para el administrador, que abre un modal con el formulario en modo edición.
- [ ] **Step 4: Run** integración y `npm run test:a11y` → PASS.
- [ ] **Step 5: Commit** `feat(proveedores): editar desde la lista (RF-04, A4)`

---

## Rama 6 — `fix/altas-de-plataforma` (A5, A6)

### Task 13: Alta de consorcio con CUIT válido y sin duplicar la dirección (A5, RF-01)

**Files:**
- Modify: `src/aplicacion/consorcios/alta-consorcio.ts:45-70`
- Test: `pruebas/integracion/consorcios.spec.ts`

**Interfaces:**
- Consumes: `normalizarCuit` (`src/dominio/proveedores/cuit.ts`), `CuitInvalido` (`src/aplicacion/proveedores/proveedores.ts:34`).
- Produces: `ConsorcioYaExiste(direccion: string, localidad: string)` con el texto `` `Esta administradora ya tiene un consorcio en ${direccion}, ${localidad}.` ``. El CUIT se guarda normalizado (`NN-NNNNNNNN-N`).

- [ ] **Step 1: Write the failing tests:** `'un CUIT de 2 dígitos se rechaza'` → `CuitInvalido`; `'el CUIT se guarda normalizado'` (con `'30712345671'` queda `'30-71234567-1'`); `'la misma dirección y localidad en la misma administradora se rechaza, sin importar mayúsculas'` → `ConsorcioYaExiste`; `'la misma dirección en otra administradora se acepta'`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Normalizar antes de buscar por CUIT. El duplicado se busca con `prismaBase.consorcio.findFirst({ where: { administradoraId, direccion: { equals, mode: 'insensitive' }, localidad: { equals, mode: 'insensitive' } } })`, recortando espacios.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `fix(consorcios): validar el CUIT y no duplicar la dirección en el alta (RF-01, A5)`

### Task 14: Pantalla de administradoras para el superadministrador (A6, RF-01)

**Files:**
- Modify: `src/aplicacion/administradoras/alta-administradora.ts` (normalizar el CUIT y lanzar `CuitInvalido`)
- Create: `src/app/(panel)/administradoras/page.tsx`, `formulario.tsx`, `acciones.ts`
- Modify: `src/app/(panel)/marco.tsx`, `src/app/(panel)/navegacion.tsx` (`NavegacionGlobal`); `src/app/aviso-en-url.ts`
- Test: `pruebas/integracion/plataforma.spec.ts`, `pruebas/e2e/navegacion.spec.ts`

**Interfaces:**
- Produces: `NavegacionGlobal({ conBandeja: boolean; conAdministradoras: boolean })`. `Marco` calcula `conAdministradoras` con `HABILITACIONES.esSuperAdministrador(usuarioId, RELOJ.hoy())`. `HECHO['administradora-creada'] = 'Administradora creada. Ya podés darle de alta consorcios.'`

- [ ] **Step 1: Write the failing tests** (integración): `'el CUIT de la administradora se normaliza y uno inválido se rechaza'`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** la normalización.
- [ ] **Step 4: UI.** `/administradoras` lista las administradoras de `misAdministradoras`, con razón social y CUIT, más el formulario de alta (razón social, CUIT) con conservación de valores (Task 8). Quien no es superadministrador ve «Tu rol no permite ver las administradoras.» con `AvisoDeError`, igual que las otras pantallas. El lateral global suma «Administradoras» solo con `conAdministradoras`.
- [ ] **Step 5: Write e2e** en `navegacion.spec.ts` → `'el superadministrador ve Administradoras en el lateral y un administrador no'`.
- [ ] **Step 6: Run** integración, e2e y `npm run test:a11y` → PASS.
- [ ] **Step 7: Commit** `feat(plataforma): alta de administradoras desde la interfaz (RF-01, A6)`

---

## Rama 7 — `feat/cobro-sin-pasarela` (A7, A8)

### Task 15: Instrucciones de pago por consorcio (A7, RF-09)

**Files:**
- Create: `prisma/migrations/20261113120000_instrucciones_de_pago/migration.sql`. Contenido: `ALTER TABLE "Consorcio" ADD COLUMN "instrucciones_pago" TEXT;`
- Modify: `prisma/schema.prisma` (`Consorcio.instruccionesPago String? @map("instrucciones_pago") @db.Text`)
- Create: `src/aplicacion/consorcios/instrucciones-de-pago.ts`
- Modify: `src/aplicacion/liquidacion/ver-expensa.ts` (`ExpensaVisible`, `aVisible`)
- Modify: `src/app/(panel)/consorcios/[consorcio]/vencimientos/page.tsx`, `acciones.ts`; create `vencimientos/formulario-instrucciones.tsx`
- Modify: `src/app/(panel)/consorcios/[consorcio]/expensas/[detalle]/page.tsx`
- Modify: `docs/entrega-3/07-analisis-de-datos.md` (tabla «Consorcio»: fila `instrucciones_pago | texto(1000) | | Cómo pagar por fuera de la pasarela: alias, CBU, horario de la administración`)
- Test: `pruebas/integracion/instrucciones-de-pago.spec.ts` (nuevo), `pruebas/e2e/expensa.spec.ts`

**Interfaces:**
- Produces:
  - `guardarInstruccionesDePago(repo, reloj, { usuarioId: string; consorcioId: string; texto: string }): Promise<void>`, solo para administrador. Recorta espacios; vacío se guarda como `null`; más de 1000 caracteres lanza `InstruccionesDemasiadoLargas`: `'Las instrucciones de pago pueden tener hasta 1000 caracteres.'`.
  - `verInstruccionesDePago(repo, reloj, { usuarioId; consorcioId }): Promise<string | null>`.
  - `ExpensaVisible.instruccionesDePago: string | null`, que sale de `detalle.liquidacion.consorcio`, ya incluido en `aVisible`.

- [ ] **Step 1: Write the failing tests:** `'el administrador guarda las instrucciones y el consorcista las ve en su expensa'`; `'más de 1000 caracteres se rechaza'`; `'un consorcista no puede guardarlas'` → `RolInsuficiente`; `'texto vacío las borra'` → `null`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** la migración (`npm run db:deploy`, y después `npm run db:drift` sin deriva), el esquema y los casos de uso.
- [ ] **Step 4: UI.**
  - Vencimientos: sección «Cómo se paga» con un `textarea` (`maxLength=1000`, contador) y su propio botón «Guardar». Toast `'instrucciones-guardadas': 'Instrucciones de pago guardadas.'`.
  - Detalle de la expensa, con la expensa sin saldar: si hay instrucciones, un bloque «Cómo pagar» con el texto (`white-space: pre-wrap`); si no se puede pagar en línea y no hay instrucciones, «Consultá con la administración cómo pagar esta expensa.».
- [ ] **Step 5: Write e2e** `'el consorcista ve cómo pagar cuando no hay pasarela'` en `expensa.spec.ts`.
- [ ] **Step 6: Run** integración, e2e y `npm run test:a11y` → PASS.
- [ ] **Step 7: Commit** `feat(pagos): instrucciones de pago por consorcio (RF-09, A7)`

### Task 16: Pago manual: fecha futura rechazada y deuda a la vista (A8, RF-09)

**Files:**
- Modify: `src/aplicacion/pagos/registrar.ts` (`registrarPago`, después de validar el importe; error nuevo junto a los de las líneas 33-50)
- Modify: `src/app/(panel)/consorcios/[consorcio]/pagos/page.tsx`, `formulario.tsx`
- Test: `pruebas/integracion/pagos.spec.ts`

**Interfaces:**
- Produces:
  - `FechaDePagoFutura` con el texto `'La fecha del pago no puede ser posterior a hoy.'`. Se lanza cuando `datos.fechaPago.getTime() > reloj.hoy().getTime()`, comparando días a las 00:00 UTC (así arma la fecha la acción y así devuelve el día `relojDelSistema.hoy()`).
  - `FormularioPago` recibe `saldos: Record<string, string>` (`unidadId` → saldo como cadena, sacado del estado de cuenta que la página ya calcula). Debajo del select muestra «Debe hoy: $ X» con `importeParaMostrar`, o «Sin deuda» cuando es cero.

- [ ] **Step 1: Write the failing tests:**
  - `'un pago con fecha posterior a hoy se rechaza con su mensaje'` → `FechaDePagoFutura`, antes que `PagoBloqueadoHastaLiquidar`.
  - `'cerca de la medianoche argentina se acepta el día de hoy y no el siguiente'` (Review Focus 5) → con el reloj `{ ahora: () => new Date('2026-11-13T02:30:00Z'), hoy: () => diaArgentino(new Date('2026-11-13T02:30:00Z')) }`, la fecha `2026-11-12` se acepta y la `2026-11-13` se rechaza.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** el control y la ayuda de saldo en el formulario.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `fix(pagos): rechazar la fecha futura y mostrar la deuda al elegir la unidad (RF-09, A8)`

---

## Rama 8 — `fix/calendario-telefono` (A9)

### Task 17: El calendario de uso no se rompe en el teléfono (A9, RNF-01)

**Files:**
- Modify: `src/app/globals.css`, dentro de `@media (max-width: 760px)` (hoy en la línea 1607), en el bloque que convierte las tablas en listas
- Test: `pruebas/e2e/reservas.spec.ts`

**Interfaces:** ninguna.

- [ ] **Step 1: Write the failing e2e test** `'el historial de reservas muestra la grilla de siete columnas sin desbordar la página'`, que corre en el proyecto `telefono`. Entrar como administrador e ir a `/reservas/historial`. Afirmar `await desbordaALoAncho(page) === false`, que el encabezado `Lun` es visible y que las siete celdas de la segunda semana tienen el mismo `boundingBox().y`.
- [ ] **Step 2: Run** `npx playwright test pruebas/e2e/reservas.spec.ts --project=telefono` → FAIL.
- [ ] **Step 3: Implement.** Dentro del bloque móvil, devolverle a `table.calendario` y a sus partes (`thead`, `tbody`, `tr`, `th`, `td`, `tr::after`) su display de tabla, anulando la conversión a lista. El `.tabla-desplazable` que la envuelve desplaza a lo ancho: es lo que ya anuncia el comentario de `calendario-uso.tsx`.
- [ ] **Step 4: Run** → PASS, también en `escritorio`. Correr `npm run test:a11y`.
- [ ] **Step 5: Commit** `fix(reservas): grilla del calendario en el teléfono (RNF-01, A9)`

---

## Orden y cierre de cada rama

1. Ramas 1 → 2 → 3 → 4 en ese orden: la 2 y la 3 dependen del validador de la Task 4, y la 4 usa `errorDeCorreo`. Las ramas 5 a 8 son independientes entre sí y de las anteriores, salvo que la 5, la 6 y la 7 usan `valoresDe` (Task 8) en sus formularios nuevos: si se adelantan, quedan para después de la rama 4.
2. Al cerrar cada rama: la puerta de *Global Constraints*, un PR con la lista de hallazgos que cierra (`C1`, `A3`…) y revisión obligatoria del otro integrante.
3. Al cerrar la última: volver a recorrer como usuario final los casos del informe que estas ramas tocan, y marcar en `docs/superpowers/informes/2026-11-12-prueba-usabilidad.md` qué quedó resuelto.
