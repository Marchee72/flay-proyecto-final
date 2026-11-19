# Privacidad hacia proveedores externos de IA (sin PII al LLM) — diseño

## Por qué

La documentación de Flay ([05-analisis-factibilidad.md](../../entrega-2/05-analisis-factibilidad.md)
§ 5.3.2 y [07-analisis-de-datos.md](../../entrega-3/07-analisis-de-datos.md) § 7.8) establece, en
cumplimiento de la Ley N.º 25.326 (RNF-13), que **los datos personales de los consorcistas no se envían
a servicios externos de procesamiento**.

En la implementación actual del asistente conversacional (RF-27, CU-16), la regla de `paraModelo` en
`src/aplicacion/asistente/base.ts` solo elimina enlaces firmados (`sinEnlaces`) y envía al proveedor
de IA el resto de la salida que ve la interfaz para el rol autenticado. Cuando consulta un
administrador o un miembro del consejo, eso expone al LLM externo nombres y apellidos de personas,
correos electrónicos, teléfonos, ocupantes y solicitantes (por ejemplo vía `ver_usuarios`,
`ver_morosidad`, `ver_historial_reservas`, `ver_reclamos`, `ver_reclamo` y `ver_responsables`).

Este diseño cierra esa brecha con una barrera técnica verificable y deja la restricción asentada como
invariante en el repositorio y en los documentos del proyecto.

## Objetivos

- Ningún dato personal identificatorio (PII) de personas físicas —**nombre y apellido, correo
  electrónico, teléfono, DNI/CUIL, domicilio particular ni `personaId`/`usuarioId`**— sale hacia un
  proveedor externo de IA.
- El asistente conversacional sigue siendo útil operando con entidades del edificio: nombre y dirección
  del consorcio, designación de unidad funcional (`"3° B"`), espacios comunes, rubros, períodos,
  estados, fechas, montos y razón social/CUIT de proveedores (personas jurídicas).
- Las herramientas cuyo fin es listar personas físicas (`ver_usuarios`, `ver_responsables`) se retiran
  del asistente y se derivan a las pantallas del panel.
- Las demás interfaces de IA del sistema (`RedactorActa`, `ClasificadorTexto`, `ExtractorDocumental`,
  `LectorDeConfiguracion`, `GeneradorVectores`, `GeneradorRespuesta`) quedan auditadas bajo el mismo
  principio, redactando patrones de contacto en textos libres antes de salir al proveedor.
- Pruebas automatizadas («canario») garantizan que ninguna regresión futura vuelva a filtrar PII al
  modelo.
- La regla queda documentada como invariante en `CLAUDE.md` y reflejada en los documentos de análisis,
  diseño, codificación y seguridad.

## Fuera de alcance

- Seudonimización reversible (`Persona #1` → rehidratación en UI): agrega superficie de error y no es
  necesaria porque el panel web ya ofrece las vistas completas de Usuarios, Padrón y Morosidad.
- Bloquear montos o saldos por unidad funcional (el consorcista y el administrador siguen pudiendo
  consultar cuánto adeuda la unidad `"3° B"`, sin nombre ni contacto del ocupante).
- Detección semántica por NER de nombres propios escritos libremente por el usuario en el chat (se
  cubren patrones estructurados de contacto —correo, DNI/CUIL, teléfono— y todos los campos
  estructurados del sistema).

## Anti-objetivos

- Modificar las firmas o los resultados de los ~25 casos de uso de negocio para «anonimizar» la
  interfaz web: las pantallas del panel siguen mostrando a cada rol exactamente lo que corresponde.
- Romper campos legítimos llamados `nombre` (como `consorcio.nombre`, `espacio.nombre`,
  `rubro.nombre`) por aplicar una lista negra ciega sin proyección.
- Introducir nombres de producto (Gemini, Prisma, Next.js) en `docs/entrega-1/` a `docs/entrega-3/`.

## Enfoques considerados

- **A. Doble barrera: proyección explícita por herramienta + sanitizador estructural en la frontera +
  tests canario (elegido).** Resuelve la ambigüedad de campos homónimos (`espacio.nombre` vs.
  `persona.nombre`), protege ante herramientas futuras que olviden proyectar, no contamina los casos de
  uso de negocio y es verificable automáticamente.
- **B. Solo lista negra genérica en `base.ts`:** rápida, pero frágil ante claves genéricas como
  `nombre` o cambios de forma en las respuestas de los casos de uso.
