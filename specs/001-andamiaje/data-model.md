# Data Model — 001-andamiaje (Phase 1)

Única entidad de la etapa (transversal). Ninguna entidad de negocio nace aquí.

## BitacoraAuditoria (RF-26, RN-15 §7.2, RNF-12)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID (`pgcrypto`) | PK, no secuencial (§12.3) |
| `momento` | timestamptz | default ahora |
| `usuario` | texto | quién originó (de sesión/disparador) |
| `tabla` | texto | tabla afectada |
| `clave` | texto | PK de la fila |
| `operacion` | `INSERTA\|MODIFICA\|BORRA` | |
| `anterior` | JSONB nulo | imagen previa |
| `posterior` | JSONB nulo | imagen posterior |
| `creado_en` / `actualizado_en` | timestamptz | convención §7.4 |

Reglas: poblada solo por `fn_auditar()` (`SECURITY DEFINER`) instalado por tabla económica;
`REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "BitacoraAuditoria" FROM flay_app`.
Estados: N/A (solo agregado). Validación: toda operación sobre tabla con trigger deja 1 asiento
con anterior+posterior (SC-006 sobre tabla de prueba; SC-007/SC-008 en 002/003 la extienden).
