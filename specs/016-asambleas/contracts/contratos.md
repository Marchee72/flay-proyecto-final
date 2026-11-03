# Contratos: Asambleas de consorcio

Firmas orientativas. Siguen las convenciones existentes:

- los casos de uso reciben `repositorio` (`HABILITACIONES`) y `reloj` (`RELOJ`) por parámetro, y
  autorizan con `conAutorizacion`;
- los errores son subclases de `ErrorDeAplicacion`, con mensajes para el usuario final (RNF-10);
- los coeficientes viajan a la interfaz como **cadena**.

## Dominio puro (`src/dominio/asambleas/`)

```ts
// quorum.ts
type Convocatoria = 'primera' | 'segunda'
function segundaConvocatoria(fechaHora: Date): Date // + 30 min
function puedeConstituir(args: {
  ahora: Date; fechaHora: Date; coeficientePresente: Decimal; coeficienteTotal: Decimal
}): { puede: true; rige: Convocatoria } | { puede: false; motivo: 'antes_de_hora' | 'sin_quorum' }

// resultado.ts
interface UnidadPadron { unidadId: string; coeficiente: Decimal; presente: boolean; sinVoto: boolean }
interface Voto { unidadId: string; sentido?: 'positivo' | 'negativo' | 'abstencion'; opcionId?: string }
type Regla = 'presentes' | 'totalidad'
type Mayoria = 'absoluta' | 'dos_tercios' | 'unanimidad'

function conteo(padron: UnidadPadron[], votos: Voto[]): Conteo // por opción, unidades y coeficientes, más las dos bases
function resultadoBinario(padron, votos, mayoria: Mayoria, regla: Regla):
  { resultado: 'aprobado' | 'rechazado'; provisorio: boolean; conteo: Conteo }
function resultadoOpcionMultiple(padron, votos, opciones: string[]):
  { resultado: 'aprobado' | 'sin_decision'; opcionGanadoraId?: string; conteo: Conteo }
function alcanzaUmbral(a: { favor: Decimal; base: Decimal }, mayoria: Mayoria): boolean // sin dividir

// provisoria.ts
function estadoDecision(args: {
  provisorio: boolean; vence: Date | null; ahora: Date
  padron: UnidadPadron[]; votos: Voto[]; oposiciones: string[] /* unidadIds */; mayoria: Mayoria
}): 'firme' | 'provisoria' | 'caida'

// poderes.ts
function verificarTope(representadasHoy: number, tope: number): void // lanza TopeDePoderes

// estado.ts
function transicionAsamblea(desde: EstadoAsamblea, accion: AccionAsamblea): EstadoAsamblea // lanza TransicionInvalida

// calendario.ts
function enlaceGoogleCalendar(e: EventoAsamblea): string
function textoIcs(e: EventoAsamblea): string // RFC 5545, CRLF, con escape de , ; \n
```

## Casos de uso (`src/aplicacion/asambleas/`)

| Función | Roles | Efecto | Errores |
|---|---|---|---|
| `crearAsamblea(datos)` | administrador, consejo | crea en `borrador` con puntos y opciones | `PuntoInvalido` |
| `editarBorrador(id, datos)` | organizador | reemplaza datos y orden del día | `NoEsBorrador` |
| `borrarBorrador(id)` | organizador | borra | `NoEsBorrador` |
| `convocar(id)` | organizador | copia la configuración, pasa a `convocada`, avisa por `notificar` y `correo_directo`, devuelve los propietarios sin contacto | `AnticipacionInsuficiente(fechaMinima)` |
| `cancelar(id, motivo)` | dirige o puede dirigir | pasa a `cancelada` y avisa | `TransicionInvalida` |
| `otorgarPoder(asambleaId, unidadId, apoderadoId)` | propietario vigente de la unidad | crea el poder y avisa a los dos | `NoEsPropietario`, `ApoderadoNoHabilitado`, `TopeDePoderes`, `UnidadYaTienePoder` |
| `registrarPoderEnPapel(...)` | puede dirigir (R-14) | crea el poder con `origen: papel` | ídem |
| `revocarPoder(poderId)` | otorgante, o quien lo registró | marca `revocadoEn` | `AsambleaYaAbierta` |
| `abrir(id)` | puede dirigir | congela el padrón y pasa a `en_curso`; quien abre dirige | `AntesDeHora` |
| `acreditarme(id)` | propietario vigente o apoderado | marca presentes sus unidades | `UnidadYaAcreditada` |
| `acreditar(id, unidadId, representante)` | dirige | marca presente a otro, con o sin cuenta | `UnidadYaAcreditada` |
| `designarAutoridades(id, presidenteId, secretarioId)` | dirige | elige entre los presentes | `NoPresente` |
| `constituir(id)` | dirige | `puedeConstituir` con el reloj | `SinQuorum`, `AntesDeHora` |
| `abrirPunto(id, puntoId)` / `cerrarPunto(id, puntoId)` | dirige | `cerrar` calcula y persiste el resultado; si queda provisorio, fija el plazo y avisa a los ausentes | `OtroPuntoAbierto`, `NoConstituida` |
| `votar(puntoId, unidadId, eleccion)` | representante presente de la unidad | inserta el voto | `UnidadYaVoto`, `PuntoCerrado`, `SinVoto` |
| `cargarVoto(puntoId, unidadId, eleccion)` | dirige | inserta con `origen: carga_manual` | ídem |
| `tomarDireccion(id)` | puede dirigir | `dirigeId = yo` | — |
| `finalizar(id)` | dirige | pasa a `finalizada` y crea el `ActaAsamblea` en `en_redaccion` | `PuntosSinCerrar` |
| `verAsamblea(id)` | cualquier habilitado | una consulta: asamblea, puntos, opciones, padrón, votos, conteos en vivo, estado de cada decisión, mis unidades y mis permisos | — |
| `listarAsambleas()` | cualquier habilitado | las del consorcio, por fecha | — |
| `oponerme(puntoId)` / `registrarOposicionEnPapel(puntoId, unidadId)` | propietario ausente / administración o quien puede dirigir | crea la oposición | `FueraDePlazo`, `NoEraAusente` |
| `redactarResumen(puntoId, texto)` | secretario o quien dirigió | actualiza el resumen | `ActaNoEnRedaccion` |
| `designarFirmantes(actaId, {...})` | quien dirigió | presidente, secretario y dos propietarios presentes con usuario | `FirmanteInvalido` |
| `enviarAFirmar(actaId)` | quien dirigió | genera el PDF, guarda la huella, pasa a `a_firmar` y avisa | `ResumenesIncompletos`, `FirmantesIncompletos` |
| `firmar(actaId, contrasena)` | firmante designado | verifica con Argon2id y registra la firma; si es la última, genera el PDF final, crea el `DocumentoConsorcio` y pasa a `firmada` | `ContrasenaIncorrecta`, `YaFirmo` |
| `verConfiguracion()` / `guardarConfiguracion(datos)` | administrador | reglas del consorcio | `ConfiguracionInvalida` |
| `recordarFirmasPendientes(ahora)` | tarea diaria | avisa por las actas a `a_firmar` con más de 10 días | — |

