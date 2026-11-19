# Archivado y trazabilidad: espacios comunes, documentos y consorcios — diseño

> Fecha: 2026-11-19. Rama sugerida: `feat/archivado`. Trazabilidad: RF-15 (espacios), RF-19
> (documentos), alta de consorcio (FR-007b), RN-15 (auditoría), RNF-10 (mensajes), RNF-13.

## 1. Intención y por qué

El sistema tiene que conservar la historia de lo que administra **por obligación legal**. No hay una
ley de «trazabilidad de software»; la obligación sale del deber de conservar documentación:

- **CCyC art. 2067**: el administrador lleva los libros, rinde cuentas documentadas y, al cesar
  (inc. j), entrega libros y documentación al consorcio.
- **CCyC art. 328**: libros y documentación respaldatoria se conservan **diez años**.
- **Ley 941 CABA, art. 9 f)**: conservar la documentación del consorcio y garantizar el acceso de los
  consorcistas a ella (referencia de práctica; Rosario tiene registro de administradores, Ord. 9008,
  sin plazo de conservación propio).
- **Ley 25.326** empuja en sentido contrario para datos personales: por eso se conserva lo que tiene
  historia, no indiscriminadamente, y lo cargado por error sí se borra.

Hoy tres cosas contradicen eso:

| Entidad | Hoy |
|---|---|
| `EspacioComun` | `eliminarEspacio` (`src/aplicacion/reservas/espacios.ts:452`) borra el espacio **y todas sus reservas** y tramos. `EspacioComun` no tiene disparador de auditoría. |
| `DocumentoConsorcio` | `eliminarDocumento` (`src/aplicacion/comunicacion/documentos.ts:351`) borra la fila **y el archivo del almacén**. Sin auditoría. |
| `Consorcio` | No existe ninguna forma de darlo de baja (verificado en `main` y en todas las ramas remotas). |

## 2. Objetivos

1. **Espacio común y consorcio**: «Eliminar» decide solo:
   - **sin nada cargado** → borrado definitivo (lo cargado por error);
   - **con historia** → se **archiva**.
2. **Documento**: «Eliminar» **siempre archiva**; el archivo no se borra del almacén.
3. Cada sección afectada tiene su vista **Eliminados** (archivados), desde donde se **restaura**.
4. Un consorcio archivado queda **en solo lectura para todos**: se ve su historia, no se opera.
5. `EspacioComun` y `DocumentoConsorcio` quedan auditados por `fn_auditar()` (RN-15).

### No objetivos

- Archivar otras entidades. Revisado y descartado: gasto en período abierto (se borra, queda en la
  bitácora; es corrección previa a liquidar), acceso de usuario (ya es lógico con `vigenciaHasta`),
  asamblea en borrador (nunca tuvo efecto), unidad (ya es lógica con `bajaDesde`).
- Purga automática a los diez años.
- Exportar/entregar el consorcio a otra administradora (art. 2067 j). Queda para otra vez.

### Anti-objetivos

- Que algo con historia desaparezca sin rastro.
- Que un consorcio archivado acepte una escritura por **alguna** ruta (pantalla, asistente, cola,
  webhook de pagos).
- Que un consorcista pierda acceso a sus propios comprobantes porque se archivó el consorcio.

## 3. Reglas de negocio

Se agrega **RN-22** en `docs/entrega-3/07-analisis-de-datos.md` § 7.2: *«Un espacio común, un
documento o un consorcio con historia no se borra: se archiva. Solo se borra definitivamente lo que
nunca tuvo movimiento.»*

### 3.1 Qué cuenta como «nada» (decidido con el usuario)

- **Espacio común**: nunca tuvo una `Reserva`, en ningún estado. Sus `SuspensionEspacio` se borran
  con él.
- **Consorcio**: no tiene **movimiento**: ni `Periodo`, `Gasto`, `Liquidacion`, `Pago`, `Reclamo`,
  `Reserva`, `Asamblea`, `DocumentoConsorcio` ni `Novedad`. Lo que no es movimiento se borra con él:
  padrón (`Unidad`, `CoeficienteHistorico`, ocupaciones), `EspacioComun` + `SuspensionEspacio`,
  `Proveedor`, `TramoVencimiento`, `Habilitacion`, y lo que cuelgue sin ser movimiento.
- **Documento**: nunca cuenta como «nada»; siempre se archiva.

La bitácora conserva igual el alta y la baja del borrado definitivo (los disparadores existentes más
los dos nuevos).

### 3.2 Espacio común archivado

- Sale de la lista de Espacios, de reservar y del asistente (`ver_espacios` usa `listarEspacios`).
- Las reservas futuras confirmadas se cancelan con aviso al archivar, como hoy al eliminar. El
  historial de reservas se conserva y sigue mostrando el nombre del espacio.
- Es distinto de **deshabilitar** (`activo = false` + `SuspensionEspacio`): deshabilitar es temporal
  y el espacio sigue a la vista; archivar lo saca de escena.
