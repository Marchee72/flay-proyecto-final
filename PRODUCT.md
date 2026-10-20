# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dos públicos de igual prioridad, confirmados:

- **Administradores de consorcios** (organización ficticia "Grupo Delta"): trabajan desde escritorio sobre una cartera de varios consorcios; cargan gastos y comprobantes, liquidan períodos, registran pagos, atienden reclamos y novedades.
- **Copropietarios / ocupantes**: consultan expensas y estado de cuenta, reservan espacios y reclaman, sobre todo desde el teléfono (390×844).

## Product Purpose

**Flay — Tu consorcio online**: administración de consorcios de propiedad horizontal. Proyecto Final de Ingeniería en Sistemas de Información (UTN FRRo, 2026) de Lautaro Marchetti y Franco Ferrero. Éxito: liquidaciones exactas y auditables, y copropietarios que entienden qué pagan y por qué.

## Positioning

Dos diferenciales confirmados: (1) liquidación con aritmética decimal al centavo, auditable; (2) IA (carga de comprobantes, consulta documental, asistente) que nunca impacta un dato económico sin confirmación humana.

## Capabilities and Constraints

- Idioma de la interfaz y la documentación: español.
- Importes siempre como cadena decimal hacia la interfaz, nunca como número flotante.
- Aislamiento por consorcio; el consorcio vive en la ruta `/consorcios/[consorcio]/<sección>`.
- Feedback de acciones: toasts por `?hecho=` / `?error=`; banners `.aviso` para estado de la pantalla.
- Funciona en teléfono (RNF-01); mensajes de error comprensibles (RNF-10).

## Brand Commitments

Existe una marca/logo fijo (confirmado por el usuario): nombre **Flay**, y la identidad visual actual (grafito + lima, tokens en `src/app/globals.css`) es vinculante. Los activos concretos del logo no están en `public/`; no inventarlos.

## Evidence on Hand

Sin testimonios ni clientes reales: el cliente es ficticio. No fabricar pruebas sociales.

## Product Principles

1. La exactitud del dinero es visible: cifras legibles, alineadas, nunca ambiguas.
2. Nada económico ocurre sin confirmación humana.
3. Lo mismo vale en escritorio y en teléfono.
4. El error se explica en lenguaje del usuario.

## Accessibility & Inclusion

WCAG A/AA verificado con axe; objetivos táctiles de 44 px (`--toque`).
