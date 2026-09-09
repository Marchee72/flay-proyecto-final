# GET /api/salud

Lo único que la aplicación hace al cerrar la etapa (FR-017). Lo verifican e2e y el deploy.

- Request: `GET /api/salud`
- Response 200: `{ "estado": "ok", "version": "<semver>", "migracion": "<id-migracion-aplicada>" }`
- Reglas: `version` cambia por deploy para probar SC-007 (integrar cambio de versión y verlo en demo <10 min sin acción manual); con verificación en rojo, 0 despliegues.
