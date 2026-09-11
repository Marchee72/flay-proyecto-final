# Implementation Plan: 004-servicios

**Branch**: `004-servicios` | **Date**: 2026-09-11 | **Spec**: [`spec.md`](spec.md)

**Input**: Feature specification from `/specs/004-servicios/spec.md` (6 historias, 36 FR, 22 SC).
La historia 1 —las dos pruebas de concepto— **ya está ejecutada y superada** antes de este plan:
149/150 campos y 20/20 preguntas, § 14.3 decidido (`docs/entrega-final/14-codificacion.md`,
`poc/resultados/`). Este plan cubre las historias 2 a 6 y el bloque G de cierre.

## Summary

La etapa de mayor incertidumbre, ahora con la incertidumbre resuelta: las PoC dijeron que `RF-06`,
`RF-12` y `RF-20` se construyen completos y quién es el proveedor. Lo que queda es cinco historias
sobre la base que `001` a `003` dejaron: reclamos con su máquina de estados e historial (`CU-07`,
`CU-08`), reservas con la superposición rechazada **por la base** (`CU-09`), el despachador de
notificaciones que `003` dejó esperando, novedades y documentación (`CU-12`, `CU-15`), el panel de
indicadores sobre vistas materializadas (`CU-11`, requisito obligatorio de la cátedra) y las tres
funciones asistidas detrás de cuatro interfaces con tres implementaciones cada una (`CU-13`,
`CU-14`, `CU-10`).

Tres decisiones ordenan todo el plan: **la cola de `002` absorbe todo lo asincrónico** (cuatro tipos
de trabajo nuevos, cero mecanismos nuevos); **la base impone lo que puede imponer** (`CHECK` para
RN-11, exclusión para RN-10, disparadores para la auditoría, `WHERE` de consorcio antes de ordenar
por vector); y **la asistencia nunca decide** (entidades separadas, confirmación humana como único
camino al gasto, respuesta sin citas igual a sin respaldo).

Lo que esta etapa **no** hace: cobrar depósitos de reservas, dar de baja documentos (§ 9.11),
convertir HEIC/TIFF, ni indexar otra cosa que PDF.

## Technical Context

**Language/Version**: TypeScript 5 sobre Next.js 15.5.25, Node.js 22.21.0

**Primary Dependencies**: las de `003`, más **dos nuevas**: `@google/genai` (SDK oficial del
proveedor elegido en § 14.3, research R-01) y `unpdf` (texto por página de PDF en entorno sin DOM,
research R-05). Recharts 2.15.0 ya instalado se ratifica para § 14.2 (research R-12). `pgvector`
y `btree_gist` están instalados desde `001`

**Storage**: PostgreSQL 18.6 en Neon `sa-east-1`. Columna `vector(768)` con índice HNSW; restricción
de exclusión GiST sobre rango horario; cinco vistas materializadas con refresco diario concurrente;
documentos y comprobantes sueltos como objetos con subida directa (mismo almacén que `002`)

**Testing**: Vitest (`dominio` sin base, `integracion`), Playwright (escritorio, teléfono, a11y).
La implementación **determinista** de las cuatro interfaces es la que corren integración y
extremo a extremo; la del proveedor sólo se ejercita a mano en la demostración (quickstart). TDD
no es obligatorio en esta etapa (§ 8.3.3), salvo en la máquina de estados de reclamo, que se hace
primero como `periodos/estado.ts`

**Target Platform**: Vercel + Neon; navegadores actuales; teléfono 390 px para reclamo y reserva
(SC-020)

**Project Type**: Aplicación web Next.js App Router en despliegue único, capas por carpeta

**Performance Goals**: panel consolidado bajo 2 s en el percentil 95 sobre ~600.000 registros
(SC-010, RNF-06); extracción e indexación fuera del pedido, sin presupuesto de latencia propio pero
con estado observable; despacho de avisos acotado a 20 s por disparo, como los documentos de `003`

**Constraints**: cero transiciones sin asiento (SC-003); cero reservas superpuestas aun en
concurrencia (SC-005); cero avisos perdidos entre etapas (SC-007); cero operaciones de negocio
caídas por el correo (SC-008); exactamente tres implementaciones por interfaz (SC-012); cero
respuestas sin cita y cero invenciones sobre diez preguntas sin respaldo (SC-014, SC-015); el
fragmento ajeno **nunca llega** al generador (SC-016); cero gastos sin confirmación humana (SC-017);
decimal con tolerancia cero en I-1 a I-3 (SC-022)

