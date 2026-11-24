# Importación del padrón y de los ocupantes desde Excel o CSV — diseño

> RF-02 (padrón de unidades y coeficientes), RF-03 (personas y ocupaciones). Reglas que toca:
> RN-01 (suma exacta de coeficientes), RN-02 (historia de coeficientes), RN-09 (sin dos inquilinos
> superpuestos), RN-12 (aislamiento por consorcio).

## Intención

Cargar un edificio hoy es tipear (o pegar) el padrón unidad por unidad y después invitar a cada
dueño de a uno desde Usuarios, con correo obligatorio. Con 96 unidades eso es lento y es donde se
cuelan los errores. Lo que se quiere es que el administrador **baje una plantilla, la complete en
Excel y la suba**, y que el sistema **rechace el archivo con errores claros por fila** si algo no
está bien, o cargue todo junto si está bien.

## Qué se construye

Dos importaciones que comparten formato (Excel `.xlsx` o CSV), plantilla descargable y reglas de
validación:

1. **Padrón, en Unidades** — solo para un consorcio **sin unidades**. Cada fila es una unidad
   (designación, tipo, coeficiente) y, **opcionalmente**, su dueño. Con el padrón ya cargado, los
   cambios siguen por «Editar padrón» (`editarPadron`), que no se toca.
2. **Ocupantes, en Usuarios** — con el padrón ya cargado. Cada fila asigna una persona a una
   unidad existente como **propietario o inquilino**, con fechas. Es la vía para cargar
   copropietarios (varios dueños por unidad) e inquilinos en lote.

Y una pieza que hace falta por la decisión de abajo:

3. **«Registrados sin acceso», en Usuarios** — la lista de personas que ocupan alguna unidad del
   consorcio y todavía no tienen usuario, con «Invitar» de a uno y «Invitar a todos los que tienen
   correo».

## Decisiones tomadas con el usuario

- **Importar registra, no invita.** Una fila crea (o reutiliza) la `Persona` y su `Ocupacion`;
  **no** crea `Usuario`, no da habilitación y no manda correo. El correo es **opcional**. La
  invitación sale después, desde «Registrados sin acceso». Razón: el padrón de un edificio nuevo
  casi nunca trae todos los correos, y cientos de invitaciones disparadas por un archivo con una
  celda mal son difíciles de deshacer.
- **Excel o CSV**, con plantilla descargable para cada importación.
- **La importación del padrón es solo para un consorcio vacío.** Mismo criterio que
  `cargarPadron` (`PadronYaCargado`).
- **Librería: ExcelJS** (lee `.xlsx` y CSV, escribe la plantilla con listas desplegables). Primer
  paso del plan: instalarla y correr `npm audit --omit=dev --audit-level=high`. Si no pasa, se cae a
  `read-excel-file` + `write-excel-file` + un lector CSV propio, sin cambiar nada más del diseño
  (se pierden los desplegables de la plantilla; la validación ataja lo mismo).

## Enfoques considerados

| Enfoque | A favor | En contra |
|---|---|---|
| **1. ExcelJS** (elegido) | Lee xlsx y CSV; plantilla con desplegables (Tipo, Vínculo, Unidad), columna Coeficiente con formato texto y hoja «Instrucciones»: previene errores en el origen | Dependencia pesada con dependencias viejas; riesgo en `npm audit` |
| 2. read/write-excel-file + CSV propio | Liviano, menos riesgo de auditoría | Plantilla sin desplegables |
| 3. Solo CSV, sin dependencias | Lo más barato | Quien tiene `.xlsx` tiene que convertir; sin desplegables ni instrucciones; no cumple «excel o csv» |

## Formato de los archivos

Las columnas se reconocen **por el encabezado** (sin distinguir mayúsculas ni acentos, espacios
recortados), no por posición; una columna desconocida es error (atrapa el «Coefciente» mal
escrito). Se lee la **primera hoja** del `.xlsx`.

**Padrón** (`padron-<consorcio>.xlsx`):

