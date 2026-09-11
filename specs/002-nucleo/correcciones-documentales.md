# Correcciones documentales pendientes — 002-nucleo

Registro corrido de lo que la construcción encontró y las entregas 1 a 3 todavía no dicen. Se anota
acá para que la corrección se asiente donde corresponde y no reescribiendo entregas ya presentadas.

Abrió con la redefinición de roles del 2026-09-09, que destapó una contradicción **que ya existía**
entre documentos entregados; sigue con lo que salió después del cierre de la iteración 1.

## La contradicción

| Documento | Qué dice | Estado |
|---|---|---|
| § 6.2 (entrega 2) | Modelo adoptado: software como servicio. «El mismo software sirve a cualquier administradora de la ciudad sin modificaciones»; «permite amortizar el desarrollo entre varios clientes» | Correcto |
| § 9, factor 10 (entrega 3) | «El sistema se comercializa a múltiples administradoras sin modificaciones», grado 3 | Correcto |
| § 9, factor 13 (entrega 3) | «**Instancia única multiempresa, con aislamiento por consorcio y por administradora**», grado 3 | Correcto |
| § 7 (entrega 3) | 20 entidades, **ninguna es la administradora**. `Consorcio` es la raíz del aislamiento | **Incompleto** |
| § 7, `Habilitacion` | `rol` ∈ `administrador, operador, consejo, consorcista`, todos por consorcio | **Incompleto**: no hay nivel de empresa ni de plataforma |
| § 12 | Actores y matriz de acceso sobre esos mismos roles | **Incompleto** por arrastre |
| `RF-03` (entrega 1) | «Administrar usuarios y roles» | Sigue valiendo; cambia el conjunto de roles |

Los factores 10 y 13 entraron en el total de grados de influencia (46) y de ahí a los puntos de
función y a las 770 h: **el multiempresa ya está presupuestado**. Lo que falta es el modelo que lo
sostenga.

## Qué hay que corregir

1. **§ 7** — agregar la entidad `Administradora`, `Consorcio.administradora_id`, y las dos tablas de
   habilitación por encima del consorcio. Ajustar el enum de `rol` a `administrador, consejo,
   consorcista` y explicitar que la clave única `(usuario, consorcio, rol)` es lo que permite que el
   consejo se sume a consorcista.
2. **§ 7, regla RN-12** — el aislamiento pasa a tener dos ejes. La regla se enuncia sobre el
   consorcio y se completa con la pertenencia del consorcio a su administradora.
3. **§ 12** — actores y matriz rol×acción con los cinco roles y sus tres niveles. El actor
   «Operador» de `CU-02` se unifica con `administrador`: era el mismo trabajo con otro nombre.
4. **`RF-03`** — enunciar el conjunto de roles vigente.
5. **Regla RN-09** — hoy dice «una unidad no puede tener dos ocupaciones vigentes **del mismo
   tipo**», lo que prohíbe el condominio. Debe acotarse a `inquilino`: varios propietarios vigentes
   sobre una unidad son lo normal, y la carga real de datos del cliente lo va a mostrar en la
   primera unidad de un matrimonio.
6. **Regla RN-13** — sigue igual en el fondo (la nómina nominada es de administrador y consejo),
   pero conviene decir que el consejo es una habilitación que se suma, con la vigencia del mandato.

## Qué **no** hay que hacer

Reescribir las entregas 1 a 3 como si siempre hubieran dicho esto. La cátedra evalúa la
trazabilidad, y una entrega que cambia sin dejar rastro es peor que una que se corrige a la vista.
La corrección va en el acta de la iteración 1, con fecha y motivo, y desde ahí se referencia en los
documentos afectados.

---

## Lo que agregó la revisión del 2026-09-10

Después de cerrada la iteración 1, al preguntar por las cocheras y por la precisión de los
coeficientes, salieron cuatro cosas más. Van acá por el mismo criterio: se corrigen a la vista, no
reescribiendo entregas presentadas.