La traducción de errores de la base al error de aplicación vive en el caso de uso:
- `23505` en `VotoAsamblea` → `UnidadYaVoto`;
- `23505` en `UnidadEnAsamblea` → `UnidadYaAcreditada`;
- `P0001` del disparador → el error con el mensaje que dio el disparador.

## Presentación

Las rutas viven bajo `/consorcios/[consorcio]/asambleas`:

| Ruta | Contenido |
|---|---|
| `/` | lista con estado y fecha; «Nueva asamblea» para consejo y administración |
| `/nueva` | formulario: datos, organización e invitación, puntos dinámicos (modalidad, mayoría, opciones) |
| `/configuracion` | reglas del consorcio (administrador) |
| `/[asamblea]` | según el estado (ver abajo) |
| `/[asamblea]/acta` | resúmenes por punto, firmantes, enviar a firmar, firmar (pide la contraseña), descarga |

Lo que muestra `/[asamblea]` en cada estado:

- **`borrador`**: edición y «Convocar».
- **`convocada`**:
  - datos y orden del día;
  - botones «Agregar a Google Calendar» y «Descargar .ics»;
  - «Mis poderes»: otorgar o revocar;
  - para quien puede dirigir, «Abrir» y la carga de poderes en papel.
- **`en_curso`**, con `<EnVivo />`:
  - cabecera con el quórum y la convocatoria que rige;
  - el punto abierto con sus opciones;
  - los botones de voto por cada unidad que represento;
  - el conteo en unidades y en coeficientes, y la lista de votos por unidad;
  - los puntos cerrados con su resultado;
  - para quien dirige, el panel de acreditación, autoridades, abrir y cerrar punto, cargar voto
    manual y finalizar.
- **`finalizada` / `acta_firmada`**: resultados, estado de cada decisión (con «Oponerme» si
  corresponde) y enlace al acta.

Otros puntos de la presentación:

- Las acciones redirigen con `?hecho=<clave>` o `?error=<texto>`, y las claves nuevas van en el
  diccionario `HECHO` de `src/app/avisos.tsx` (nota 24).
- Al votar no se recarga toda la página: la acción `votar` hace `revalidatePath`, y el próximo tic
  de `EnVivo` trae los votos de los demás.
- Hay una sección nueva, «Asambleas», en el bloque «Convivencia» de `src/app/(panel)/secciones.ts`,
  visible para todos los roles.

## Rutas de API

- `GET /api/asambleas/[asamblea]/ics`: exige sesión y autoriza contra el consorcio de la asamblea.
  Devuelve `text/calendar; charset=utf-8` con `Content-Disposition: attachment; filename="asamblea.ics"`.
- `GET /api/tareas/asambleas`: exige `Authorization: Bearer ${CRON_SECRET}` y corre
  `recordarFirmasPendientes`. Va diaria en `vercel.json`.

## Documento PDF

`GeneradorDeDocumentos` suma `generarActa(acta: ActaParaDocumento): Promise<Buffer>`. Como
`ExpensaParaDocumento`, `ActaParaDocumento` trae todos los valores **ya formateados como cadena**,
porque el generador no calcula nada. Contiene:

- cabecera: consorcio, tipo de asamblea, fecha, lugar y convocatoria que rigió;
- autoridades;
- asistencia: designación, representación y coeficiente;
- por cada punto: título, resumen, votos por unidad, conteo, resultado y estado de la decisión;
- `hojaDeFirmas?`: nombre, rol, fecha y hora, más la huella del contenido. Solo va en el PDF final.
