# Contrato — Consorcios, unidades y coeficientes (`CU-01`, `RF-01`, `RF-02`)

## Casos de uso

| Caso de uso | Entrada | Sale bien | Sale mal |
|---|---|---|---|
| `altaConsorcio` | nombre, dirección, localidad, CUIT, unidades con coeficiente | Consorcio y unidades en **una sola transacción** | Si la suma no da `100.00000000`, se rechaza con la diferencia exacta y las unidades involucradas (FR-011, RNF-10) |
| `editarConsorcio` | datos de cabecera | Actualizado | La **baja no existe**: está diferida (§ 9.11, FR-009) |
| `agregarUnidad` | designación, coeficiente, ajustes de las demás | Alta más reajustes, **en la misma transacción** | La base rechaza al confirmar si la suma quedó distinta (FR-011b) |
| `cambiarCoeficiente` | unidad, coeficiente nuevo, vigencia | Cierra la vigencia anterior y abre la nueva | Vigencia retroactiva: rechazada (FR-012) |
| `registrarOcupacion` | unidad, persona, tipo, vigencia | Ocupación registrada | Superposición: la **base** la rechaza (regla RN-09, SC-005) |

## Rutas

| Ruta | Quién |
|---|---|
| `/consorcios` · `/consorcios/[id]` | Administrador y consejo |
| `/consorcios/[id]/unidades` | Administrador |

## Formato del dinero en el borde

- Coeficiente: cadena con **ocho** decimales, `12.50000000`. Nunca número.
- La interfaz muestra la suma corriente mientras se cargan las unidades, para que el rechazo del
  final no sea una sorpresa.
- El mensaje de rechazo nombra la diferencia (`falta 0.00000001`) y las unidades, no un código.

## Reglas verificables

- Los dos consorcios del juego de § 13.4 —12 y 96 unidades— suman exacto, comparado por decimal y
  **no** por tolerancia (SC-001).
- Una diferencia de `0.00000001` se rechaza (SC-004).
- Dos transacciones simultáneas no pueden dejar la suma fuera de `100.00000000`; la prueba las
  corre en paralelo salteándose la capa de aplicación (SC-004b).
- Un consorcio recién creado, sin unidades, **no** es rechazado (FR-011c).