- El nombre sigue ocupado (`@@unique([consorcioId, nombre])` se mantiene). Dar de alta uno homónimo
  falla con un mensaje que ofrece restaurar el archivado.
- Una sugerencia de configuración cuyo nombre coincide con un espacio archivado se trata igual que
  con uno inactivo: no aplicable (nota 33 de `CLAUDE.md`).
- Restaurar: vuelve a la lista con su configuración. Las reservas canceladas no se reviven.

### 3.3 Documento archivado

- Sale de Documentación, de la consulta documental (RF-20), de «Buscar configuración» y del
  asistente (`ver_documentos`/`ver_documento`).
- El objeto en el almacén **no se borra**; los `FragmentoDocumento` tampoco (así restaurar no
  reindexa). La búsqueda vectorial (`buscarFragmentos`) excluye los de documentos archivados en su
  `WHERE`, antes del `ORDER BY`.
- Solo el administrador ve *Eliminados* de Documentación, y desde ahí ve, descarga y restaura.
- El acta firmada de una asamblea sigue sin poder archivarse (`DocumentoDeActa`).
- Si un trabajo de cola (`indexar_documento`, `sugerir_configuracion`) encuentra el documento
  archivado, termina sin hacer nada.

### 3.4 Consorcio archivado — solo lectura (opción A, elegida)

- Sale de la lista principal de consorcios y aparece en una sección **Archivados** de esa misma
  lista, para todos los que tienen acceso (administrador, consejo, consorcistas).
- Dentro del consorcio, un `.aviso` fijo (nota 25): «Este consorcio está archivado desde el
  dd/mm/aaaa. Podés consultar su historia, pero no operar.»
- Ninguna escritura prospera sobre sus datos. La pantalla no ofrece acciones de escritura, pero la
  garantía es la base (§ 4.2).
- Restaurar: todo vuelve como estaba; los accesos nunca se tocaron. Las reservas canceladas al
  archivar no se reviven.

**Condiciones al archivar** (decidido con el usuario):

| Situación | Efecto |
|---|---|
| Intento de pago en línea abierto (no confirmado y dentro de `venceEn` + 72 h, la ventana de conciliación de la nota 29) | **Bloquea.** El modal lo dice: «Hay n pagos en línea sin confirmar; podés archivar cuando terminen». Sin esto, un pago ya cobrado por la pasarela rebotaría contra el candado y quedaría sin registrar. |
| Asamblea convocada o en curso | **Bloquea.** No se congela una votación a medio camino. |
| Reservas futuras confirmadas | **Se cancelan con aviso**, en la misma transacción, antes de marcar `archivado_en`. |
| Deuda impaga, período abierto | **No bloquean.** Quedan como historia: el consorcista ve lo que debía, pero ya no puede pagarlo por el sistema. |

Las verificaciones de bloqueo y el marcado corren en una transacción con `SELECT … FOR UPDATE`
sobre el `Consorcio`, para que no se cuele un intento de pago entre la verificación y el archivado.
`iniciarPagoEnLinea` debe tomar el mismo candado en modo compartido (o leer `archivado_en` bajo él):
el disparador ya rechaza crear el `IntentoDePago` de un consorcio archivado.
- Lo archiva, borra y restaura **quien da de alta consorcios**: el mismo nivel de
  `conAutorizacionDeAdministradora` que usa `alta-consorcio.ts`.

## 4. Enfoque elegido y alternativas

### 4.1 Alternativas consideradas

1. **Candado en la base + filtro explícito** — *elegida*. Columna `archivado_en` en las tres tablas;
   un disparador en las tablas con `consorcio_id` rechaza escrituras de un consorcio archivado; las
   lecturas filtran `archivadoEn: null` a mano, como `bajaDesde` en unidades (nota 23). Es el patrón
   de las asambleas (nota 30) y ninguna ruta lo esquiva. Costo: un filtro olvidado muestra un
   espacio archivado, molesto pero sin cruzar consorcios.
2. **Todo en la aplicación**: `conAutorizacion` con `escribe: true` en cada caso de uso y la
   extensión de Prisma ocultando lo archivado. Descartada: olvidar la marca es un agujero, el webhook
   y la cola no pasan por ahí, y el filtro automático obliga a una salida de escape para la propia
   vista *Eliminados*.
3. **Seguridad por fila de Postgres**: descartada, desproporcionada para un único estado.

### 4.2 El candado

- Nueva función `fn_consorcio_no_archivado()` (`BEFORE INSERT OR UPDATE OR DELETE`, `FOR EACH ROW`):
  si el `consorcio_id` de la fila (`NEW` o `OLD`) pertenece a un consorcio con `archivado_en IS NOT
  NULL`, `RAISE EXCEPTION 'FLAY: …'`, con el formato que ya traduce
  `traducirErrorDeBase` (`src/aplicacion/asambleas/errores.ts:227`). El mensaje se traduce a un
  error de aplicación `ConsorcioArchivado` con texto legible (RNF-10).
