# Privacidad hacia proveedores externos de IA (sin PII al LLM) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** garantizar técnicamente y dejar asentado en la documentación que ningún dato personal identificatorio (PII) de personas físicas —nombres y apellidos, correos, teléfonos, DNI/CUIL, `personaId`/`usuarioId` ni enlaces firmados— salga hacia proveedores externos de IA, manteniendo intactas todas las funcionalidades operativas del asistente (reservas, reclamos, novedades, expensas, morosidad por unidad, espacios, proveedores, reglamentos).

**Architecture:** doble barrera en la capa de aplicación apoyada en un módulo puro de dominio (`src/dominio/asistencia/privacidad.ts`): (1) proyección explícita por herramienta en `src/aplicacion/asistente/lectura.ts` y retiro de `ver_usuarios` y `ver_responsables`, más ajuste de `asignar_reclamo` para fijar `ctx.usuarioId` en servidor; (2) sanitizador estructural `sanitizarParaModelo()` en `src/aplicacion/asistente/base.ts` y `conversar.ts`, más `redactarContactoEnTexto()` en `acta.ts` y `reclamos/sugerencia.ts`. Verificado con pruebas unitarias y pruebas de integración «canario».

**Tech Stack:** TypeScript, Next.js, Prisma, Zod, Vitest (dominio + integración), Prettier/ESLint.

**Spec:** `docs/superpowers/specs/2026-11-19-privacidad-llm-design.md`

## Global Constraints

- Commits en español con códigos `RF-27` y `RNF-13` (y `RN-13` donde corresponda).
- La regla de dependencia apunta al dominio: `src/dominio/asistencia/privacidad.ts` es puro (sin imports de Prisma, Next ni infraestructura) y se prueba con `npm run test:dominio`.
- No modificar los casos de uso de negocio (`listarUsuarios`, `verMorosidad`, `historialDeReservas`, `listarReclamos`, `verReclamo`, etc.): las pantallas web siguen mostrando a cada rol exactamente lo que corresponde.
- Preservar campos legítimos llamados `nombre` (`consorcio.nombre`, `espacio.nombre`, `rubro.nombre`), `proveedor.razonSocial`, `proveedor.cuit` (personas jurídicas, prefijos `30/33/34`), `designacion` (`"3° B"`), fechas ISO e importes monetarios.
- **No introducir nombres de producto** (Gemini, Prisma, Next.js) en `docs/entrega-1/` a `docs/entrega-3/` (`CLAUDE.md`).
- Antes de cerrar: `npx prettier --write .`, `npm run verificar` y `npm audit --omit=dev --audit-level=high`.

## Review Focus

1. **Todas las operaciones del chat siguen intactas:** reservar (`crear_reserva`), cancelar (`cancelar_reserva`), crear/transicionar/vincular reclamo, asignar reclamo al admin en sesión con proveedor/rubro, publicar novedades, gestionar espacios, proveedores y reglamentos.
2. **Cero fuga de PII en herramientas de administrador:** los valores canario (nombre, apellido, correo, teléfono, DNI) no aparecen ni en el historial enviado al doble de `AgenteConversacional` ni en `MensajeAsistente.contenido` (`rol: 'herramienta'`).
3. **Sin falsos positivos en `redactarContactoEnTexto`:** no altera importes (`"$ 45.000,00"`), fechas (`"2026-10-22T15:00"`), designaciones (`"3° B"`, `"PB 1"`) ni CUIT jurídico (`"30-71234567-9"`).
4. **Coherencia documental:** `CLAUDE.md`, `07-analisis-de-datos.md`, `12-diseno.md`, `14-codificacion.md` y `18-seguridad.md` reflejan la misma política sin contradicciones ni marcas en entregas 1–3.

---

### Task 1: Módulo puro de privacidad en dominio y pruebas unitarias

**Files:**
- Create: `src/dominio/asistencia/privacidad.ts`
- Create: `pruebas/dominio/privacidad-llm.spec.ts`

**Interfaces:**
```ts
export const CLAVES_PII: ReadonlySet<string>
export function redactarContactoEnTexto(texto: string): string
export function sanitizarParaModelo<T>(valor: T): T
```