**Scale/Scope**: 10 entidades nuevas, 5 vistas materializadas, 4 tipos de trabajo, 4 interfaces × 3
implementaciones, 9 casos de uso, ~14 pantallas, 243 h en 8 semanas

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principio | Veredicto | Cómo se cumple en este plan |
| --- | --- | --- |
| I Aislamiento (NO NEGOCIABLE) | PASS | `Reclamo`, `Reserva`, `EspacioComun`, `Novedad`, `DocumentoConsorcio`, `ConsultaDocumental` y `ExtraccionComprobante` declaran `consorcio_id` y quedan alcanzadas por la extensión sin escribir un filtro. `ReclamoHistorial`, `SugerenciaReclamo` y `FragmentoDocumento` se alcanzan por su padre, nunca directo (decisión 10). Las dos consultas que **no** pasan por la extensión —recuperación de fragmentos y lectura de vistas— exigen el consorcio de `consorcioActivo()` y se niegan sin él (research R-06, R-11); SC-016 lo prueba con dos consorcios. La nómina nominada sigue siendo la consulta de `003` con su regla RN-13 (SC-011) |
| II Exactitud del dinero (NO NEGOCIABLE) | PASS | Ningún cálculo monetario nuevo en TypeScript: los indicadores agregan en `NUMERIC` dentro de las vistas y redondean una vez al final; `importe_detectado` y `costo_*` viajan como cadena; Recharts recibe números sólo para dibujar y la etiqueta legible es la cadena. La regla `flay/sin-aritmetica-monetaria` cubre el módulo; SC-022 verifica las vistas contra el cálculo manual |
| III Dominio↔infraestructura | PASS | Las cuatro interfaces en `src/dominio/contratos/asistencia.ts`; el proveedor, `unpdf`, `pgvector` y Recharts sólo en infraestructura y presentación; los casos de uso reciben las interfaces por parámetro y `dependencias.ts` elige una vez por entorno (research R-02). La máquina de estados de reclamo y la fragmentación se prueban sin base |
| IV La asistencia no decide | PASS | `ExtraccionComprobante` separada y con `consorcio_id` propio; el gasto nace sólo en `confirmarExtraccion` con los valores que la persona envió (SC-017). `SugerenciaReclamo` se aplica o descarta sin tocar el estado. Respuesta sin citas ⇒ `sin_respaldo` (SC-014, SC-015). Tres implementaciones por interfaz, contadas por una prueba (SC-012); toda función probada con la nula (SC-013) |
| V Auditoría inviolable | PASS | `ExtraccionComprobante`, `Reclamo` y `Reserva` enganchadas a `fn_auditar()`; la aplicación sigue sin permisos sobre la bitácora (SC-021) |

**Restricciones técnicas**: migraciones versionadas, incluida la de datos que encola los avisos de
`003` · integridad impuesta por la base donde puede —`CHECK` de RN-11, exclusión de RN-10, unicidad
de sugerencia por reclamo— · importes como cadena · 390 px y WCAG 2.1 AA en reclamo y reserva ·
mensajes legibles en cada degradación (RNF-10) · neutralidad de producto en `docs/entrega-1` a
`entrega-3`: el proveedor se nombra sólo en § 14.3 y en código.

### Cumplimiento diferido de `003`, cerrado acá

| Cláusula | Qué decía `003` | Qué hace esta etapa |
| --- | --- | --- |
| Notificaciones (`RF-14`) | Crea las `Notificacion` en `pendiente`, sin enviar | Construye el despachador sobre `TrabajoPendiente`; la migración de datos encola lo que quedó; `liquidar` pasa a usar `notificar` (research R-07, SC-007) |

## Project Structure

### Documentation (this feature)