| Columna | Obligatoria | Notas |
|---|---|---|
| Designación | sí | |
| Tipo | no | `departamento` / `cochera` / `local` / `baulera`; vacío → departamento |
| Coeficiente | sí | porcentaje, hasta 8 decimales, coma o punto |
| Nombre, Apellido, DNI, Correo, Teléfono | no | el dueño de la unidad; un solo dueño por fila |

**Ocupantes** (`ocupantes-<consorcio>.xlsx`):

| Columna | Obligatoria | Notas |
|---|---|---|
| Unidad | sí | designación exacta de una unidad vigente; en la plantilla, desplegable con las del consorcio |
| Vínculo | sí | `propietario` / `inquilino` |
| Nombre, Apellido | sí | |
| DNI, Correo, Teléfono | no | |
| Desde | no | fecha; vacío → hoy (hora argentina, `RELOJ.hoy()`) |
| Hasta | no | fecha inclusiva; vacío → sin fin |

La plantilla trae una hoja «Instrucciones» con estas reglas en castellano llano y una fila de
ejemplo en la hoja de datos que **se ignora si no se borra** (marcada como ejemplo). Las plantillas
se sirven desde un manejador de ruta con la autorización de administrador del consorcio (el de
ocupantes lista las designaciones del consorcio: es dato del consorcio, se autoriza igual que la
página).

## Validaciones

Todas corren en una **función pura del dominio** que recibe las filas ya leídas (cadenas) y el
contexto (unidades existentes, personas conocidas, ocupaciones vigentes) y devuelve
`{ filas válidas, errores: [{ fila, columna?, mensaje }] }` (patrón de la nota 28). La vista previa
y la carga la corren las dos; la carga **vuelve a correrla** contra la base del momento antes de
escribir. Se informan **todos** los errores de una vez (con un tope visible, p. ej. «y 37 más»),
cada uno con número de fila de la planilla tal como la ve el usuario.

**Del archivo**
- Extensión `.xlsx` o `.csv`; tamaño máximo 500 KB (bajo el límite de 1 MB del cuerpo de una acción
  de servidor, que no se cambia); máximo 2000 filas de datos; al menos una.
- CSV: separador `;` o `,` detectado por el encabezado; UTF-8 con o sin BOM; si no es UTF-8 válido
  se decodifica como Windows-1252 (es lo que guarda «CSV (delimitado por comas)» en un Excel en
  español; sin esto, «Designación» llega como «DesignaciÃ³n»).
- Encabezados: los obligatorios presentes, ninguno repetido, ninguno desconocido.
- Filas totalmente vacías se ignoran.

**Coeficiente — invariante 2.** Excel guarda los números como doble de punto flotante. La plantilla
pone la columna en **formato texto** y el lector toma el **texto mostrado** de la celda, nunca su
valor numérico. Si igual llega una celda numérica (alguien pegó sin formato), se acepta solo si su
representación decimal más corta tiene ≤ 8 decimales; si no, error en esa fila. **Nunca se
redondea.** Luego: decimal positivo (> 0), ≤ 8 decimales, y la **suma exacta de 100,00000000**
con la aritmética de `exigirSumaExacta`. Si no cierra, el error dice cuánto falta o sobra (como la
suma corriente del cargador).

**Padrón**
- Consorcio sin unidades y no archivado.
- Designación no vacía y única en el archivo (comparación sin distinguir mayúsculas ni espacios
  sobrantes: «1A» y «1 a» son la misma).
- Tipo dentro del vocabulario.
- Dueño: si viene cualquier dato de persona, Nombre y Apellido son obligatorios.

**Ocupantes**
- Padrón cargado y consorcio no archivado.
- Unidad existe, es del consorcio (consulta aislada) y no está dada de baja.
- Vínculo dentro del vocabulario.
- Fechas válidas (celda fecha de Excel → día por sus componentes UTC, sin corrimiento de zona;
  texto `AAAA-MM-DD` o `DD/MM/AAAA`); Hasta ≥ Desde.
