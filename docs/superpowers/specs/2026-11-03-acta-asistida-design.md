# Acta de asamblea asistida — diseño

## Por qué

Después de finalizar la asamblea, redactar el acta era escribir a mano el resumen de cada punto en una
pantalla angosta, aunque el resto del acta ya sale solo. Flay no guardaba nada de lo debatido, así que una IA
no tenía de dónde redactar, y en un documento legal no debe inventar debate.

## Qué cambia

- **Notas de la reunión.** El secretario o quien dirige anota por punto en la sala, mientras el punto está
  abierto (ver `2026-11-04-sala-avance-y-observaciones-design.md`). Se guardan solas, no van al acta y solo las
  ven quienes redactan.
- **Borrador con IA.** Al finalizar se encola `redactar_acta`. El redactor recibe título, descripción,
  resultado, conteos agregados, provisoriedad y notas: nunca personas, unidades ni votos por unidad.
- **Revisión humana.** La propuesta queda en `PuntoAsamblea.borradorResumen`, separada de `resumen`.
  `enviarAFirmar` sigue exigiendo `resumen`, así que a las firmas solo llega lo que una persona guardó (RN-14).
- **Degradación.** Sin servicio no hay borrador: la pantalla lo dice, ofrece pedirlo de nuevo y deja escribir a
  mano (RNF-14).
- **Pantalla.** Columna principal con los puntos, cada uno con resultado, conteo, notas y resumen editable, y
  panel lateral fijo con las firmas. Debajo de 960 px pasa a una columna.

## Decisiones

- `RedactorActa` es una interfaz más de la asistencia, con sus tres implementaciones (invariante 5).
- Un solo botón «Guardar resúmenes» para todos los puntos.
- El estado del borrador es un solo campo, `ActaAsamblea.borradorPedidoEn`: pendiente mientras tenga menos de
  2 minutos, y el manejador lo vacía al terminar. Así un trabajo trabado no bloquea la edición y las actas
  anteriores no necesitan migrar datos.
- Disparadores: `notas` solo cambia con el punto `abierto`; `borrador_resumen`, como `resumen`, solo con el
  acta `en_redaccion`.
- Las notas y el borrador solo viajan en la vista a quien redacta, porque la vista llega al navegador de todos
  los asistentes.

## No-objetivos

- Grabar o transcribir la reunión.
- Elegir automáticamente a los dos propietarios que firman: es una designación legal.
- Cambiar el PDF del acta.
