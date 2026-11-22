# Inicio con unidades por edificio — diseño corto

Fecha: 2026-11-21. Trazabilidad: `RF-03`, `RN-12`, `RT-04`. Continúa «Inquilinos por unidad»
(misma rama).

## Intención

Quien tiene unidades (departamentos, cocheras, locales: todas iguales) en **distintos edificios**
tiene que poder **elegir** qué ver al entrar. Hoy `/` lo manda al último consorcio usado (galleta
`flay_consorcio`) y casi nunca ve la lista; y la lista (`/consorcios`) no dice qué unidades tiene en
cada uno.

## Lo decidido

1. **La lista aparece al entrar si y solo si la persona tiene ocupación vigente (propietario o
   inquilino) en unidades de dos o más consorcios no archivados.** La condición es por unidades, no
   por rol: un administrador que además es dueño en dos edificios también la ve.
2. En cualquier otro caso la entrada sigue como hoy (`destinoDeEntrada`): un consorcio → directo;
   varios → el recordado o la lista.
3. **Enfoque A**: se elige el edificio; las unidades se muestran como referencia en la tarjeta y
   «Entrar» lleva al consorcio, donde Expensas y Mis unidades ya muestran solo lo suyo.

## Enfoques

- **A — Unidades como referencia en `/consorcios` (elegido).** Cambio chico, reusa la pantalla.
- B — Cada unidad enlaza a Expensas filtrada por esa unidad. Requiere agregar `?unidad=` a
  Expensas; descartado por ahora.
- Descartado — Pantalla de inicio aparte para consorcistas: duplica `/consorcios`.

## Diseño

- **Lectura:** un caso de uso de aplicación, «mis unidades por consorcio», que para cada consorcio
  vigente al alcance corre `unidadesPropias` dentro de `enConsorcio(id, …)` y devuelve
  `Map<consorcioId, designacion[]>`. Se cachea por pedido (lo piden `/` y `/consorcios`). Nada de
  `IN (...)` a mano: no entra a la lista blanca de `filtro-unico.spec.ts`.
- **Entrada (`src/app/page.tsx`):** si el mapa tiene unidades en ≥ 2 consorcios → `/consorcios`,
  ignorando la galleta. Si no, `destinoDeEntrada` como hoy. La regla vive en una función pura junto
  a `destinoDeEntrada` (`consorcio-activo.ts`) con su prueba de dominio.
- **Tarjeta (`/consorcios`):** si hay unidades en ese consorcio, una línea «Tus unidades: 3B ·
  Cochera 12» debajo de la dirección (designaciones en el orden de `ordenarUnidades`). Sin unidades,
  la tarjeta no cambia.
- **Quien no administra:** el subtítulo pasa a «Los edificios a los que tenés acceso. Elegí uno.»
  («Nuevo consorcio» y las señales ya se ocultan solos sin administradora / sin `verPanel`).
- Funciona en teléfono con la rejilla actual (RNF-01). Una prueba e2e: consorcista con unidades en
  dos consorcios entra y ve la lista con sus unidades, aun habiendo usado uno antes.

## No objetivos

- Filtrar Expensas por unidad (enfoque B).
- Saldos o deuda en la tarjeta.
- Cambiar la entrada de quien tiene unidades en un solo edificio o ninguna.

## A criterio de quien construye

Nombre del caso de uso y del componente de la línea de unidades; texto exacto del subtítulo.