- **RN-09:** dos inquilinos superpuestos en la misma unidad — dentro del archivo, o contra uno
  vigente en la base — es error en la fila. La restricción de exclusión de la base sigue siendo la
  garantía; esto es para señalar la fila.

**Personas (las dos importaciones)**
- Correo, si viene: `errorDeCorreo` (el mismo validador del alta). DNI, si viene: 7 u 8 dígitos
  después de sacar puntos y espacios; se guarda normalizado.
- **Identidad:** una persona se reconoce por correo y, si no hay, por DNI. Dentro del archivo, dos
  filas con el mismo correo o DNI son la misma persona, y deben traer el mismo nombre y apellido
  (si no, error en la segunda). Contra la base, si ya existe una `Persona` con ese correo o DNI se
  **reutiliza solo si su nombre y apellido coinciden** con los del archivo (normalizados: sin
  acentos, mayúsculas ni espacios sobrantes), sin pisar sus datos. Si no coinciden, **error en la
  fila**: «el DNI (o correo) ya está registrado a nombre de otra persona; revisalo». *(Decidido con
  el usuario: ataja el DNI mal tipeado; lo único que revela es que el DNI existe, nunca de quién
  ni dónde.)* La búsqueda por correo mira también `Usuario.correo`.
- Conflicto: correo de una persona existente y DNI de otra (o el mismo correo con otro DNI en el
  archivo) → error en la fila.
- Una fila sin correo ni DNI crea una persona nueva cada vez; no es error, pero la vista previa lo
  cuenta («12 personas sin correo ni DNI: volver a importar las duplicaría»).
- **No se revela nada de otro consorcio.** `Persona` es global: el mensaje de un conflicto no
  muestra el nombre guardado ni dónde vive; dice que «el correo ya pertenece a otra persona
  registrada con otro DNI».

**Repetidos (idempotencia)**
- Una ocupación del mismo tipo, misma persona y misma unidad cuyo rango se solapa con una ya
  existente se **saltea** y figura como «ya estaba». Volver a subir el mismo archivo no duplica.

## Flujo en pantalla

Ambas importaciones tienen la misma forma, en un modal o sección «Importar desde archivo»:

1. «Bajar plantilla».
2. Elegir archivo → **Revisar**. La acción lee y valida, **no escribe**, y devuelve:
   - con errores: la lista por fila (el error del envío sigue siendo uno solo al pie con
     `role="alert"`; la lista va debajo);
   - sin errores: el resumen — «96 unidades · suma 100,00000000 % · 80 dueños (12 sin correo ni
     DNI)» o «40 propietarios, 15 inquilinos, 3 ya estaban» — y una tabla de vista previa.
3. **Confirmar** reenvía el mismo archivo (el campo conserva el archivo elegido; la acción es sin
   estado) con `confirmar=1`; el servidor relee, revalida y escribe. Éxito → toast por
   `conHecho(...)` (nota 24) y vuelta a la pantalla.

Lugares:
- **Unidades** (consorcio sin padrón): junto al cargador actual, que se queda como está (pegar y
  generar siguen).
- **Usuarios**: botón «Importar ocupantes» junto a «Invitar persona», visible solo con padrón
  cargado. Debajo de la tabla de usuarios, la sección **«Registrados sin acceso»**.

Todo control de escritura se esconde con `!activo.archivadoEn`; el candado de la base (nota 35)
es la garantía.

## Escritura

- **Una sola transacción por importación**: o entra todo el archivo o nada.
- Por lote, no fila por fila (nota 11): ids generados en memoria, `createMany` para `Unidad`,
  `CoeficienteHistorico` y `Persona`, y un `INSERT … SELECT FROM unnest(...)` para `Ocupacion`
  (la vigencia es `daterange`, que el cliente no modela; el repositorio de ocupaciones ya lo
  escribe en crudo de a una). Timeout de la transacción explícito, como `editarPadron`.
- El padrón se escribe con la misma lógica que `cargarPadron` (extraerla para reutilizarla, no
  duplicarla). Vigencia de coeficientes desde hoy.