```text
specs/004-servicios/
├── plan.md              # Este archivo
├── research.md          # Fase 0: R-01 a R-13
├── data-model.md        # Fase 1: 10 entidades, 5 vistas, auditoría
├── quickstart.md        # Fase 1
├── contracts/
│   ├── asistencia.md    # Las cuatro interfaces y sus tres implementaciones
│   └── casos-de-uso.md  # Reclamos, reservas, comunicación, carga asistida, indicadores, exportación
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (panel)/
│   │   ├── reclamos/                  # bandeja, alta, detalle con historial y sugerencia   (CU-07, CU-08, CU-14)
│   │   ├── reservas/                  # calendario por espacio, alta, cancelación          (CU-09)
│   │   ├── espacios/                  # ABM de espacios comunes
│   │   ├── novedades/                 # listado y publicación                              (CU-12)
│   │   ├── documentos/                # carga, listado, consulta con citas                 (CU-15, CU-10)
│   │   ├── gastos/asistida/           # subir comprobante suelto → formulario precargado   (CU-13)
│   │   ├── indicadores/               # panel I-6 y una página por I-1 a I-5, Recharts     (CU-11)
│   │   └── pendientes/                # botón «enviar avisos ahora», estado de la cola
│   └── api/
│       ├── exportar/[consorcio]/[tabla]/route.ts   # CSV                                    (FR-032b)
│       └── tareas/refrescar-vistas/route.ts        # tarea programada con secreto           (FR-018)
├── aplicacion/
│   ├── reclamos/                      # registrar, transicionar, asignar, sugerencia
│   ├── reservas/                      # espacios, reservar, cancelar
│   ├── comunicacion/                  # notificar, despachar, novedades, documentos, consultar
│   ├── gastos/extraccion.ts           # iniciar, ver, confirmar, descartar
│   ├── indicadores/                   # ver*, refrescarVistas
│   ├── pendientes/manejadores.ts      # + notificacion, extraccion_comprobante, triage_reclamo, indexar_documento
│   └── dependencias.ts                # + ASISTENCIA elegida por entorno
├── dominio/
│   ├── contratos/asistencia.ts        # las cuatro interfaces
│   ├── contratos/notificador.ts       # + enviarNotificacion
│   ├── reclamos/estado.ts             # máquina de estados pura
│   └── documentos/fragmentar.ts       # párrafos y artículos, sin base
├── infraestructura/
│   ├── asistencia/
│   │   ├── gemini.ts                  # proveedor            ┐
│   │   ├── determinista.ts            # pruebas              ├ exactamente tres (SC-012)
│   │   └── nula.ts                    # degradación          ┘
│   ├── documentos/texto-pdf.ts        # unpdf
│   ├── repositorios/fragmentos.ts     # escritura del vector y la única búsqueda, con WHERE de consorcio
│   ├── repositorios/indicadores.ts    # lectura de las vistas
│   └── correo/resend.ts               # + enviarNotificacion
└── compartido/csv.ts                  # serialización con BOM y `;`

prisma/migrations/                     # una por bloque; exclusión, CHECK, HNSW, vistas y disparadores a mano
pruebas/
├── dominio/reclamos/ · dominio/documentos/
├── integracion/                       # SC-003 a SC-008, SC-012, SC-016, SC-017, SC-021, SC-022
├── e2e/                               # CU-07 a CU-15 con la determinista + a11y de reclamo y reserva
└── fixtures/juego-13-4.ts             # + espacios, reclamos, reglamento
scripts/
├── validar-indicadores.mjs            # SC-009
└── exportar-verificar.mjs             # SC-018
```

**Structure Decision**: se conserva la estructura por capas sin proyectos nuevos. Los únicos
agregados de forma son `src/infraestructura/asistencia/` —una carpeta con nombre para que SC-012 sea
una cuenta de archivos— y `src/aplicacion/comunicacion/`, que junta notificaciones, novedades y
documentos porque los tres son «lo que el consorcio le dice al consorcista» y comparten `notificar`.

## Complexity Tracking

| Violación | Por qué se necesita | Alternativa más simple, y por qué se rechaza |
| --- | --- | --- |
| Dos dependencias nuevas (`@google/genai`, `unpdf`) | El SDK tipado del proveedor decidido en § 14.3; texto por página de PDF sin DOM para la cita | REST a mano (tipos y errores propios que la PoC pudo ignorar y producción no); pedirle el texto al proveedor (200 llamadas por un reglamento de 200 páginas y la degradación arrastra al texto) |
| `ExtraccionComprobante` con `consorcio_id` y `clave_objeto`, contra el diccionario que la ata a `Comprobante` | El comprobante existe antes que el gasto, y `Comprobante.gasto_id` es `NN` desde `002` | Relajar `gasto_id`: deja una tabla sin `consorcio_id` con filas huérfanas fuera del aislamiento, que es la fuga de RT-04 que `003` ya encontró una vez |
| Dos consultas SQL fuera de la extensión de aislamiento (fragmentos, vistas) | `pgvector` y las vistas materializadas no pasan por el cliente de modelos | Mapear las vistas como modelos de Prisma (función en vista previa y sin el `ORDER BY` vectorial). Ambas consultas viven en un repositorio, exigen `consorcioActivo()` y tienen su prueba con dos consorcios |
| Vistas materializadas más una tarea programada | SC-010 sobre ~600.000 registros no entra agregando por pedido | Vistas comunes: cumplirían la exactitud y no el presupuesto de 2 s |
| Cuatro tipos de trabajo nuevos en una cola pensada para correo | Extracción (hasta 86 s medidos), triage, indexación y despacho no pueden ir en el pedido | Un mecanismo por función: cuatro máquinas de reintento donde ya hay una |
