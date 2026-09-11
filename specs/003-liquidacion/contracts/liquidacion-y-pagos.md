# Contrato — Casos de uso de liquidación y pagos (aplicación)

Viven en `src/aplicacion/liquidacion/` y `src/aplicacion/pagos/`. Cada uno autoriza por par
(rol, consorcio) antes de tocar nada, abre su transacción y deja que la base audite. Reciben reloj y
repositorios por parámetro, como todo lo de `002` (punto de composición en
`src/aplicacion/dependencias.ts`).

Los importes cruzan hacia la interfaz **como cadena**, nunca como número (medida 3 de § 14.1).

## `cerrarPeriodo`

Rol: `administrador`. Lleva el período de `abierto` a `cerrado`. Desde ahí ningún gasto se agrega ni
se modifica (`FR-002`, regla RN-03 § 7.2). Reabrir a `abierto` es válido mientras no se haya
liquidado; después no (contrato de `002`, `FR-001`).

## `liquidarPeriodo`

Rol: `administrador`. **Una sola transacción** (`FR-013`) que:

1. Exige el período en `cerrado` y los coeficientes en `100.00000000`; si no, aborta diciendo qué
   falta (`FR-006`, RNF-10).
2. Llama al dominio: prorrateo, y para cada unidad el interés sobre **sus** liquidaciones impagas.
3. Aplica el saldo a favor de la unidad **después** del interés (`FR-026b`).
4. Persiste `Liquidacion`, `DetalleLiquidacion` e `InteresLiquidado` por lote; pasa el período a
   `liquidado`; encola un `TrabajoPendiente` por unidad para el documento; crea las `Notificacion`
   en `pendiente` (`FR-015`).
5. Falla entera o no falla: no existe liquidación a medias (SC-010).

El candado contra la emisión doble es el índice único parcial de la base, no una verificación previa
(research R-03): dos ejecuciones en paralelo terminan con exactamente una emitida (SC-011).

**Errores que el administrador tiene que poder leer**: período no cerrado, coeficientes que no
cierran —con la diferencia exacta—, y diferencia de redondeo por encima del umbral, que aborta y deja
incidente (`FR-010`).

## `anularLiquidacion`

Rol: `administrador`. Marca la liquidación `anulada`, revierte sus imputaciones marcándolas
—nunca borrándolas— y deja los pagos con saldo disponible (`FR-027`). **No toca el período**, que
sigue en `liquidado` (`FR-003b`). Después de esto, `liquidarPeriodo` vuelve a estar permitido y la
nueva liquidación referencia a la anulada.

## `generarDocumentos`

Rol: `administrador`. Disparo explícito del drenaje de los trabajos `documento_expensa` de esa
liquidación, acotado por tiempo, con progreso a la vista (`FR-016`, SC-007). El drenaje oportunista
de `002` sigue funcionando como red: un documento que falla se reintenta y **no** invalida la
liquidación emitida (`FR-019`).

## `verExpensa`

Roles: ocupante de la unidad, `administrador`, `consejo`. Devuelve el documento por lectura
autorizada. Una unidad ajena responde **«no encontrado»**, nunca «prohibido» (`FR-018`, SC-008),
igual que los comprobantes de `002`.

## `registrarPago`

Rol: `administrador`. Registra el pago e imputa por antigüedad en la misma transacción
(`FR-021`, `FR-022`). El excedente queda en `Pago.saldo_a_favor` (`FR-026`). La suma de imputaciones
más el saldo a favor iguala el importe del pago, con tolerancia cero (`FR-023`).

## `verEstadoDeCuenta`

Roles: ocupante de la unidad, `administrador`, `consejo`. Liquidaciones, pagos, imputaciones,
intereses con su desglose y saldo (`FR-028`).

## `verMorosidad`

La **nómina nominada** es sólo para `administrador` y `consejo`; el `consorcista` recibe únicamente
el dato agregado, sin un solo nombre (`FR-029`, regla RN-13 § 7.2, SC-015). No es un filtro de
pantalla: son dos consultas distintas, y la del consorcista no trae nombres.
