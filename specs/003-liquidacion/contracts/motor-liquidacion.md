# Contrato — Motor de liquidación (dominio)

Vive en `src/dominio/liquidacion/`. **No importa nada de infraestructura ni del entorno web**
(`FR-004`, Principio III) y se prueba con `DATABASE_URL` sin definir (SC-002). Se escribe con
pruebas primero (`FR-005`, § 8.3.3).

Todos los importes entran y salen como `Importe` (`decimal.js` vía `@/compartido/dinero`). Ninguna
firma acepta ni devuelve el tipo numérico nativo para dinero o coeficientes.

## `prorratear`

```text
prorratear(entrada: EntradaDeProrrateo): ResultadoDeProrrateo
```

**Entrada**: total ordinario, total extraordinario, y el padrón como lista de
`{ unidadId, designacion, coeficiente }`.

**Salida**: una línea por unidad con `importeOrdinario`, `importeExtraordinario`,
`coeficienteAplicado` y `ajusteRedondeo`; más los totales.

Reglas que el contrato promete:

1. Verifica **antes de calcular nada** que los coeficientes sumen `100.00000000`; si no, aborta
   nombrando la diferencia exacta y las unidades (`FR-006`, SC-004).
2. Redondea a dos decimales **sólo al final de cada importe unitario** (`FR-008`).
3. La diferencia de redondeo va entera a la unidad de mayor coeficiente, en `ajusteRedondeo`, no
   sumada al importe (`FR-009`). Empate de coeficiente: gana el identificador menor, para que dos
   corridas den lo mismo.
4. Si la diferencia supera **un centavo por unidad**, **aborta** (`FR-010`). Eso no es redondeo.
5. La suma de los importes iguala el total con **tolerancia cero** (SC-001).
6. El prorrateo es sobre el padrón completo: no existe reparto por grupo de unidades (`FR-006b`).

## `interesPorMora`

```text
interesPorMora(deuda: DeudaVencida[], tasaMensual: Importe, alDia: Date): InteresCalculado
```

**Entrada**: una lista de liquidaciones impagas con `{ liquidacionId, capital, vencimiento }`, la
tasa mensual del consorcio y la fecha de cálculo.

**Salida**: el total y **el desglose**: una línea por liquidación con capital, tasa, meses e importe.

Reglas:

1. Interés **simple por mes vencido completo**: `capital × tasa × meses` (`FR-024`).
2. Los meses se cuentan **por cada liquidación desde su propio vencimiento**, no sobre el saldo total
   desde el más antiguo.
3. Veintinueve días de atraso son **cero meses**, y por lo tanto interés cero.
4. No capitaliza: el segundo mes se calcula sobre el mismo capital que el primero.
5. Tasa cero da interés cero sin caso especial.

## `imputar`

```text
imputar(importe: Importe, impagos: DetalleImpago[]): ResultadoDeImputacion
```

**Entrada**: el importe del pago y los detalles impagos de **esa unidad**, con su saldo y su
vencimiento.

**Salida**: las imputaciones `{ detalleId, importeImputado }` y el `sobrante`.

Reglas:

1. Recorre de la más **antigua** a la más nueva por vencimiento (regla RN-08 § 7.2).
2. `suma(imputaciones) + sobrante = importe`, con **tolerancia cero** (`FR-023`, SC-009).
3. Un pago que excede la deuda deja todo el resto en `sobrante`; el contrato no sabe qué se hace con
   él, eso lo decide la aplicación (`FR-026`).

## Lo que el dominio **no** hace

No abre transacciones, no lee ni escribe la base, no sabe qué es un usuario ni un rol, no genera
documentos y no envía nada. Todo eso es de la capa de aplicación, que además es la que autoriza por
par (rol, consorcio) y la que registra la auditoría.
