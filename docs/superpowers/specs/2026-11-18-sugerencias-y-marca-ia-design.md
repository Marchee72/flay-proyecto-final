# Sugerencias en su propia pantalla y marca visual de la IA — diseño corto

Fecha: 2026-11-18. Origen: Lautaro, después de usar la pantalla de sugerencias de configuración
(diseño `2026-11-18-configuracion-desde-documentos-design.md`). Maquetas elegidas en el compañero
visual: aviso arriba de la tabla (B) y tratamiento «Fuerte».

## Para qué

1. **La sección «Configuración que menciona este documento» está escondida**: al pie de la página
   de cada documento, debajo del visor del PDF. Para revisarlas hay que entrar documento por
   documento. Pasan a una pantalla propia, a la que se llega desde Documentación.
2. **Lo que hace la IA no se distingue.** Hoy cada pantalla lo marca distinto (`Bot`, `ScanSearch`,
   `Sparkles`) o no lo marca. Todo lo que sale de la IA pasa a llevar la misma marca: ícono,
   gradiente azul → lila → violeta, fondo pálido.

## Objetivos

- Pantalla `consorcios/[consorcio]/documentos/sugerencias`, **solo administrador**: las
  sugerencias de todos los documentos del consorcio, **agrupadas por documento** (título del
  documento como encabezado, con enlace al documento). Mismas tarjetas que hoy (Ahora/Propuesto,
  cita, Aplicar/Descartar, modal de reservas afectadas). Las ya revisadas quedan plegadas al pie.
- En Documentación, **aviso en gradiente arriba de la tabla** cuando hay pendientes:
  «La IA encontró N cambios de configuración» + «en <documentos>. Nada se aplica sin tu clic.» y
  botón «Revisar». Con 0 pendientes no aparece. El «N sugerencias» de cada fila lleva a la pantalla
  nueva, al ancla de ese documento (`#documento-<id>`).
- La página del documento **pierde la sección**; en su lugar, el mismo aviso (si ese documento
  tiene pendientes) apuntando a su ancla en la pantalla nueva. «Buscar configuración» se queda ahí;
  mientras analiza, el aviso dice «Estamos leyendo el documento…» como hoy.
- Aplicar/Descartar vuelven a la pantalla nueva (`sobreSugerencias` cambia de destino).
- **Marca de IA, tratamiento «Fuerte»:** fondo azul-lila pálido, borde en gradiente, título pintado
  en gradiente, ícono `Sparkles` en gradiente, etiqueta «IA» llena para chips. Se aplica en:
  - aviso y tarjetas de sugerencias; botón «Buscar configuración»;
  - «Preguntarle a la documentación» (botón y tarjeta de respuesta);
  - asistente: botón que lo abre y burbujas de respuesta (`Bot` → `Sparkles`);
  - carga asistida: botón de entrada en Gastos, cabecera de la pantalla y revisión de la extracción
    (`ScanSearch` → `Sparkles`);
  - «Sugerencia automática» del reclamo;
  - borrador del acta escrito por la IA (la vista del borrador antes de que una persona lo guarde).

## No-objetivos

- Cambiar qué hace la IA, la cola, el aplicador o las reglas de RN-14.
- Modo oscuro: la app no lo tiene hoy.
- Una sección nueva en el lateral o avisos en la Bandeja/Resumen (descartados por Lautaro: el
  acceso vive en Documentación).
- Marcar lo que la IA **ya no** decide: un gasto confirmado, un acta guardada por una persona, un
  reclamo con el rubro aplicado. La marca es para lo que todavía es propuesta o respuesta de la IA.

## Anti-objetivos

- Que la marca se confunda con un estado (verde/ámbar/rojo/azul ya significan algo): el gradiente
  es exclusivo de la IA.
- Perder contraste: todo texto sobre el fondo o el gradiente cumple AA (`npm run test:a11y`).
- Repetir el gradiente en cada componente: vive en tokens y clases de `globals.css`, un solo lugar.

## Approaches

Hubo elección real en lo visible y se resolvió con maquetas: acceso por **aviso** (B) contra botón
fijo en la cabecera (A), y tratamiento **Fuerte** contra Sutil (borde + ícono) y Medio (franja
lateral, descartada además por ser el cliché de UI generada). En lo técnico hay una sola forma
razonable:

- **Clases CSS + un componente de ícono** (elegido): tokens `--ia-1/2/3`, `--ia-gradiente`,
  `--ia-palido` en `:root`; modificadores `.tarjeta--ia`, `.boton--ia`, `.etiqueta--ia`, `.aviso--ia`,
  `.titulo-ia`; y `IconoIA` (un `Sparkles` con trazo en gradiente vía `<linearGradient>` SVG, el
  único lugar que sabe pintarlo). Cada pantalla solo suma una clase y cambia el ícono.
- Un componente envoltorio `<BloqueIA>` por cada uso: descartado, cada sitio ya tiene su propio
  marcado (`section.tarjeta`, `Link.boton`, burbujas) y envolverlo duplica estructura.
- Gradiente en el ícono con `background-clip` sobre un `<span>`: descartado, lucide dibuja trazos
  SVG; el `stroke="url(#…)"` es lo nativo.

## Restricciones

- Presentación sin reglas de negocio: la lectura agregada es un caso de uso en
  `src/aplicacion/comunicacion/sugerencias.ts` (generalizar `listarSugerencias` para aceptar
  `documentoId` opcional y devolver el documento de cada una), con la misma autorización
  `SOLO_ADMINISTRADOR`. `SugerenciaConfiguracion` lleva `consorcio_id`: la extensión de aislamiento
  la filtra (invariante 1), sin filtro a mano.
- El conteo para el aviso sale de lo que `listarDocumentos` ya trae (`sugerenciasPendientes`).
- Teléfono 390×844 (RNF-01): el aviso apila texto y botón.
- `EnVivo` en la pantalla nueva mientras algún documento está analizando (decisión 21).
- Las pruebas e2e que hoy buscan la sección en la página del documento se mueven a la pantalla nueva.

## Para el que construye

Textos finales del aviso, si el ancla hace scroll suave, el nombre exacto del componente de ícono y
el orden de los commits (sugerido: tokens + `IconoIA` → pantalla nueva y aviso → marca en el resto).