- **C. Bandera `anonimizar` en cada caso de uso de negocio:** acopla la lógica de aplicación a una
  preocupación exclusiva del proveedor externo de IA.

## Diseño

### 1. Módulo de privacidad y frontera común

Se introduce un módulo puro en `src/dominio/asistencia/privacidad.ts` (sin dependencias de
infraestructura ni base de datos, probado por `npm run test:dominio` y reutilizable desde cualquier
caso de uso de `src/aplicacion/`):

- **`redactarContactoEnTexto(texto: string): string`**: reemplaza patrones de correo electrónico
  (`[correo omitido]`), CUIL/CUIT de persona física (`20/23/24/27-xxxxxxxx-x`) o DNI con formato
  (`[documento omitido]`) y teléfonos (`[teléfono omitido]`) dentro de cadenas de texto libre, sin
  alterar designaciones de unidad (`"3° B"`), fechas ISO, importes monetarios (`"$ 45.000,00"`) ni
  CUIT de personas jurídicas (`30/33/34-...`).
- **`sanitizarParaModelo<T>(valor: T): T`** (reemplaza a `sinEnlaces` en
  `src/aplicacion/asistente/base.ts`):
  1. Anula cualquier URL `http(s)://` (credenciales temporales / enlaces firmados).
  2. Elimina recursivamente de cualquier objeto toda clave reservada de PII: `correo`, `email`,
     `telefono`, `celular`, `dni`, `documento`, `cuil`, `apellido`, `personaId`, `usuarioId`,
     `solicitante`, `autor`, `responsable`, `responsableId`, `ocupantes`, `ocupante`, `titular`,
     `creadoPor`, `reservadoPor`.
  3. Aplica `redactarContactoEnTexto` a las cadenas resultantes.
- En `src/aplicacion/asistente/conversar.ts`, `sanitizarParaModelo` se aplica como red de contención
  sobre `res.paraModelo` **antes** de serializarlo a JSON, antes de guardarlo en `MensajeAsistente`
  (`rol: 'herramienta'`) y antes de incorporarlo al historial enviado al modelo.

### 2. Cambios en herramientas del asistente (`src/aplicacion/asistente/`)

- **Herramientas eliminadas:**
  - `ver_usuarios`: se quita de `lectura.ts`, `src/app/(panel)/asistente/enlaces.ts` y
    `src/infraestructura/asistencia/determinista.ts`.
  - `ver_responsables`: se quita de `lectura.ts`.
- **Herramienta ajustada (`escritura.ts`):**
  - `asignar_reclamo`: deja de pedir `responsableId` al modelo. Acepta `{ reclamoId, proveedorId?,
    rubroId? }` y fija automáticamente `responsableId = ctx.usuarioId` (el administrador autenticado).
    `resumir()` arma el texto sin nombres de personas (p. ej. *«Asignarte el reclamo "…" y vincularlo
    con el proveedor …»*). Si el administrador necesita asignar el reclamo a otro integrante, el
    asistente indica hacerlo desde la pantalla de Reclamos.
- **Proyectores explícitos en `lectura.ts` (Capa 1):**
  - `ver_morosidad`: proyecta cada fila omitiendo `ocupantes`; conserva `unidadId`, `designacion`,
    saldos, períodos adeudados y totales.
  - `ver_historial_reservas`: proyecta cada reserva omitiendo `solicitante`; conserva `id`, `espacio`,
    `unidad`, `desde`, `hasta`, `estado`.
  - `ver_reclamos` y `ver_reclamo`: proyectan omitiendo `autor`, `responsable`, `responsableId` y
    actores nominados del historial; conservan `id`, `titulo`, `descripcion`, `estado`, `urgencia`,
    `alcance`, `unidad`, `proveedor`, `rubro`, `propio`, fechas y transiciones de estado.
  - El resto de lecturas (`ver_padron`, `ver_liquidacion`, `ver_vista_previa_liquidacion`,
    `ver_expensas`, `ver_expensa`, `ver_estado_cuenta`, `ver_novedades`, `ver_bandeja`, `ver_resumen`,
    `ver_panel_cartera`, `ver_gastos`, `ver_gasto`, `ver_proveedores`, `ver_documentos`,
    `ver_documento`, indicadores) se auditan al implementar y pasan todas por `sanitizarParaModelo()`.

### 3. Prompt del sistema (`src/infraestructura/asistencia/gemini.ts`)

