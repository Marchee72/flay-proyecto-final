# Implementation Plan: Asambleas de consorcio

**Branch**: `feat/asambleas` | **Date**: 2026-11-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/016-asambleas/spec.md`

## Summary

La asamblea entera pasa a vivir en Flay:

- convocatoria con orden del día fijo y enlace a Google Calendar o `.ics`;
- poderes por asamblea;
- padrón congelado al abrir, con asistencia, quórum y unidades sin voto por mora;
- votación por unidad en vivo, binaria o de opción múltiple, con voto modificable hasta cerrar el punto;
- resultado por doble cómputo (unidades y coeficientes);
- decisión provisoria con oposición de ausentes (CCyC 2060);
- acta redactada después y firmada electrónicamente por cuatro personas, que termina como
  `DocumentoConsorcio` de tipo `acta`.

**Enfoque técnico clave**:

1. **Todo el cómputo es dominio puro.** Quórum, habilitación para votar, resultado de un punto y
   estado de la decisión provisoria viven en `src/dominio/asambleas/`, en `Decimal` y con TDD.
2. **Al abrir la asamblea se congela el padrón.** Se guarda una fila por unidad vigente, con su
   coeficiente y si está sin voto. Todo cálculo posterior sale de esa foto, no del padrón vivo, así
   un cambio de coeficiente o de deuda durante la reunión no mueve un resultado.
3. **La inmutabilidad la pone la base.** Hay una clave única de un voto por unidad y por punto, y
   disparadores que rechazan modificar un voto, votar fuera de un punto abierto o tocar una
   asamblea finalizada.
4. **La vista en vivo es `EnVivo`**, que refresca cada 3 s y solo se monta mientras la asamblea está
   en curso.
5. **Las tablas nuevas llevan todas `consorcio_id`.** Así la extensión de aislamiento las filtra y
   no se repite la trampa de la nota 10 de `CLAUDE.md`.

## Technical Context

**Language/Version**: TypeScript sobre Next.js (App Router), Node.

**Primary Dependencies**:

- Prisma, Zod y Auth.js + Argon2id, para volver a pedir la contraseña al firmar;
- `@react-pdf/renderer`, para el acta;
- `node:crypto`, para la huella SHA-256.

No se agregan dependencias: el `.ics` y el enlace de Google Calendar se arman a mano.

**Storage**: PostgreSQL con migración versionada. El almacén de objetos existente (`ALMACEN`)
guarda los PDF del acta.

**Testing**:

- Vitest de dominio, con TDD obligatorio para quórum, mayorías y provisoria, porque deciden sobre
  coeficientes;
- Vitest de integración contra la base local;
- Playwright e2e en teléfono 390×844, más axe.

**Target Platform**: web en despliegue único (Vercel). Se usa en teléfono dentro de la sala
(RNF-01).

**Project Type**: aplicación web en capas (Presentación → Aplicación → Dominio, con
Infraestructura al costado).

**Performance Goals**:

- el voto se ve en los demás teléfonos en ≤ 5 s (SC-001);
- emitir un voto lleva una sentencia;
- la pantalla en vivo resuelve en una sola consulta por refresco, entrando por `Asamblea`;
- consultas < 2 s p95 (RNF-06).

**Constraints**:

- coeficientes en decimal, nunca `number` (Principio II);
- aislamiento en un solo punto (Principio I);
- auditoría por disparadores (RN-15);
- ningún voto se modifica (FR-022);
- orden del día fijo desde la convocatoria (FR-004).

**Scale/Scope**: consorcios de hasta ~100 unidades, con decenas de presentes que refrescan cada
3 s durante una o dos horas. Son seis pantallas nuevas y una sección de configuración.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Aislamiento por consorcio (NO NEGOCIABLE)**: ✅ Cumple.
  - Cada tabla nueva lleva `consorcio_id`, así que la extensión la filtra sin escribir el filtro a
    mano, y nada entra a la lista blanca de `pruebas/dominio/filtro-unico.spec.ts`.
  - La autorización pasa por `conAutorizacion`.
  - Cada prueba de integración afirma que un usuario de otro consorcio no ve, no vota y no firma
    (SC-005).
  - Un poder no da habilitación nueva: el apoderado ya tiene que estar habilitado en el consorcio
    (FR-010).
- **II. Exactitud del dinero (NO NEGOCIABLE)**: ✅ Cumple.
  - No se mueve dinero, pero los coeficientes son decimales de ocho cifras: todo cómputo usa
    `Decimal`, y el coeficiente se copia al padrón congelado, como RN-02.
  - La deuda para la mora se toma de `saldoImpagoPorUnidad`, que ya existe; no se recalcula.
- **III. El dominio no conoce la infraestructura**: ✅ Cumple. `src/dominio/asambleas/` es puro:
  recibe el padrón, los votos y la regla, y devuelve el resultado. La aplicación orquesta y
  persiste.
- **IV. La asistencia automática no decide**: ✅ No aplica. No interviene IA; el acta firmada solo
  pasa por la indexación existente.
- **V. Auditoría completa e inviolable**: ✅ Cumple.
  - `fn_auditar` cubre asamblea, puntos, padrón, votos, poderes, oposiciones, firmas y la
    configuración (FR-038).
  - Los disparadores de inmutabilidad viven en la base, así que ninguna ruta de código los
    esquiva.
  - Excepción documentada en research R-02: `DELETE` queda permitido a la base por la limpieza de
    pruebas. La aplicación no lo expone, y cada borrado queda auditado.

Sin violaciones; no se requiere *Complexity Tracking*.

**Re-check post-diseño**: el modelo de datos y los contratos mantienen los cinco puntos. La única
excepción es el `DELETE` de R-02, que queda justificado allí.

## Project Structure

### Documentation (this feature)

```text
specs/016-asambleas/
├── plan.md              # Este archivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/
│   └── contratos.md     # Casos de uso, acciones, rutas y funciones de dominio
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                                  # + 8 modelos, + campos de asamblea en Consorcio, + enums
└── migrations/<nueva>_asambleas/migration.sql     # tablas, únicos, disparadores de inmutabilidad y fn_auditar

