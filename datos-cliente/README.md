# Datos "del cliente" — Grupo Delta (ficticios, verosímiles)

> Origen: inventados por el equipo ante la inexistencia de cliente real. Uso: PoC §8.4.3,
> validación en paralelo (paquete 4.6, `PL-01 a PL-10`) y fixtures de pruebas.
> La demostración final usa únicamente el juego ficticio §13.4 (hash versionado), 0 datos reales.

| Dato | Ubicación | Uso |
|---|---|---|
| Lista semilla de rubros | `rubros-semilla.csv` | FR-014 (002), RF-04/RF-11/RF-12 |
| 3 liquidaciones "reales" (planilla del cliente) | `liquidaciones-reales/` | FR-027 (002), SC-005 (003), RT-01 |
| 30 comprobantes (índice PoC extracción) | `comprobantes/indice-30.csv` | PoC §8.4.3 umbral 80 % (`004` FR-001) |
| Reglamento + 20 preguntas | `reglamento/` | PoC §8.4.3 umbral 85 % top-3 (`004` FR-001) |
| Juego ficticio §13.4 (12 + 96 uds, 12 períodos, mora, reclamos, usuarios) | `juego-ficticio-13-4/` | Fixtures integración/e2e, SC-001/SC-006, demo final |

Convenciones: importes como cadena con 2 decimales, coeficientes con 8 decimales que suman
exactamente `100.00000000` por consorcio (RN-01). CUITs y personas ficticias; cualquier
coincidencia es casual. Moneda ARS.
