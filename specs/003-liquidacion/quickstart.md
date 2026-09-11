# Quickstart — 003-liquidacion

Cómo se valida la etapa de punta a punta. Quien clona arranca en `002-nucleo/quickstart.md`; esto
agrega lo propio de la liquidación.

## Preparar

1. Todo lo de `002`: base, `.env`, `npm run db:deploy`, `npm run semilla`.
2. `npm run db:deploy` aplica las migraciones de esta etapa: los dos campos de `Consorcio`,
   `Liquidacion` con su índice único parcial, `DetalleLiquidacion`, `InteresLiquidado`, `Pago`,
   `PagoImputacion` y `Notificacion`.
3. `npm run semilla` deja los dos consorcios de § 13.4 con su día de vencimiento y su tasa de mora.

## Validar

| # | Qué se corre | Qué prueba |
|---|---|---|
| 1 | `npm run verificar` | La puerta completa, ahora con el motor |
| 2 | `npm run test:dominio` | Prorrateo, interés e imputación **sin base de datos** (SC-002) |
| 3 | `npm run test:integracion` | Transacción única, candado de emisión, reversión de imputaciones, auditoría |
| 4 | `npm run test:e2e` | `CU-03`, `CU-04` y `CU-06` en escritorio y teléfono |
| 5 | `npm run test:a11y` | Descarga de la expensa propia, cero infracciones A y AA (SC-016) |
| 6 | `npm run validar:planillas` | Las **tres** liquidaciones reales, importe por importe (SC-005) |
| 7 | `npm run medir:liquidacion` | 100 unidades bajo 30 s, 5 corridas (SC-006) |

El orden importa por lo mismo que en `002`: `test:integracion` **vacía** las tablas de negocio.

## La validación contra las planillas (paquete 4.6)

Es la prueba que decide si el motor sirve. Los insumos ya están versionados en
`datos-cliente/liquidaciones-reales/`: `padron-coeficientes.csv`, los tres `gastos-2026-NN.csv` y
los tres `planilla-2026-NN.csv` con el valor esperado por unidad, incluido `ajuste_redondeo`.

`npm run validar:planillas` carga el padrón y los gastos de cada mes, ejecuta la liquidación y
compara **al centavo** contra la planilla. Una diferencia no es una discrepancia de criterio: es un
defecto abierto hasta que se explique (`FR-032`).

El resultado se registra en `docs/entrega-final/15-pruebas.md`, casos `PL-01` a `PL-10` (`FR-033`).

## Comprobaciones que no pasan por la capa de aplicación

- **Emisión doble concurrente**: dos transacciones contra el mismo período con una barrera; el
  índice único parcial deja pasar exactamente una (SC-011, M-07).
- **Reemisión después de anular**: con el período todavía en `liquidado`, una liquidación nueva
  entra porque la anterior ya no está `vigente` (`FR-003b`).
- **Auditoría**: cada operación sobre las cinco tablas económicas deja exactamente un asiento
  (SC-012), y la aplicación sigue sin poder tocar la bitácora.

## Recorrido manual de la demostración

Sobre el entorno desplegado, sin ningún paso desde una máquina de desarrollo:

1. Cerrar el período del mes y liquidarlo; ver los totales y la fecha de vencimiento.
2. Generar los documentos y ver el progreso hasta las 96 unidades.
3. Entrar como consorcista desde un teléfono, descargar la expensa propia, y pedir la de otra unidad
   por identificador directo: «no encontrado».
4. Registrar un pago que cubre una liquidación y media, y ver la imputación por antigüedad.
5. Registrar un pago que excede la deuda y ver el saldo a favor descontado en la liquidación
   siguiente.
6. Anular la liquidación, emitir de nuevo, y ver las dos registradas y vinculadas.