- Se aplica a las tablas con `consorcio_id`, **excepto** las que registran lecturas o gestionan
  acceso, para que la solo lectura siga funcionando:
  - `ConversacionAsistente` y `ConsultaDocumental` (usar el asistente o la consulta documental es
    leer, aunque escriba su propio registro);
  - `Habilitacion` (gestionar quién accede no es operar el consorcio);
  - `Notificacion` (marcar un aviso como leído no es operar; sin esto la campana falla para los
    usuarios de un consorcio archivado). *Decisión del diseñador.*
- **No** se aplica a `Consorcio` (archivar y restaurar escriben ahí).
- Prueba nueva, al estilo de `filtro-unico.spec.ts`: consulta `information_schema` y falla si una
  tabla con `consorcio_id` no tiene el disparador y no está en la lista de excepciones. Así una
  tabla nueva no lo olvida.
- Las tablas hijas sin `consorcio_id` (`DetalleLiquidacion`, `PagoImputacion`, etc., nota 10) quedan
  cubiertas por su padre: no se escriben sin escribir o leer bajo candado una fila padre que sí lo
  lleva. El constructor verifica cada una (ver § 6).

### 4.3 Columnas y auditoría

- `archivado_en TIMESTAMPTZ NULL` en `Consorcio`, `EspacioComun` y `DocumentoConsorcio`.
- `CREATE TRIGGER auditar_espacio_comun` y `auditar_documento_consorcio` con `fn_auditar()`.
- Migración versionada (invariante 7).

## 5. Pantallas

Un solo botón **«Eliminar»**; el modal dice qué va a pasar antes de confirmar.

```
Eliminar «Quincho»
Este espacio no tiene reservas: se va a borrar definitivamente.
                                              [Eliminar]
```
```
Eliminar «Quincho»
Tiene 14 reservas en su historial: se va a archivar y lo vas a
encontrar en Eliminados, desde donde podés restaurarlo.
                                              [Archivar]
```

- **Espacios** (`/consorcios/[consorcio]/espacios`): sección plegable «Eliminados (n)» al pie, con
  «Restaurar» por fila. Solo administrador.
- **Documentación** (`/consorcios/[consorcio]/documentos`): ídem; la fila permite ver/descargar y
  «Restaurar». Solo administrador. El modal de documento siempre dice «se va a archivar».
- **Consorcios** (lista): sección «Archivados (n)»; para quien administra la administradora, cada
  uno con «Restaurar». El botón «Eliminar» del consorcio vive en su pantalla de resumen (o
  configuración), visible solo para ese nivel.
- Los resultados vuelven como toast vía `conHecho`/`conError` con claves nuevas en `HECHO`
  (nota 24): `espacio-archivado`, `espacio-eliminado`, `espacio-restaurado`, ídem documento y
  consorcio.
- Funciona en teléfono (RNF-01) y pasa axe (`test:a11y`).

## 6. Decisiones del diseñador (no conversadas)

- Excepciones del candado: `ConversacionAsistente`, `ConsultaDocumental`, `Habilitacion`,
  `Notificacion`.
- El nombre de un espacio archivado sigue ocupado; el alta homónima ofrece restaurar.
- Los fragmentos de un documento archivado se conservan, para restaurar sin reindexar.
- Archivar, borrar y restaurar un consorcio: el nivel de `conAutorizacionDeAdministradora`.
- *Eliminados* de espacios y documentos: solo el administrador.
- Nueva RN-22.

## 7. Lo que queda para el constructor

- Orden y lista exacta de borrado en el borrado definitivo del consorcio, respetando FKs y los
  disparadores existentes (por ejemplo, si alguno impide borrar `CoeficienteHistorico`).
- Verificar tabla por tabla que las hijas sin `consorcio_id` no se puedan escribir sin tocar un padre
  con candado; si alguna sí, sumarle un disparador que mire al padre.
- Cómo responde la cola a `ConsorcioArchivado`: no reintentable, termina sin error.
- Mantener las lecturas de historia que muestran el nombre de un espacio o documento archivado (una
  reserva vieja, una referencia en un acta): **no** filtrar ahí.
- Pruebas: integración por cada camino (borrar vacío, archivar con historia, restaurar, candado en
  cada familia de tablas incluido el pago), e2e de los tres modales y las tres vistas *Eliminados*.

## 8. Documentación a actualizar

- `docs/entrega-3/07-analisis-de-datos.md`: RN-22 y la columna `archivado_en`.
- `docs/entrega-2/05-analisis-factibilidad.md` (marco legal): sumar art. 328 CCyC y Ley 941 art. 9 f).
- `docs/entrega-final/15-pruebas.md`, `16-manual-usuario.md` (eliminar/archivar/restaurar),
  `18-seguridad.md` (tablas auditadas y candado de archivado).
- `CLAUDE.md`: nota nueva sobre el candado de archivado y sus excepciones.
