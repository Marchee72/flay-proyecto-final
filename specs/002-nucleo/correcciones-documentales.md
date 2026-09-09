# Correcciones documentales pendientes — 002-nucleo

La redefinición de roles del 2026-09-09 destapó una contradicción **que ya existía** entre
documentos entregados. Se registra acá para que la corrección se asiente donde corresponde y no
reescribiendo entregas ya presentadas.

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