- [ ] **Step 1: Escribir las pruebas unitarias que fallan**

  En `pruebas/dominio/privacidad-llm.spec.ts`:
  - `redactarContactoEnTexto`:
    - Redacta correos electrónicos (`"Escribir a juan.perez@ejemplo.com"` → `"[correo omitido]"`).
    - Redacta CUIL/CUIT de persona física (`20-38123456-7`, `27-30111222-4`) y DNI con formato (`DNI 38.123.456`, `38.123.456`) → `"[documento omitido]"`.
    - Redacta teléfonos argentinos (`+54 9 341 555-0199`, `0341-4551234`, `15 6123-4567`) → `"[teléfono omitido]"`.
    - **Preserva** importes (`"$ 145.320,50"`), fechas (`"2026-11-19T15:00:00-03:00"`), designaciones (`"3° B"`, `"Cochera 12"`), CUIT de persona jurídica (`"30-71234567-9"`) y números de factura (`"0001-00004512"`).
  - `sanitizarParaModelo`:
    - Reemplaza URLs `http(s)://` por `null` (compatibilidad con `sinEnlaces`).
    - Elimina recursivamente en objetos y arreglos anidados todas las claves en `CLAVES_PII`: `correo`, `email`, `telefono`, `celular`, `dni`, `documento`, `cuil`, `apellido`, `personaId`, `usuarioId`, `solicitante`, `autor`, `responsable`, `responsableId`, `ocupantes`, `ocupante`, `titular`, `creadoPor`, `reservadoPor`.
    - Preserva `consorcio.nombre`, `espacio.nombre`, `rubro.nombre`, `proveedor.razonSocial`, `proveedor.cuit`, `designacion`, `saldo`, `Date`.
    - Aplica `redactarContactoEnTexto` a cadenas de texto libre (ej. `descripcion` de reclamo).

- [ ] **Step 2: Correr `npm run test:dominio` y ver que falla**

  Run: `npx vitest run --project dominio pruebas/dominio/privacidad-llm.spec.ts`
  Expected: FAIL, `@/dominio/asistencia/privacidad` no existe.

- [ ] **Step 3: Implementar `src/dominio/asistencia/privacidad.ts`**

  Implementar `CLAVES_PII`, `redactarContactoEnTexto` y `sanitizarParaModelo` con expresiones regulares acotadas y sin dependencias externas.

- [ ] **Step 4: Verificar que las pruebas unitarias pasan**

  Run: `npx vitest run --project dominio pruebas/dominio/privacidad-llm.spec.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git add src/dominio/asistencia/privacidad.ts pruebas/dominio/privacidad-llm.spec.ts`
  `git commit -m "feat(dominio): módulo de sanitización de PII para proveedores de IA (RF-27, RNF-13)"`

---

### Task 2: Doble barrera en el asistente (`base.ts`, `lectura.ts`, `escritura.ts`, `conversar.ts`, `enlaces.ts`, `determinista.ts`, `gemini.ts`)

**Files:**
- Modify: `src/aplicacion/asistente/base.ts`
- Modify: `src/aplicacion/asistente/lectura.ts`
- Modify: `src/aplicacion/asistente/escritura.ts`
- Modify: `src/aplicacion/asistente/conversar.ts`
- Modify: `src/app/(panel)/asistente/enlaces.ts`
- Modify: `src/infraestructura/asistencia/determinista.ts`
- Modify: `src/infraestructura/asistencia/gemini.ts`

- [ ] **Step 1: Actualizar `src/aplicacion/asistente/base.ts`**

  - Reemplazar `sinEnlaces` por `sanitizarParaModelo` importado de `@/dominio/asistencia/privacidad` (re-exportarlo si hace falta).
  - Actualizar el comentario de cabecera dejando explícita la regla de no-PII (RNF-13, § 5.3.2, § 7.8).
  - En `generico(paraUI)`: `paraModelo: sanitizarParaModelo(paraUI)`.

- [ ] **Step 2: Actualizar `src/aplicacion/asistente/lectura.ts`**

  - Eliminar `ver_usuarios` (y el import sin uso de `listarUsuarios`) y `ver_responsables` (y el import sin uso de `posiblesResponsables`).
  - Agregar soporte opcional de proyector en `lec(...)` o helpers explícitos para las lecturas que contienen datos de personas:
    - `ver_morosidad`: omitir `ocupantes` en cada unidad morosa.
    - `ver_historial_reservas`: omitir `solicitante` en cada reserva.
    - `ver_reclamos` y `ver_reclamo`: omitir `autor`, `responsable`, `responsableId` y actores nominados del historial de cambios.
  - Auditar el resto de lecturas (`ver_padron`, `ver_liquidacion`, `ver_vista_previa_liquidacion`, `ver_expensas`, `ver_estado_cuenta`, `ver_novedades`, `ver_bandeja`, `ver_resumen`, `ver_panel_cartera`) para confirmar que ninguna incluya nombres/correos/teléfonos de personas.

