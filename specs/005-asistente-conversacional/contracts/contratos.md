# Contratos — Asistente conversacional (RF-27)

Firmas comprometidas. El dominio declara la interfaz; la aplicación orquesta; la infraestructura
implementa.

## 1. Dominio — `src/dominio/contratos/asistencia.ts` (ampliación)

Reutiliza `Resultado<T>`, `disponible`, `noDisponible` ya definidos. Se agrega:

```ts
export interface HerramientaDisponible {
  nombre: string
  descripcion: string
  /** JSON Schema de los parámetros (lo que el proveedor espera para function calling). */
  parametros: unknown
}

export type TurnoConversacion =
  | { rol: 'usuario'; texto: string }
  | { rol: 'asistente'; texto: string }
  | { rol: 'herramienta'; nombre: string; resultado: string } // resultado YA minimizado

export type AccionDelAgente =
  | { tipo: 'responder'; texto: string }
  | { tipo: 'invocar'; nombre: string; argumentos: Record<string, unknown> }

export interface AgenteConversacional {
  /**
   * Dada la conversación y las herramientas ofrecidas, decide el próximo paso:
   * responder en texto o invocar una herramienta. NUNCA ejecuta nada por sí misma.
   * `contexto.hoy` = fecha actual (America/Argentina/Buenos_Aires); `rolTexto` describe
   * el rol del usuario para acotar el tono, no para autorizar.
   */
  conversar(
    contexto: { hoy: string; rolTexto: string },
    historial: TurnoConversacion[],
    herramientas: HerramientaDisponible[],
  ): Promise<Resultado<AccionDelAgente>>
}

export interface Asistencia {
  extractor: ExtractorDocumental
  clasificador: ClasificadorTexto
  vectores: GeneradorVectores
  respuestas: GeneradorRespuesta
  agente: AgenteConversacional   // (+)
}
```

Invariante del contrato: la indisponibilidad del servicio devuelve `{ disponible: false, motivo }`,
no lanza (RNF-14). La implementación `nula` siempre devuelve `noDisponible(...)`.

## 2. Aplicación — registro de herramientas (`src/aplicacion/asistente/herramientas.ts`)

```ts
export interface ContextoHerramienta {
  usuarioId: string
  consorcioId: string          // el activo o el resuelto para admin (ya validado al alcance)
  roles: readonly Rol[]        // de AccesoVigente; solo para decidir qué se ofrece
}

export interface ResultadoHerramienta {
  paraModelo: unknown          // minimizado (sin nombre/correo/tel/documento)
  paraUI: unknown              // datos reales para la tarjeta/respuesta en pantalla
}

export interface Herramienta {
  nombre: string
  descripcion: string
  parametros: z.ZodTypeAny     // validación + se deriva el JSON Schema para el proveedor
  roles: readonly Rol[] | 'todos'
  escritura: boolean
  /** Lectura: ejecuta el caso de uso y devuelve {paraModelo, paraUI}. */
  ejecutar(args: unknown, ctx: ContextoHerramienta): Promise<ResultadoHerramienta>
  /** Escritura: texto de la tarjeta armado desde la base (IDs → nombres). No ejecuta. */
  resumir?(args: unknown, ctx: ContextoHerramienta): Promise<string>
  /** Escritura: ejecuta el caso de uso real al confirmar. */
  confirmar?(args: unknown, ctx: ContextoHerramienta): Promise<unknown>
}

export const HERRAMIENTAS: readonly Herramienta[]
export function herramientasPara(roles: readonly Rol[]): Herramienta[]
```

Mapa inicial (cada `ejecutar`/`confirmar` llama el caso de uso indicado, nunca Prisma):

| nombre | caso de uso | roles | escritura |
|---|---|---|---|
| `listar_mis_consorcios` | `misConsorcios` | todos | no |
| `ver_espacios` | `listarEspacios` | todos | no |
| `ver_reservas` | `listarReservas` | todos | no |
| `ver_mis_unidades` | `unidadesParaReservar` | todos | no |
| `ver_expensas` | `misExpensas` | todos | no |
| `ver_estado_cuenta` | `verEstadoDeCuenta` | todos | no |
| `ver_morosidad` | `verMorosidad` | todos | no |
| `ver_resumen` | `verResumenConsorcio` | todos | no |
| `ver_gastos` | `listarGastos` | todos | no |
| `ver_reclamos` | `listarReclamos` / `verReclamo` | todos | no |
| `ver_novedades` | `listarNovedades` | todos | no |
| `consultar_reglamentos` | `consultarDocumentacion` (RF-20, con citas) | todos | no |
| `ver_responsables` | `posiblesResponsables` **dentro de** `conAutorizacion` admin | administrador | no |
| `ver_destinatarios` | `destinatariosPosibles` | administrador | no |
| `crear_reserva` | `reservar` | todos | **sí** |
| `crear_reclamo` | `registrarReclamo` | todos | **sí** |
| `asignar_reclamo` | `asignar` | administrador | **sí** |
| `publicar_novedad` | `publicarNovedad` | administrador | **sí** |

