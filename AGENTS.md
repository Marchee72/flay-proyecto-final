# AGENTS.md

This file provides guidance to OpenCode when working with code in this repository.

Fuente de verdad: [`CLAUDE.md`](./CLAUDE.md). Todo lo allí definido (qué es Flay,
organización de `docs/`, convenciones, códigos `RF-nn`/`RNF-nn`/`RN-nn`/`RT-nn`/`CU-nn`,
arquitectura en capas, stack § 14.1, invariantes no negociables, proceso de desarrollo
y definición de terminado § 8.3.4) rige también para OpenCode. En caso de
contradicción entre ambos archivos, prevalece `CLAUDE.md`.

Diferencias propias de OpenCode:

- Skills con la herramienta nativa `skill` (equivalente a `Skill` en Claude Code).
  Flujo Spec Kit vía skills `speckit-constitution` → `speckit-specify` → `speckit-plan`
  → `speckit-tasks` → `speckit-implement` (opcionales: `speckit-clarify`,
  `speckit-analyze`, `speckit-checklist`), con scripts PowerShell (`--script ps`).
- Subagentes con la herramienta nativa `task` (`ContextScout`, `ExternalScout`,
  `TaskManager`, `DocWriter`, etc.) y lista de tareas con `todowrite`.
- El idioma del proyecto es **español**: documentación, nombres de entidades,
  mensajes de commit y comunicación. Mantenerlo.