src/
├── dominio/asambleas/                             # NUEVO, puro, TDD
│   ├── estado.ts                                  # máquinas de estado de asamblea, punto y acta
│   ├── quorum.ts                                  # quórum y convocatoria que rige
│   ├── resultado.ts                               # binario (3 umbrales × 2 bases) y opción múltiple
│   ├── provisoria.ts                              # firme / provisoria / caída
│   ├── poderes.ts                                 # tope por apoderado
│   └── calendario.ts                              # enlace de Google Calendar y texto .ics
├── aplicacion/asambleas/                          # NUEVO
│   ├── convocar.ts                                # crear, editar borrador, convocar, cancelar
│   ├── poderes.ts                                 # otorgar, revocar, registrar en papel
│   ├── conducir.ts                                # abrir, presencia, autoridades, abrir/cerrar punto, finalizar, tomar dirección
│   ├── votar.ts                                   # votar y cargar voto manual
│   ├── ver.ts                                     # listar y ver en vivo (una consulta)
│   ├── oposicion.ts                               # oponerse y registrar oposición en papel
│   ├── acta.ts                                    # redactar, enviar a firmar, firmar, publicar
│   ├── configuracion.ts                           # reglas de asamblea del consorcio
│   └── recordatorios.ts                           # firmas pendientes a los 10 días (tarea diaria)
├── aplicacion/pendientes/manejadores.ts           # + correo_directo
├── infraestructura/documentos/acta.tsx            # NUEVO: plantilla PDF del acta + hoja de firmas
├── dominio/contratos/documentos.ts                # + ActaParaDocumento en GeneradorDeDocumentos
└── app/
    ├── (panel)/consorcios/[consorcio]/asambleas/  # NUEVO
    │   ├── page.tsx                               # lista
    │   ├── nueva/                                 # alta con orden del día
    │   ├── configuracion/                         # reglas (administrador)
    │   └── [asamblea]/
    │       ├── page.tsx                           # según estado: borrador, convocada (poderes), en vivo, finalizada
    │       ├── en-vivo/                           # componentes de la sala (punto, conteo, votar, dirigir)
    │       ├── acta/page.tsx                      # redacción y firma
    │       └── acciones.ts                        # server actions
    ├── (panel)/secciones.ts                       # + «Asambleas» en Convivencia
    ├── avisos.tsx                                 # + claves de HECHO
    ├── api/asambleas/[asamblea]/ics/route.ts      # descarga .ics (autenticada)
    └── api/tareas/asambleas/route.ts              # tarea diaria de recordatorios (CRON_SECRET)

pruebas/
├── dominio/asambleas/{quorum,resultado,provisoria,poderes,estado,calendario}.spec.ts
├── integracion/asambleas.spec.ts                  # aislamiento, inmutabilidad, voto único, firma
└── e2e/asambleas.spec.ts                          # teléfono: convocar → votar en vivo → firmar
```

Documentación del cambio de alcance:

- RF-29 a RF-33 y quitar la exclusión en `docs/entrega-1/04-alternativas-solucion.md`;
- RN nuevas en `docs/entrega-3/07-analisis-de-datos.md` § 7.2;
- CU nuevos, trazabilidad y tabla de notificaciones en `docs/entrega-3/12-diseno.md`;
- manual de usuario (`docs/entrega-final/16-manual-usuario.md`).

**Structure Decision**: es la aplicación en capas que ya existe, siguiendo el corte de reservas y
reclamos. El cómputo es dominio puro, la orquestación vive en `aplicacion/asambleas/` y la
persistencia en una migración. Se reutilizan:

- `conAutorizacion`;
- `notificar`;
- `saldoImpagoPorUnidad`;
- `ocupaciones.ts`;
- `EnVivo`;
- el patrón de PDF de la expensa;
- `DocumentoConsorcio` con su indexación;
- la cola `TrabajoPendiente`.

## Complexity Tracking

Sin violaciones de la constitución; sección no aplica.