## 3. Aplicación — orquestador (`src/aplicacion/asistente/conversar.ts`)

```ts
export type RespuestaDelAsistente =
  | { modo: 'respuesta'; conversacionId: string; texto: string; enlaces: { herramienta: string; consorcioId: string; argumentos: Record<string, unknown> }[]; citas?: Cita[] }
  | { modo: 'propuesta'; conversacionId: string; propuestaId: string; resumen: string }
  | { modo: 'degradado'; conversacionId: string; motivo: string }

export async function conversar(
  asistencia: Pick<Asistencia, 'agente' | 'vectores' | 'respuestas'>,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; conversacionId?: string; texto: string },
): Promise<RespuestaDelAsistente>
```

Flujo (dentro de `conAutorizacion`, acción "conversar con el asistente"):
1. Resolver/crear conversación del usuario en el consorcio; persistir turno `usuario`; cargar
   historial reciente.
2. `herramientasPara(acceso.roles)` → llamar `agente.conversar({ hoy, rolTexto }, historial, …)`.
3. `invocar` **lectura** → ejecutar la herramienta; persistir turno `herramienta` con `paraModelo`;
   guardar `paraUI` para la respuesta; repetir desde 2 (tope 4 saltos — R-09).
4. `invocar` **escritura** → persistir `MensajeAsistente` con `propuesta` + `estadoPropuesta:
   'pendiente'`; devolver `{ modo:'propuesta', propuestaId, resumen }` (resumen de `resumir`).
5. `responder` → persistir turno `asistente`; devolver `{ modo:'respuesta', texto, enlaces, citas? }`.
6. `agente`/`vectores`/`respuestas` no disponible → `{ modo:'degradado', motivo }`.

## 4. Aplicación — confirmación (`src/aplicacion/asistente/confirmar.ts`)

```ts
export async function confirmarPropuesta(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; propuestaId: string },
): Promise<{ ejecutada: boolean; resultado?: unknown; yaResuelta?: EstadoPropuesta }>

export async function descartarPropuesta(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; propuestaId: string },
): Promise<void>
```

- `confirmarPropuesta`: dentro de `conAutorizacion`; lee la propuesta del hilo del usuario; si no
  está `pendiente`, devuelve `{ ejecutada: false, yaResuelta }` (idempotente). Si lo está:
  **re-valida** `argumentos` con el Zod de la herramienta, corre `herramienta.confirmar(args, ctx)`
  y marca `confirmada` en la **misma transacción**. Un `ErrorDeAplicacion` del caso de uso vuelve
  como mensaje para el usuario (no se marca confirmada).

## 5. Presentación — server actions (`src/app/(panel)/consorcios/[consorcio]/asistente/acciones.ts`)

```ts
// 'use server'
export type VistaAsistente = RespuestaDelAsistente | { modo: 'error'; mensaje: string }

export async function accionEnviar(previo: VistaAsistente, datos: FormData): Promise<VistaAsistente>
// usa useActionState; NO redirige (como accionConsultar de RF-20)

export async function accionConfirmar(datos: FormData): Promise<void>
// ejecuta confirmarPropuesta; redirect('…?hecho=<clave>') | '…?error=<texto>'

export async function accionDescartar(datos: FormData): Promise<void>
```

- Reutiliza `usuarioDeLaSesion()`, `HABILITACIONES`, `RELOJ`, `ASISTENCIA`, el patrón
  `ErrorDeAplicacion → mensajeParaUsuario`, el diccionario `HECHO` de `src/app/avisos.tsx`
  (claves nuevas: p.ej. `reserva-confirmada` ya existe; agregar las que falten) y las *Fuentes*
  de `documentos/consultar/formulario.tsx` para render de citas.

## Contrato de pruebas (determinista)

La implementación `determinista.agente` mapea por palabra clave a una acción fija y predecible, de
modo que las pruebas afirmen el **ruteo + aislamiento + gating**, no la redacción:
- "deuda"/"debo"/"morosidad" → `invocar ver_morosidad`
- "reserva"/"reservar" → `invocar ver_reservas` o, con fecha+espacio, `invocar crear_reserva`
- "reclamo" → `invocar ver_reclamos` / `crear_reclamo`
- "reglamento"/"documento" → `invocar consultar_reglamentos`
- texto sin palabra clave de dominio → `responder` con la negativa fija.