- **La importación no da acceso a nadie**, tampoco a una persona reutilizada que ya tiene usuario
  en otro consorcio: no se llama a `sincronizarHabilitacion`. Esa persona aparece en «Registrados
  sin acceso» y el acceso se da con «Invitar», como a cualquiera. *(Decisión de diseño: es lo que
  ya dice «importar registra, no invita», y evita que un DNI mal tipeado le abra el edificio a un
  desconocido.)*
- Autorización: solo `administrador` del consorcio, vía `conAutorizacion`. Auditoría por los
  disparadores que ya existen.
- El error de un candado o de la exclusión de la base se traduce con lo que ya hay
  (`traducirArchivado`, `comoInquilinoSuperpuesto`).

## «Registrados sin acceso» e invitar

- Lista: personas con ocupación vigente en el consorcio y **sin habilitación vigente en este
  consorcio** (sin `Usuario`, o con usuario de otro edificio). Columnas: persona, DNI, correo,
  unidades (designación · vínculo), acciones.
- **Invitar** (de a uno): si la persona no tiene correo, el modal lo pide (y lo guarda en la
  `Persona`). Sin usuario: crea el usuario invitado (`asegurarCuenta`, que ya reutiliza la persona
  por correo), sincroniza la habilitación de consorcista desde sus ocupaciones
  (`sincronizarHabilitacion`) y encola la invitación (`encolarInvitacion`). Con usuario: solo
  sincroniza la habilitación, sin correo de invitación (ya tiene cuenta; mismo criterio que
  `invitarPersona` con un existente).
- Si el correo cargado ya es de otro usuario **o de otra `Persona`** (la misma persona importada
  dos veces, una con correo y otra sin), se **rechaza** sin revelar de quién es. No se fusionan
  personas. *(Decisión de diseño: fusionar es un caso de uso propio —mover ocupaciones, revisar
  RN-09, dejar rastro— y queda fuera.)*
- **Invitar a todos los que tienen correo**: lo mismo en lote. Debe ser **reanudable**: una
  transacción por persona, y si se corta por tiempo, lo ya invitado queda invitado y volver a
  apretar sigue con el resto. El toast dice cuántos se invitaron y cuántos quedan.

## No-objetivos

- Actualizar un padrón ya cargado por archivo.
- Exportar el padrón o los ocupantes a Excel.
- Terminar ocupaciones, cambiar coeficientes o dar de baja por archivo.
- Invitar al importar.
- Corregir el archivo dentro de la pantalla: con errores, se corrige en Excel y se vuelve a subir.

## Anti-objetivos

- Que un archivo cargue a medias.
- Que un coeficiente pase por punto flotante o se redondee al leerlo.
- Que un archivo mande correos.
- Que un mensaje de error filtre datos de una persona de otro consorcio.

## Restricciones del repositorio

- Presentación no importa infraestructura (§ 12.1.2): la lectura del archivo vive en
  infraestructura, la validación en el dominio, la orquestación en aplicación; los validadores que
  la pantalla necesite se reexportan sin Prisma (nota 28).
- Sumar ExcelJS obliga a mencionar su versión en `docs/entrega-final/14-codificacion.md` § 14.1
  (`npm run docs:versiones`) y a pasar `npm audit --omit=dev --audit-level=high`.
- Funciona en teléfono (RNF-01) y con axe A/AA; mensajes en lenguaje del usuario (RNF-10).
- Manual de usuario (`docs/entrega-final/16-manual-usuario.md`) actualizado.

## Queda para quien construye

- Nombres de archivos, módulos y acciones; forma exacta del modal.
- Cómo se muestra la vista previa en teléfono.
- El tope de errores mostrados y el texto exacto de cada mensaje, dentro del tono de RNF-10.
- Cómo se marca la fila de ejemplo de la plantilla.
- Pruebas: el validador con pruebas de dominio (incluidos coeficiente numérico, CSV en
  Windows-1252, separador `;`, identidad y RN-09 dentro del archivo); integración para la
  transacción todo-o-nada, la idempotencia y el aislamiento; una e2e que baja la plantilla, la sube
  completa y ve el padrón cargado.