Se suma una regla en la instrucción del sistema de `agente.conversar`:
- El asistente no tiene acceso a datos personales de consorcistas (nombres, correos, teléfonos, DNI ni
  nómina de usuarios). Ante cualquier pedido que requiera identificar personas o listar usuarios, indica
  brevemente que por protección de datos personales eso se consulta directamente en la pantalla
  correspondiente del panel (Usuarios, Padrón o Morosidad).

### 4. Auditoría de las otras 6 interfaces de IA

- **`RedactorActa` (`src/aplicacion/asambleas/acta.ts`):** ya excluye personas, unidades y votos; se
  aplica `redactarContactoEnTexto` sobre cada elemento de `observaciones` antes de invocar `redactar`.
- **`ClasificadorTexto` (triage de reclamos):** se aplica `redactarContactoEnTexto` al texto del
  reclamo antes de enviarlo al clasificador.
- **`ExtractorDocumental`, `LectorDeConfiguracion`, `GeneradorVectores`, `GeneradorRespuesta`:**
  operan sobre comprobantes, reglamentos, actas y contratos (nunca nóminas ni deudas). Se deja
  asentado el contrato de no-PII en `src/dominio/contratos/asistencia.ts`.

### 5. Estrategia de pruebas

1. **Pruebas unitarias (`pruebas/dominio/` — sin base de datos):**
   - `sanitizarParaModelo`: elimina URLs `http(s)://`, borra todas las claves PII en objetos y arreglos
     anidados, redacta correos/DNI/teléfonos en strings y preserva `consorcio.nombre`,
     `espacio.nombre`, `proveedor.razonSocial`, `designacion` (`"3° B"`), fechas ISO e importes.
   - `redactarContactoEnTexto`: casos positivos (email, teléfono argentino, DNI/CUIL) y negativos
     (importes, fechas, designaciones de unidad, números de factura).
2. **Pruebas de integración «canario» (`pruebas/integracion/asistente.spec.ts`):**
   - Se siembra un consorcio con personas cuyos datos son valores canario únicos (nombre, apellido,
     correo, teléfono, DNI), con deuda morosa, reserva y reclamo.
   - Se ejecutan como `administrador` las lecturas críticas (`ver_morosidad`, `ver_historial_reservas`,
     `ver_reclamos`, `ver_reclamo`, `ver_padron`, `ver_liquidacion`) interceptando el historial exacto
     que recibe el doble de `AgenteConversacional`.
   - Aserción estricta: ningún valor canario aparece en los mensajes entregados al modelo ni en
     `MensajeAsistente.contenido` para `rol: 'herramienta'`.
   - Se verifica que `ver_usuarios` y `ver_responsables` no figuren en `herramientasPara(['administrador'])`
     y que `asignar_reclamo` funcione sin `responsableId`.
   - Se actualiza el test existente en `pruebas/integracion/asistente.spec.ts` que invocaba
     `ver_usuarios` en modo cartera para usar otra lectura de administrador permitida.

### 6. Documentación e invariantes a actualizar

1. **`CLAUDE.md`:** agregar el **invariante n.º 8** en *Invariantes que no se negocian* estableciendo
   la prohibición de enviar PII a proveedores externos de IA (RNF-13, § 5.3.2, § 7.8) y la exigencia de
   proyección + `sanitizarParaModelo()` + pruebas canario.
2. **`docs/entrega-3/07-analisis-de-datos.md` (§ 7.8):** ampliar la cláusula de no envío de datos
   personales a servicios externos para cubrir explícitamente al asistente conversacional (RF-27) y la
   redacción asistida de actas (sin nombres de producto).
3. **`docs/entrega-3/12-diseno.md`:** documentar la frontera de privacidad de CU-16 / RF-27 en la capa
   de aplicación (proyección y saneamiento antes del servicio de lenguaje, exclusión de nómina de
   usuarios, sin nombres de producto).
4. **`docs/entrega-final/14-codificacion.md`:** documentar la implementación de la doble barrera
   (`sanitizarParaModelo`, proyectores en `lectura.ts`, exclusión de `ver_usuarios`/`ver_responsables`,
   redacción de patrones de contacto y pruebas canario).
5. **`docs/entrega-final/18-seguridad.md` (§ 18.4 y matriz de controles):** registrar el control técnico
   verificado de exclusión de PII hacia la API de Gemini conforme a la Ley 25.326 (arts. 4 y 9) y
   RNF-13.
