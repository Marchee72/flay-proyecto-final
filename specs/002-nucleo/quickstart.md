# Quickstart — 002-nucleo

Cómo se valida la etapa de punta a punta. Los pasos 1 a 3 ya los dejó `001-andamiaje`; quien clona
arranca en el 4. Cada paso dice qué criterio prueba.

## Preparar

1. `npm ci` y `npx playwright install chromium`.
2. Base local: `docker run -d --name flay-db -p 5432:5432 -e POSTGRES_PASSWORD=flay_local -e POSTGRES_DB=flay pgvector/pgvector:0.8.6-pg18`.
3. `.env` desde `.env.example`; `npm run db:preparar` crea roles, extensiones y base sombra.
4. `npm run db:deploy` aplica las migraciones de esta etapa: habilitaciones, unidades con el
   disparador diferido, exclusión de ocupaciones, gastos, comprobantes y trabajos pendientes.
5. `npm run semilla` carga el juego de § 13.4: dos consorcios de 12 y 96 unidades, personas,
   usuarios, rubros y proveedores (FR-028). Es determinística: dos corridas dan lo mismo.
6. El primer administrador sale de la semilla de arranque, con la contraseña en variable de
   entorno (FR-005). No hay usuario por defecto en el repositorio.

## Validar

| # | Qué se corre | Qué prueba |
|---|---|---|
| 1 | `npm run verificar` | La puerta completa de `001`, ahora con las pruebas de esta etapa |
| 2 | `npm run test:dominio` | Coeficientes y contrato de estado del período, **sin base** (Principio III) |
| 3 | `npm run test:integracion` | Aislamiento por consorcio y por rol, invariantes de la base, auditoría y drenaje de pendientes |
| 4 | `npm run test:e2e` | `CU-01`, `CU-02` y `CU-05` en escritorio y en teléfono de 390 px |
| 5 | `npm run test:a11y` | Las tres pantallas del consorcista, cero infracciones A y AA (SC-011) |
| 6 | `npm run semilla:volumen && npm run medir:p95 /gastos` | 10.800 gastos y el listado bajo 2 s en caliente (SC-006); el arranque en frío se informa aparte (SC-006b) |

## Comprobaciones que no pasan por la capa de aplicación

Son las que prueban que el invariante lo impone la **base** y no el código. Van con conexión
directa, salteándose la aplicación a propósito:

- Dos transacciones concurrentes que dejan la suma de coeficientes en `99.99999999`: la base
  rechaza al menos una (SC-004b).
- Una segunda ocupación vigente del mismo tipo sobre la misma unidad: la base la rechaza por
  exclusión (SC-005).
- `INSERT`, `UPDATE` y `DELETE` sobre la bitácora con el rol de la aplicación: los tres fallan
  (SC-008).

## Recorrido manual de la demostración (`SC-014`)

Sobre el entorno desplegado, **sin ningún paso desde una máquina de desarrollo**:

1. Iniciar sesión como administrador, invitar a una persona como consorcista de un consorcio.
2. Alta del consorcio de 12 unidades; intentar cerrar con la suma en `99.99999999` y ver el
   rechazo con la diferencia exacta.
3. Abrir el período del mes, cargar un gasto con comprobante y ver el asiento en la bitácora.
4. Entrar como el consorcista invitado desde un teléfono: ve sólo su consorcio, filtra por período
   y rubro, abre un comprobante.
5. Intentar, desde esa sesión, abrir un gasto del otro consorcio por identificador directo en la
   dirección: «no encontrado».

El paso 5 es el que demuestra el Principio I ante el cliente, y por eso está en el guion.
