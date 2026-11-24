# Arreglos: documentación, reparto, morosidad y subida de archivos — diseño corto

Fecha: 2026-11-18. Origen: notas de prueba de Lautaro sobre la app desplegada.

## Para qué

Seis defectos de uso que se ven al operar la app como administrador. Ninguno toca dinero ni reglas
de negocio; todos son de presentación o de una acción que falta.

## Approaches

Cada arreglo tiene una sola forma razonable; las alternativas descartadas van en una línea en cada
punto. La única con elección real fue el reparto (modal más ancho vs. sacarlo del modal): un modal
más ancho sigue teniendo dos desplazamientos con 96 unidades, así que se saca.

## Los arreglos

1. **Reparto entre unidades (`periodos/[id]/page.tsx`).** Hoy es una tabla de 9 columnas dentro de un
   `BotonModal` de 720 px: desplaza a lo ancho y a lo alto adentro de una caja dentro de otra caja.
   Pasa a ser una sección propia de la página del período, debajo de los gastos y de la fila de
   acciones, a todo el ancho, con `TablaDesplazable`. El botón «Ver el reparto entre N unidades» queda
   como enlace ancla a la sección (`#reparto`). Las acciones de emitir siguen arriba: decidir sigue
   estando al pie de los gastos.

2. **Morosidad: el detalle por deudor como tooltip (`morosidad/page.tsx`).** El `<details>` con los
   períodos adeudados de cada deudor pasa a un tooltip anclado a «N períodos». Se usa el `popover`
   nativo (`popovertarget`): abre con clic, toque y teclado, y cierra con Escape o clic afuera, sin
   librería. El paso del mouse lo agrega un componente cliente mínimo que llama
   `showPopover`/`hidePopover`. Un tooltip solo de mouse no existe en el teléfono (RNF-01), por eso no
   se usa `title` ni CSS `:hover`.

3. **El modal de «Cargar documento» no se cierra.** Causa: `accionCargarDocumento` devuelve como
   `destino` la misma página (`conHecho(.../documentos)`); `router.push` a la misma ruta no desmonta
   `BotonModal`, así que el diálogo queda abierto con el formulario vacío y parece que no pasó nada.
   Arreglo: `SubidaDirecta` acepta un `alTerminar?: () => void` que llama tras una confirmación
   exitosa, y `ModalDocumento` usa la forma `children(cerrar)` de `BotonModal` para pasárselo. El
   aviso «documento cargado» sigue saliendo por la dirección (decisión 24).

4. **Eliminar documentos.** No existe la acción. Nuevo caso de uso `eliminarDocumento` en
   `aplicacion/comunicacion/documentos.ts`, **solo administrador** (`conAutorizacion` con
   `rolesPermitidos: ['administrador']`). Borra la fila de `DocumentoConsorcio` (los
   `FragmentoDocumento` caen en cascada) y, después del commit, el objeto del almacén
   (`almacen.eliminar`); si el almacén falla, se registra y se sigue: un objeto huérfano no es un
   dato mal mostrado. **Decisión propia:** un documento al que apunta `ActaAsamblea.documentoId` (el
   acta firmada publicada) **no se puede borrar**: es la constancia legal de la asamblea; error de
   aplicación con mensaje claro. El botón «Eliminar» va en la página del documento, como `BotonModal`
   variante `boton--peligro` con confirmación (mismo patrón que `modal-deshabilitar.tsx`), y vuelve
   al listado con `conHecho`.

5. **Abrir descarga en vez de mostrar / la vista previa no funciona.** Causa única: `verDocumento`
   pide `resolverLecturaAutorizada(clave, 600)` sin `{ enLinea: true }`, y R2 responde
   `Content-Disposition: attachment`; el `<iframe>` lo descarga. Arreglo: `verDocumento` devuelve dos
   direcciones, `vista` (en línea, para el `<iframe>`) y `descarga` (attachment, para el botón), como
   ya hace `verExtraccion`. `bajar`/`indexar` no cambian.

6. **Todos los inputs de archivo iguales.** Hay tres; dos ya usan `SubidaDirecta` (documentos y carga
   asistida). El tercero, `gastos/[id]/adjuntar.tsx`, usa el `<input type=file>` nativo. Se pasa a
   `SubidaDirecta`. Diferencia real: el comprobante pide permiso a `/api/comprobantes/permiso` (con
   `gasto`), no a `/api/objetos/permiso` (con `prefijo`). `SubidaDirecta` recibe entonces el pedido de
   permiso como dato (ruta + campos extra del cuerpo) en lugar del `prefijo` fijo; las dos rutas de
   permiso no cambian. `confirmar` ya recibe la clave en el `FormData`, así que
   `accionConfirmarComprobante` se adapta a leerla de ahí.

## No-objetivos

- Rediseñar el visor de documentos (sigue siendo `<iframe>` para PDF).
- Papelera o recuperación de documentos borrados.

## Verificación

- Integración: `eliminarDocumento` (admin borra; no-admin «no encontrado/no autorizado»; documento de
  acta rechazado; fragmentos desaparecen).
- E2E: cargar documento → el modal se cierra y aparece el aviso; abrir documento → se ve el PDF sin
  descarga; reparto visible en la página del período en teléfono 390×844.
- `npm run verificar` + `test:a11y` (el tooltip y el reparto pasan por axe).
