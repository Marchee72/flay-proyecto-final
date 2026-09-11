# Flay — Tu consorcio online

**Proyecto Final — Ingeniería en Sistemas de Información**
Universidad Tecnológica Nacional, Facultad Regional Rosario — Cursada 2026

Sistema web de administración de consorcios de propiedad horizontal, con panel de indicadores para
la toma de decisiones y funciones asistidas por inteligencia artificial.

---

## Cómo está organizada esta documentación

La estructura sigue exactamente el orden de los puntos 1 a 18 del cronograma 2026 de la cátedra.
[`requisitos-catedra.md`](requisitos-catedra.md) es la fuente de verdad: contiene la consigna
transcripta y el mapeo de cada punto a su documento.

| Documento | Contenido | Estado |
|---|---|---|
| [`00-caratula-resumen.md`](00-caratula-resumen.md) | Carátula, resumen, palabras clave e índice general (Ord. 1825, ptos. 1–4) | Completo |
| [`requisitos-catedra.md`](requisitos-catedra.md) | Consigna 2026 transcripta + checklist | Completo |

### 1° Entrega — vence 11/05/2026

| # | Documento | Estado |
|---|---|---|
| 1 | [Análisis de la organización](entrega-1/01-analisis-organizacion.md) | Completo |
| 2 | [Análisis de problemas](entrega-1/02-analisis-problemas.md) | Completo |
| 3 | [Análisis de objetivos](entrega-1/03-analisis-objetivos.md) | Completo |
| 4 | [Alternativas de solución](entrega-1/04-alternativas-solucion.md) | Completo |

### 2° Entrega — vence 29/06/2026

| # | Documento | Estado |
|---|---|---|
| 5 | [Análisis de factibilidad](entrega-2/05-analisis-factibilidad.md) | Completo |
| 6 | [Precio y forma de pago](entrega-2/06-precio-y-forma-de-pago.md) | Completo |

### 3° Entrega — vence 26/10/2026

| # | Documento | Estado |
|---|---|---|
| 7 | [Análisis de datos](entrega-3/07-analisis-de-datos.md) | Completo |
| 8 | [Metodología de desarrollo](entrega-3/08-metodologia-desarrollo.md) | Completo |
| 9 | [Cálculo del tamaño del sistema](entrega-3/09-tamano-del-sistema.md) | Completo |
| 10 | [Diagrama de Gantt](entrega-3/10-diagrama-gantt.md) | Completo |
| 11 | [Análisis de riesgos](entrega-3/11-analisis-de-riesgos.md) | Completo |
| 12 | [Diseño](entrega-3/12-diseno.md) | Completo |

### Última Entrega — prototipo hasta 18/12/2026

| # | Documento | Estado |
|---|---|---|
| 13 | [Prototipo](entrega-final/13-prototipo.md) | Parcial — § 13.3 a § 13.5 al día con el cierre de la iteración 2; § 13.6 y § 13.7 abiertos |
| 14 | [Codificación](entrega-final/14-codificacion.md) | Parcial — § 14.1, § 14.4 y § 14.5 al día con la iteración 2; § 14.3 con la comparación de proveedores hecha, decisión pendiente de las dos PoC de § 8.4.3 |
| 15 | [Pruebas](entrega-final/15-pruebas.md) | Parcial — § 15.2.1 con resultado real: PL-01 a PL-08 y PL-10 superan, PL-09 abierto |
| 16 | [Manual de usuario](entrega-final/16-manual-usuario.md) | Esqueleto |
| 17 | [Cronograma de capacitación](entrega-final/17-cronograma-capacitacion.md) | Esqueleto |
| 18 | [Seguridad](entrega-final/18-seguridad.md) | Política esbozada, se completa al codificar |

---

## Requisitos obligatorios y dónde se cumplen

| Requisito de la cátedra | Dónde |
|---|---|
| Herramientas para la toma de decisiones basadas en datos del sistema | [`12-diseno.md` § Módulo de indicadores](entrega-3/12-diseno.md#9-módulo-de-indicadores-para-la-toma-de-decisiones) |
| Buenas prácticas de seguridad | [`12-diseno.md` § Seguridad](entrega-3/12-diseno.md#11-seguridad-del-diseño) y [`18-seguridad.md`](entrega-final/18-seguridad.md) |

## Antecedentes

Este proyecto retoma la documentación elaborada en 2019 y revisada parcialmente en 2024. Los
documentos originales viven fuera de este repositorio. Esta versión **rehace** el contenido para
alinearlo al cronograma 2026 y a la Ordenanza 1825: se agregan el análisis de la organización, los
árboles de problemas y objetivos, la comparación de alternativas, la factibilidad económico-financiera
del cliente, el análisis de datos, el tamaño del sistema y el análisis de riesgos, y se actualizan
costos, marco legal y alcance funcional.

## Notas de formato para la entrega

Los documentos están en Markdown para poder versionarlos y editarlos junto al código. Al momento de
entregar se exportan a PDF agregando encabezado (título del proyecto y apellidos) y pie (nombre de la
etapa y número de página) según exige el punto 7 de la Ordenanza 1825. Los diagramas están escritos en
Mermaid y renderizan en GitHub, VS Code y en la mayoría de los exportadores a PDF.