7. **§ 7, `Unidad`** — el documento dice «unidad funcional: departamento, cochera, local o baulera»,
   y no dice qué pasa con la **unidad complementaria**: la cochera o baulera que está atada a una
   unidad funcional y no se vende separada de ella. Esa **no es una fila del padrón**, porque su
   superficie ya está dentro del porcentual de la unidad a la que accede; si se cargara como unidad
   propia, o se le inventa un coeficiente que el reglamento no le da, o se le pone cero y deja de
   distinguirse de un error de carga. Sólo entra al padrón la cochera que es unidad funcional, con
   su propio porcentual. Está dicho en `src/dominio/unidades/tipo.ts` y falta en el documento.
8. **§ 7, `Ocupacion` y regla RN-12** — el titular de una cochera **puede no ocupar ninguna otra
   unidad del edificio** y es consorcista igual: paga expensas por su coeficiente como cualquier
   unidad funcional. El modelo lo soporta desde el principio, porque la ocupación cuelga de la
   unidad y no de la persona, pero ningún documento lo dice y es la primera pregunta que hace
   cualquiera que administre un edificio con cocheras de terceros. Probado en
   `pruebas/integracion/consorcios.spec.ts`.
9. **§ 7, `Unidad`** — el documento declara `piso`, `superficie_m2` y `activa`, y la construcción no
   los necesitó. O se construyen en la iteración 2 con un uso concreto —`superficie_m2` es el dato
   del que sale el porcentual, así que tiene candidato— o se sacan del documento con su motivo. Lo
   que no puede quedar es declarado y ausente sin que nadie lo haya decidido. El tipo, que estaba en
   la misma situación, se construyó el 2026-09-10.
10. **§ 12.3, «coeficientes con ocho decimales»** — es la **capacidad** de la columna, no una
    obligación de escribir ocho. La suma tiene que dar exactamente `100.00000000`, y un padrón de
    dos decimales la da igual: tres unidades iguales son `33.34 / 33.33 / 33.33`. La regla completa,
    con el límite del 1 % para el sobrante, quedó en § 14.4.

Y un hueco nuevo, **H-11** en `specs/000-plan-construccion/analisis-insumos.md`: el motor de
liquidación reparte un solo coeficiente sobre todo el padrón, y hay consorcios que reparten ciertos
rubros sólo entre un grupo de unidades. Es pregunta para el cliente **antes** de escribir el motor.

## Lo que agregó el plan de `003-liquidacion` (2026-09-10)

Tres campos y una restricción que el punto 7 declara de una manera que la construcción no puede
seguir. Van al mismo registro porque son del mismo documento entregado.

11. **§ 7, `Liquidacion.periodo_id`: `UQ` a secas.** Con eso, una liquidación anulada bloquea para
    siempre la reemisión de su período, y la regla RN-06 (§ 7.2) ordena justamente anular y emitir de
    nuevo. Lo que corresponde es único **parcial**: un solo `vigente` por período. Es lo que el plan
    construye (research R-03) y lo que hace que dos emisiones en paralelo no puedan ganar las dos.
12. **§ 7, `Consorcio`** no tiene ni **día de vencimiento** ni **tasa de mora**, y sin el primero no
    hay desde cuándo contar el interés. Los agrega esta etapa (`FR-002b`, `data-model.md`).
13. **§ 7, `DetalleLiquidacion`** no tiene `tasa_mora_aplicada`, que la observación M-05 ya había
    marcado como importe sin residencia. Además hace falta el **desglose** del interés —una fila por
    liquidación impaga—, porque el interés de una unidad es la suma de varios cálculos y un pago
    posterior cambia qué estaba impago: sin el desglose, el importe deja de poder rehacerse a los
    treinta días (research R-07).
14. **§ 7, `Pago`** no tiene `saldo_a_favor`, la otra mitad de M-05. `FR-026` lo asigna ahí.
