# Flay — Tu consorcio online

Sistema web de administración de consorcios de propiedad horizontal, con panel de indicadores para la
toma de decisiones y funciones asistidas por inteligencia artificial.

**Proyecto Final — Ingeniería en Sistemas de Información**
Universidad Tecnológica Nacional, Facultad Regional Rosario — Cursada 2026

Autores: Lautaro Marchetti (leg. 42037) · Franco Ferrero (leg. 42036)

---

## Documentación

Toda la documentación vive en [`docs/`](docs/) y sigue el orden de los puntos 1 a 18 del cronograma
2026 de la cátedra. El índice completo, con el estado de cada documento, está en
**[`docs/README.md`](docs/README.md)**.

| | |
|---|---|
| Consigna vigente transcripta | [`docs/requisitos-catedra.md`](docs/requisitos-catedra.md) |
| Carátula, resumen e índice | [`docs/00-caratula-resumen.md`](docs/00-caratula-resumen.md) |
| 1° entrega — vence 11/05/2026 | [`docs/entrega-1/`](docs/entrega-1/) |
| 2° entrega — vence 29/06/2026 | [`docs/entrega-2/`](docs/entrega-2/) |
| 3° entrega — vence 26/10/2026 | [`docs/entrega-3/`](docs/entrega-3/) |
| Última entrega — prototipo hasta 18/12/2026 | [`docs/entrega-final/`](docs/entrega-final/) |

El archivo [`cronograma_proyecto_2026.pdf`](cronograma_proyecto_2026.pdf) es el documento original de
la cátedra del que se desprenden todos los requisitos.

## Estado

| Etapa | Estado |
|---|---|
| Documentación de las entregas 1 a 3 (puntos 1 a 12) | Completa |
| Documentación de la última entrega (puntos 13 a 18) | Esqueletos, se completan durante la construcción |
| Código de la aplicación | Sin iniciar |

## Alcance del sistema

Módulos comprometidos: usuarios y habilitaciones por consorcio · consorcios y unidades funcionales ·
gastos y comprobantes digitalizados · liquidación de expensas · pagos y morosidad · reclamos con
seguimiento · reservas de espacios comunes · proveedores · novedades y documentación · notificaciones
· panel de indicadores de gestión · auditoría.

Funciones asistidas: extracción de datos desde el comprobante, clasificación de reclamos y consulta
de la documentación del consorcio en lenguaje natural. Ninguna decide por sí sola: toda salida con
efecto económico requiere confirmación de una persona.

El alcance comprometido y las 23 funcionalidades diferidas están definidos en
[`docs/entrega-3/09-tamano-del-sistema.md`](docs/entrega-3/09-tamano-del-sistema.md), § 9.11.

## Notas

- La organización cliente descrita en la documentación es **ficticia**, construida para el ejercicio
  académico conforme a la consigna.
- Los documentos están en Markdown para versionarlos junto al código. Se exportan a PDF con
  encabezado y pie al momento de cada entrega, según exige la Ordenanza 1825.
- Los diagramas están escritos en Mermaid y renderizan directamente en GitHub.