- [ ] **Step 3: Ajustar `asignar_reclamo` en `src/aplicacion/asistente/escritura.ts`**

  - Quitar `responsableId` del esquema Zod `AsignarReclamo` y de `parametros`.
  - Actualizar descripción: `'Asigna un reclamo al administrador en sesión y opcionalmente lo vincula con un proveedor y un rubro. Requiere reclamoId.'`
  - En `resumir`: no llamar a `posiblesResponsables` ni mostrar nombres de personas; si hay `proveedorId`, buscar la razón social del proveedor (o redactar `"Asignarte el reclamo \"...\""`).
  - En `confirmar`: pasar `responsableId: ctx.usuarioId`.
  - Quitar el import sin uso de `posiblesResponsables`.

- [ ] **Step 4: Reforzar la frontera en `src/aplicacion/asistente/conversar.ts`**

  - Aplicar `sanitizarParaModelo(res.paraModelo)` antes de `JSON.stringify` y antes de persistir en `prisma.mensajeAsistente.create` (`rol: 'herramienta'`), como red de contención garantizada incluso para herramientas personalizadas (ej. `ejecutarEnAbanico` o nuevas herramientas futuras).

- [ ] **Step 5: Limpiar referencias a `ver_usuarios` y actualizar prompt en `gemini.ts`**

  - Quitar `ver_usuarios` de `src/app/(panel)/asistente/enlaces.ts` y `src/infraestructura/asistencia/determinista.ts`.
  - En `src/infraestructura/asistencia/gemini.ts` (`agente.conversar`), sumar la regla al `sistema`:
    `"- No tenes acceso a datos personales de consorcistas (nombres, correos, telefonos, DNI ni nomina de usuarios). Si te preguntan por alguien por nombre o piden ver usuarios, explica brevemente que por proteccion de datos personales eso se consulta directamente en la pantalla de Usuarios, Padron o Morosidad."`

- [ ] **Step 6: Correr `npm run typecheck` y `npm run lint`**

  Run: `npm run typecheck && npm run lint`
  Expected: PASS sin errores ni warnings de imports sin uso.

- [ ] **Step 7: Commit**

  `git add src/aplicacion/asistente/ src/app/(panel)/asistente/enlaces.ts src/infraestructura/asistencia/determinista.ts src/infraestructura/asistencia/gemini.ts`
  `git commit -m "feat(asistente): proyectar y sanitizar PII antes del LLM y retirar ver_usuarios/ver_responsables (RF-27, RNF-13)"`

---

### Task 3: Redacción de contacto en las demás interfaces de IA y contratos de dominio

**Files:**
- Modify: `src/aplicacion/asambleas/acta.ts`
- Modify: `src/aplicacion/reclamos/sugerencia.ts`
- Modify: `src/dominio/contratos/asistencia.ts`

- [ ] **Step 1: Aplicar `redactarContactoEnTexto` en `acta.ts` y `sugerencia.ts`**

  - En `src/aplicacion/asambleas/acta.ts` (`manejadorBorradorActa`): pasar `observaciones.map((o) => redactarContactoEnTexto(o.texto))` a `redactor.redactar(...)`.
  - En `src/aplicacion/reclamos/sugerencia.ts`: pasar título y descripción del reclamo por `redactarContactoEnTexto` antes de invocar `clasificador.clasificar(...)`.

- [ ] **Step 2: Documentar el contrato de no-PII en `src/dominio/contratos/asistencia.ts`**

  - Dejar asentado en el comentario de cabecera del contrato `Asistencia` que ninguna de las siete interfaces puede recibir PII de personas físicas (RNF-13, § 5.3.2, § 7.8).

- [ ] **Step 3: Verificar `npm run typecheck` y `npm run test:dominio`**

  Run: `npm run typecheck && npm run test:dominio`
  Expected: PASS.

- [ ] **Step 4: Commit**

  `git add src/aplicacion/asambleas/acta.ts src/aplicacion/reclamos/sugerencia.ts src/dominio/contratos/asistencia.ts`
  `git commit -m "feat(asistencia): redactar datos de contacto en actas y triage de reclamos (RNF-13)"`

---

### Task 4: Pruebas de integración «canario» y regresión del asistente

**Files:**
- Modify: `pruebas/integracion/asistente.spec.ts`

- [ ] **Step 1: Actualizar el test existente de abanico que usaba `ver_usuarios`**

  - En `pruebas/integracion/asistente.spec.ts` (alrededor de la línea 450), reemplazar `'ver_usuarios'` por otra lectura exclusiva de administrador que siga vigente (por ejemplo `'ver_extracciones'` o `'ver_indicador_carga'`), manteniendo la misma aserción de que en el abanico se saltea el consorcio donde el rol es `consorcista`.

