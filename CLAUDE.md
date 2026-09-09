# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and, via `AGENTS.md`, to OpenCode when working with code in this repository.

## Qué es este repositorio

**Flay — Tu consorcio online**: sistema web de administración de consorcios de propiedad horizontal.
Proyecto Final de Ingeniería en Sistemas de Información (UTN FRRo, cursada 2026), de Lautaro
Marchetti y Franco Ferrero.

Existen `docs/` (18 documentos que siguen el cronograma de la cátedra), el andamiaje de Spec Kit
(`.specify/`, `.claude/skills/speckit-*`) y, desde `001-andamiaje`, el proyecto Next.js con la
estructura por capas. El código se construye en tres iteraciones durante 2026.

El idioma del proyecto es **español**: documentación, nombres de entidades, mensajes de commit y
comunicación. Mantenerlo.

## Comandos

`npm run verificar` es la **puerta única**: nada del repositorio invoca otra cosa. Encadena
`format:check` → `lint` → `typecheck` → `test:dominio` → `db:deploy` → `db:drift` →
`test:integracion` → `build` → `test:e2e`, en ese orden, para que lo que no necesita base falle en
el primer minuto.

| Guion | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run lint` / `format:check` / `typecheck` | Análisis estático; `lint` incluye `flay/sin-aritmetica-monetaria` |
| `npm run test:dominio` | Vitest sin base de datos (SC-002) |
| `npm run test:integracion` | Vitest contra la base local |
| `npm run test:e2e` / `test:a11y` | Playwright escritorio + teléfono 390×844 / axe A/AA |
| `npm run db:deploy` / `db:drift` | Migraciones y detección de deriva |
| `npm run medir:p95` | Arnés de RNF-06 sobre `/api/salud` |

Base local: `docker run -d --name flay-db -p 5432:5432 -e POSTGRES_PASSWORD=flay_local -e POSTGRES_DB=flay pgvector/pgvector:pg17`.
Variables en `.env` (nunca versionado); plantilla en `.env.example`. `DATABASE_URL` es la cadena de
`flay_app` y `DIRECT_DATABASE_URL` la de `flay_owner`: la aplicación no tiene DDL, las migraciones sí.

Las fixtures de `pruebas/fixtures-negativas/` **deben** fallar: quedan fuera de `lint` y `typecheck`,
y las corre `pruebas/integracion/fixtures-negativas.spec.ts` afirmando el mensaje esperado.

Spec Kit está instalado con scripts PowerShell (`--script ps`). Flujo de trabajo para funcionalidad
nueva, vía skills: `/speckit-constitution` → `/speckit-specify` → `/speckit-plan` → `/speckit-tasks`
→ `/speckit-implement`. Opcionales: `/speckit-clarify` (antes de plan), `/speckit-analyze`,
`/speckit-checklist`.

## Cómo está organizada la documentación

`docs/README.md` es el índice con el estado de cada documento.
`docs/requisitos-catedra.md` es la **fuente de verdad**: consigna transcripta y mapeo punto→documento.

Los directorios `entrega-1/`, `entrega-2/`, `entrega-3/`, `entrega-final/` corresponden a las cuatro
entregas académicas; los archivos llevan el número del punto de la consigna (`07-`, `12-`, …). Las
entregas 1 a 3 (puntos 1–12) están completas; la última (puntos 13–18) son esqueletos con secciones
marcadas *"A completar"*, que se llenan durante la construcción.

Convenciones al editar docs:

- Diagramas en **Mermaid** (renderizan en GitHub). Sin acentos ni caracteres especiales dentro de los
  nodos Mermaid — el resto del texto sí los lleva.
- Cada documento abre citando el requisito de la cátedra en un blockquote.
- Al cambiar el estado de un documento, actualizar la tabla de `docs/README.md` y la de `README.md`.
- Nunca romper las referencias cruzadas entre puntos (`punto 5.5`, `§ 9.11`, `RN-07`): son la
  trazabilidad que la cátedra evalúa.

### Códigos de trazabilidad

Se usan en toda la documentación y deben usarse en el código y en los mensajes de commit:

| Prefijo | Significado | Dónde se define |
|---|---|---|
| `RF-nn` | Requerimiento funcional | `docs/entrega-1/04-alternativas-solucion.md` |
| `RNF-nn` | Requerimiento no funcional | idem |
| `RN-nn` | Regla de negocio | `docs/entrega-3/07-analisis-de-datos.md` § 7.2 |
| `RT-nn` | Riesgo técnico | `docs/entrega-3/11-analisis-de-riesgos.md` |
| `CU-nn` | Caso de uso | `docs/entrega-3/12-diseno.md` § 4 |

## Arquitectura comprometida

Definida en `docs/entrega-3/12-diseno.md`. Lo esencial:

**Arquitectura en capas dentro de un despliegue único** (no microservicios — decisión deliberada por
la capacidad del equipo, punto 5.5). Presentación → Aplicación → Dominio; Aplicación e Infraestructura
al costado. La regla de dependencia apunta al dominio: **el dominio define interfaces y la
infraestructura las implementa**; el dominio no conoce la base de datos ni el entorno web. Esto es lo
que permite probar la liquidación sin base de datos.

- **Presentación**: vistas y formularios. Sin reglas de negocio, sin acceso directo a la base.
- **Aplicación**: orquesta casos de uso, verifica autorización por rol y por consorcio, abre
  transacciones, registra auditoría. Sin cálculos de negocio.
- **Dominio**: RN-01 a RN-15 — prorrateo, intereses, imputación.
- **Infraestructura**: repositorios, ORM, almacenamiento de objetos, correo, servicios externos.

### Stack

Decidido y justificado en `docs/entrega-final/14-codificacion.md` § 14.1: **TypeScript sobre
Next.js**, PostgreSQL administrado con `pgvector`, Prisma, Zod, Auth.js + Argon2id,
`@react-pdf/renderer`, Recharts, Vitest + Playwright, ESLint + Prettier.

Los documentos de **análisis y diseño** (puntos 1 a 12) describen capacidades, no marcas, y deben
seguir así: la consigna pide la elección de producto en el punto 14, no antes. **No introducir
nombres de producto en `docs/entrega-1/` a `docs/entrega-3/`.**

Sigue abierto el punto 14.3 (proveedor de servicios de IA), diferido a propósito hasta la
iteración 3.

**TypeScript no tiene decimal nativo** — es el único criterio que el lenguaje elegido incumple, y
§ 14.1 lo declara con cinco medidas de contención verificables. Las dos operativas al escribir
código: ninguna firma pública del dominio acepta ni devuelve `number` para dinero (se usa
`Prisma.Decimal`), y los importes se serializan hacia la interfaz como cadena, nunca como número.

### Invariantes que no se negocian

Estas atraviesan todo el sistema; violarlas es un defecto, no una preferencia de estilo:

1. **Aislamiento por consorcio en la capa de acceso a datos, no en cada consulta** (RN-12, RT-04). Un
   filtro olvidado expone datos ajenos. Se aplica en un solo lugar para que olvidarlo sea imposible.
2. **Aritmética decimal de precisión fija para todo importe. Punto flotante prohibido para dinero.**
   Coeficientes con ocho decimales; deben sumar exactamente 100,000000 %.
3. **Redondeo solo al final de cada importe unitario**, nunca en pasos intermedios. La diferencia se
   asigna a la unidad de mayor coeficiente, en un campo propio y auditable. Una diferencia mayor a un
   centavo por unidad **aborta** la liquidación: eso no es redondeo, es un defecto.
4. **Ninguna salida de un servicio automático impacta un dato económico sin confirmación humana**
   (RN-14). `ExtraccionComprobante` es una entidad separada de `Gasto`; el gasto nace al confirmar.
5. **Cada interfaz de IA del dominio** (`ExtractorDocumental`, `ClasificadorTexto`,
   `GeneradorVectores`, `GeneradorRespuesta`) **tiene tres implementaciones**: la del proveedor, una
   determinística para pruebas y una nula para degradación (RNF-14, RNF-15).
6. **Auditoría por disparadores de base de datos** (RN-15), sin permisos de update/delete para el
   usuario de la aplicación: ninguna ruta de código puede omitirla.
7. **Migraciones versionadas en el repositorio.** Ningún cambio manual sobre la base.

## Proceso de desarrollo

Definido en `docs/entrega-3/08-metodologia-desarrollo.md`: iterativo e incremental, tres iteraciones
(Núcleo → Liquidación → Servicios y análisis), con prácticas ágiles seleccionadas explícitamente.

- Una rama por requerimiento, integrada por pull request **con revisión obligatoria** del otro
  integrante. La rama principal siempre desplegable.
- Mensajes de commit que referencian el código de requerimiento (ej. `RF-07`).
- Versionado semántico, etiqueta por iteración cerrada.
- **TDD obligatorio** en liquidación, prorrateo, intereses e imputación de pagos. Opcional en el resto.

La **definición de terminado** (§ 8.3.4) tiene ocho condiciones. Las que se olvidan más seguido:
autorización por rol y consorcio verificada, funciona en teléfono (RNF-01), mensajes de error
comprensibles (RNF-10), auditoría registrada si toca datos económicos, documentación actualizada.

## Notas

- La organización cliente ("Grupo Delta") es **ficticia**, construida para el ejercicio académico.
- `cronograma_proyecto_2026.pdf` es el documento original de la cátedra; no editarlo.
- `.gitattributes` fuerza `eol=lf`.
