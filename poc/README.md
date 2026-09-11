# Pruebas de concepto de § 8.4.3 — desechables

Código exploratorio que decide, con números, si `RF-06` (extracción de comprobantes) y `RF-20`
(consulta documental) se construyen completos, reducidos o postergados, y qué proveedor se elige
en § 14.3. **Ninguna línea de esta carpeta pasa a `src/`** (spec `004-servicios`, US1, escenario 5):
queda fuera de `lint` y del `tsconfig`, y tiene su propio `package.json`.

| Guion | Qué hace | Umbral |
|---|---|---|
| `node poc/generar-comprobantes.mjs` | Rendea los 30 comprobantes de `datos-cliente/comprobantes/indice-30.csv` en `archivos/` (PDF y fotos con defectos) | — |
| `node poc/poc-extraccion.mjs <anthropic\|gemini\|mistral> [--limite N]` | Extrae cinco campos de cada comprobante y los compara con el índice | ≥ 80 % de campos correctos |
| `node poc/poc-busqueda.mjs <voyage\|gemini\|mistral\|lexico>` | Un fragmento por artículo del reglamento, vectores, coseno, top-3 | ≥ 85 % de preguntas con el artículo entre los tres primeros |

`lexico` es la línea de base sin proveedor (TF-IDF): no cuesta nada y da **16/20 = 80 %**. Un
proveedor de vectores tiene que ganarle; si no le gana, no se paga por él.

Claves en `.env` (ver `.env.example`); alcanza con la del proveedor que se corre. Los modelos se
cambian por variable de entorno (`ANTHROPIC_MODELO`, `GEMINI_MODELO`, `VOYAGE_MODELO`, …). Cada
corrida deja su detalle en `poc/resultados/<prueba>-<proveedor>.json`, que es lo que se cita en
`docs/entrega-final/14-codificacion.md` § 14.3 y en `15-pruebas.md`.

Instalación: `cd poc && npm install` (solo el SDK de Anthropic y Zod 4; el resto va por REST).