- [ ] **Step 2: Agregar la suite «Privacidad hacia el LLM (canario PII)» en `pruebas/integracion/asistente.spec.ts`**

  - Verificar que `herramientasPara(['administrador'])` **no** incluye `ver_usuarios` ni `ver_responsables`, y **sí** incluye `crear_reserva`, `cancelar_reserva`, `crear_reclamo`, `asignar_reclamo`, `transicionar_reclamo`, `publicar_novedad`.
  - Sembrar un consorcio con un propietario y un inquilino con valores canario únicos:
    - Nombre/apellido: `'Zulema Canario'` / `'Braulio Testigo'`
    - Correo: `'zulema.canario@ejemplo.test'`
    - Teléfono: `'+54 9 341 555-0199'`
    - Documento: `'38.999.111'`
  - Sembrar sobre esa unidad: deuda morosa (liquidación emitida vencida), una reserva (para `ver_historial_reservas`) y un reclamo (con correo/teléfono embebido en la descripción).
  - Usar un doble espía de `AgenteConversacional` que capture cada `historial` recibido en `conversar(...)`.
  - Invocar como `administrador`: `ver_morosidad`, `ver_historial_reservas`, `ver_reclamos`, `ver_reclamo`, `ver_padron`, `ver_liquidacion`.
  - **Aserciones:**
    - Ninguno de los valores canario aparece en el historial serializado que recibió el agente.
    - Ninguno de los valores canario aparece en `MensajeAsistente.contenido` para `rol: 'herramienta'`.
    - Las designaciones de unidad (`'1° A'`), importes y títulos de reclamo **sí** llegan al modelo (el asistente sigue operando normalmente).
  - Verificar que `asignar_reclamo` crea propuesta y confirma usando `administrador` (`ctx.usuarioId`) sin recibir `responsableId` del modelo.

- [ ] **Step 3: Correr las pruebas de integración del asistente**

  Run: `npx vitest run --project integracion pruebas/integracion/asistente.spec.ts`
  Expected: PASS completo.

- [ ] **Step 4: Commit**

  `git add pruebas/integracion/asistente.spec.ts`
  `git commit -m "test(asistente): pruebas canario de no envío de PII al LLM y regresión de herramientas (RF-27, RNF-13)"`

---

### Task 5: Documentación, invariantes y verificación completa

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/entrega-3/07-analisis-de-datos.md`
- Modify: `docs/entrega-3/12-diseno.md`
- Modify: `docs/entrega-final/14-codificacion.md`
- Modify: `docs/entrega-final/18-seguridad.md`

- [ ] **Step 1: Actualizar `CLAUDE.md`**

  - Agregar el **invariante n.º 8** en *Invariantes que no se negocian*: prohibición de enviar PII de personas físicas (nombres y apellidos, correos, teléfonos, DNI/CUIL, `personaId`/`usuarioId`, enlaces firmados) a proveedores externos de IA (RNF-13, § 5.3.2, § 7.8); exigencia de proyección por herramienta + `sanitizarParaModelo()` + pruebas canario.

- [ ] **Step 2: Actualizar `docs/entrega-3/07-analisis-de-datos.md` (§ 7.8) y `docs/entrega-3/12-diseno.md`**

  - En `07-analisis-de-datos.md` § 7.8: ampliar el párrafo final para incluir explícitamente al asistente conversacional (RF-27) y la redacción asistida de actas (solo unidades funcionales, estados, fechas y montos/agregados; nunca nombres de personas, datos de contacto ni nóminas de usuarios). **Sin nombres de producto.**
  - En `12-diseno.md`: asentar la frontera de privacidad de CU-16 / RF-27 en la capa de aplicación (proyección y saneamiento antes del servicio de lenguaje, exclusión de la nómina de usuarios). **Sin nombres de producto.**

- [ ] **Step 3: Actualizar `docs/entrega-final/14-codificacion.md` y `docs/entrega-final/18-seguridad.md`**

  - En `14-codificacion.md`: documentar `src/dominio/asistencia/privacidad.ts`, la doble barrera en `src/aplicacion/asistente/`, el retiro de `ver_usuarios`/`ver_responsables`, la redacción en actas/triage y las pruebas canario.
  - En `18-seguridad.md` (§ 18.4 y matriz de controles): agregar el control verificado de minimización y exclusión de PII hacia la API de Gemini conforme a la Ley 25.326 (arts. 4 y 9) y RNF-13.

- [ ] **Step 4: Formatear y correr la puerta única completa**

  Run: `npx prettier --write .`
  Run: `npm run verificar`
  Run: `npm run docs:versiones`
  Run: `npm audit --omit=dev --audit-level=high`
  Expected: todo en verde.

- [ ] **Step 5: Commit de documentación**

  `git add CLAUDE.md docs/entrega-3/07-analisis-de-datos.md docs/entrega-3/12-diseno.md docs/entrega-final/14-codificacion.md docs/entrega-final/18-seguridad.md`
  `git commit -m "docs(seguridad): asentar invariante de no envío de PII a proveedores de IA (RF-27, RNF-13)"`
