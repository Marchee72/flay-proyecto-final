# Contrato — Casos de uso de la iteración 3 (aplicación)

Cada uno autoriza por par (rol, consorcio) antes de tocar nada, abre su transacción, deja que la base
audite y recibe reloj, repositorios y las interfaces de asistencia por parámetro (punto de
composición en `src/aplicacion/dependencias.ts`). Importes hacia la interfaz **como cadena**. Los
mensajes de error son los que lee una persona (RNF-10): «ese horario ya está reservado», «la unidad
tiene deuda vencida», «el servicio de extracción no está disponible; cargá los datos a mano».

## Reclamos — `src/aplicacion/reclamos/` (`CU-07`, `CU-08`)

| Caso de uso | Rol | Qué hace |
|---|---|---|
| `registrarReclamo` | consorcista, consejo, administrador | Crea el reclamo en `abierto`, sin responsable; escribe el asiento `null → abierto`; encola `triage_reclamo`. Un consorcista sólo sobre una unidad que ocupa o sobre área común |
| `transicionar` | administrador (todas); autor del reclamo (`resuelto → en_curso` y `cerrado → abierto`) | Valida con `dominio/reclamos/estado.ts`; exige responsable fuera de `abierto` (y la base lo vuelve a exigir, SC-004); actualiza `estado`, `fecha_resolucion` cuando corresponde; escribe `ReclamoHistorial`; `notificar` al autor y al responsable (§ 12.7). **Único** camino que cambia el estado |
| `asignar` | administrador | Fija responsable y, opcionalmente, proveedor y rubro; si estaba `abierto` pasa a `asignado` vía `transicionar` |
| `vincularGasto` | administrador | Ata un gasto existente del mismo consorcio (`FR-008`) |
| `aplicarSugerencia` / `descartarSugerencia` | administrador | Copia rubro, urgencia y proveedor sugeridos al reclamo y marca `aceptada`; o marca `aceptada = false`. **No** toca el estado (`FR-027`) |
| `listarReclamos` | según rol | Administrador y consejo: todos los del consorcio; consorcista: los propios y los de alcance general |
| `verReclamo` | según rol | Con historial completo y la sugerencia si existe; otro consorcio ⇒ «no encontrado» (RN-12) |

## Reservas — `src/aplicacion/reservas/` (`CU-09`)

| Caso de uso | Rol | Qué hace |
|---|---|---|
| `administrarEspacio` | administrador | Alta y modificación de `EspacioComun`; la baja lógica cancela y notifica las reservas futuras |
| `reservar` | consorcista sobre su unidad; administrador sobre cualquiera | 1) deuda vencida de la unidad con `saldoImpagoPorUnidad` de `003` ⇒ rechazo con causa (SC-006); 2) reglas del espacio: anticipación, duración, tope mensual, capacidad; 3) `INSERT` en `confirmada`; el `23P01` de la exclusión ⇒ «ese horario ya está reservado» (SC-005); 4) `notificar` al solicitante `reserva_confirmada` o `reserva_rechazada` |
| `cancelarReserva` | solicitante o administrador | `confirmada → cancelada`; notifica |
| `listarReservas` | según rol | Del consorcio, por espacio y rango; el consorcista ve todas (para elegir horario) pero sólo con unidad, sin nombre |

## Comunicación — `src/aplicacion/comunicacion/` (`CU-12`, `CU-15`)

| Caso de uso | Rol | Qué hace |
|---|---|---|
| `notificar` | interno | Crea `Notificacion` y su `TrabajoPendiente` `notificacion` en la misma transacción (research R-07). Lo llaman reclamos, reservas, novedades y `liquidar` de `003` (que deja de crear la fila a mano) |
| `despacharNotificaciones` | administrador (botón), y el drenaje oportunista | Drena la cola acotado a 20 s, como los documentos de `003` |
| `publicarNovedad` | administrador | Crea la novedad y una notificación por usuario habilitado en el consorcio |
| `listarNovedades` | todos los habilitados | Fijadas primero |
| `cargarDocumento` | administrador | Permiso de subida directa con prefijo `documentos/`; al confirmar la subida, crea `DocumentoConsorcio` en `pendiente` y encola `indexar_documento` |
| `listarDocumentos` / `verDocumento` | según rol | Consorcista: sólo `visible_consorcistas`; lectura por enlace firmado como los comprobantes |
| `consultarDocumentacion` | todos los habilitados | 1) vectoriza la pregunta; si el generador de vectores no está disponible ⇒ búsqueda por título y descarga (degradación); 2) recupera 6 fragmentos con el `WHERE` de consorcio y visibilidad según el rol (research R-06); 3) `responder`; 4) persiste `ConsultaDocumental` con `sin_respaldo` cuando no hay fragmentos, no hay citas o el servicio no respondió; 5) devuelve respuesta y citas `{ documento, pagina, fragmento }` |

## Carga asistida — `src/aplicacion/gastos/extraccion.ts` (`CU-13`, `RF-06`)

| Caso de uso | Rol | Qué hace |
|---|---|---|
| `iniciarCargaAsistida` | administrador | Permiso de subida con prefijo `extracciones/`; al confirmar, crea `ExtraccionComprobante` en `pendiente` y encola `extraccion_comprobante` |
| `verExtraccion` | administrador | Estado y valores propuestos como cadena; la pantalla de alta de gasto de `002` recibe `precargado` desde acá (`FR-026`) |
| `confirmarExtraccion` | administrador | En **una** transacción: crea `Gasto` con los valores **enviados por la persona**, crea `Comprobante` con la clave del objeto, y marca la extracción `confirmada` o `corregida` con `campos_corregidos` = los que difieren de lo propuesto. Es el único lugar donde una extracción produce un gasto (SC-017) |
| `descartarExtraccion` | administrador | `descartada`; el objeto queda para auditoría |

## Indicadores — `src/aplicacion/indicadores/` (`CU-11`, `RF-21` a `RF-25`)

| Caso de uso | Rol | Qué hace |
|---|---|---|
| `verPanel` (I-6) | administrador | Lee las vistas para **todos** los consorcios con habilitación vigente del usuario; cero consultas a tablas base |
| `verMorosidad` (I-1) | administrador, consejo | Serie mensual del consorcio con la referencia del 12 % y las alertas (> 15 %, +3 puntos en dos meses). La nómina nominada es `verMorosidad` de `003`, con su regla RN-13 |
| `verGastoPorRubro` (I-2) | administrador, consejo | Barras por rubro y período, desvíos > 30 % destacados, «historia insuficiente» cuando el promedio es nulo |
| `verProveedores` (I-3) | administrador | Tabla y dispersión |
| `verResolucionReclamos` (I-4) | administrador, consejo | Mediana y p90 por rubro y urgencia, meta de 72 h |
| `verCargaAdministrativa` (I-5) | administrador | Horas de apertura a liquidación y proporción sin corrección, contra la línea de base de 38 h |
| `refrescarVistas` | administrador (botón) y la tarea programada (ruta con secreto) | `REFRESH MATERIALIZED VIEW CONCURRENTLY` de las cinco, con la hora del último refresco visible en el panel |

## Exportación — `src/app/api/exportar/[consorcio]/[tabla]/route.ts` (`FR-032b`)

`GET` con sesión y habilitación vigente sobre el consorcio; `tabla ∈ {gastos, liquidaciones, pagos}`;
CSV UTF-8 con BOM, separador `;`, importes como cadena; `Content-Disposition: attachment`. Otro
consorcio ⇒ 404, nunca 403 (no revela que existe).
