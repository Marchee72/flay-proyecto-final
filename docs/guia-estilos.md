# Guía de estilos — Flay

> **Fuente:** anexo operativo de `docs/entrega-final/14-codificacion.md` §14.4 y de la constitución.
> Rige desde el primer RF. Ante contradicción, prevalecen §14.4 y la constitución.
> Idioma del proyecto: **español** en documentación, entidades, commits y comunicación.

## 1. Principios (profesional e intuitivo)

1. **Predecible:** la misma acción se ve y se comporta igual en todo el sistema.
2. **Legible primero:** se lee en 3 segundos qué pasó, cuánto es y qué hacer.
3. **Sin miedo al dinero:** todo importe exacto, explicado y auditable; nunca ambiguo.
4. **Móvil primero:** todo flujo del consorcista funciona a 390 px sin scroll horizontal.
5. **Accesible por defecto:** WCAG 2.1 AA en pantallas del consorcista, sin excepciones.
6. **Error que ayuda:** cada error dice qué pasó, la magnitud exacta y el paso siguiente (RNF-10).

## 2. Código

- TypeScript estricto. Español en dominio y negocio (`Consorcio`, `liquidarPeriodo`,
  `coeficienteHistorico`); inglés solo técnico del framework (`route`, `middleware`).
- Capas (`src/app → src/aplicacion → src/dominio → src/infraestructura`, transversal
  `src/compartido`). El dominio solo importa `dominio`, `dominio/contratos` y `compartido`.
- Dinero: `Prisma.Decimal` en dominio, jamás `number`; coeficientes 8 decimales que suman
  `100.00000000`; redondeo solo al final; serialización a interfaz como cadena.
- Errores: mensaje para usuario final + causa exacta en log JSON (momento, usuario, consorcio,
  operación, resultado). Nada técnico en pantalla.
- Formato: Prettier + ESLint en cada envío, `end_of_line = lf`. Regla propia
  `flay/sin-aritmetica-monetaria`. Commits `RF-nn` + verbo. Una rama por RF, PR con revisión
  del otro, `main` siempre desplegable, semver por iteración.

## 3. Sistema visual

### 3.1 Tipografía
- Poppins en todo (titulares, navegación, tablas, formularios, textos), salvo las cifras, que van
   en Inter tabular (Google Fonts, ambas familias cargadas). Escala fija, verificada en
   `guia-estilos-ejemplo.html`: ayuda 12, menor 13, cuerpo 15, títulos 18 / 22 / 28
   (tokens `var(--t-ayuda)` … `var(--t-titulo1)`). El ejemplo usa tokens en toda
   su CSS: nada de `14px`/`17px` sueltos ni colores fuera de `:root`. Única
   excepción documentada: el rótulo del KPI (§3.4), `10px` en
   mayúsculas lima (clase `.kpi__rotulo`). Las cifras
  llevan la clase `cifra`: sin ella, las columnas de dinero no alinean coma con coma.
- Regla dura de contraste: **nunca texto claro sobre fondo claro ni texto oscuro sobre fondo
  oscuro** (mínimo 4.5:1, AA). Secundario sobre blanco: `#4A5158`. Sobre grafito: `#E8EAED`
  con opacidad mínima 75 %.
- Una sola pareja tipográfica en toda la app. Nada de mayúsculas sostenidas salvo siglas.

### 3.2 Color
- Dirección C en toda la app con paleta grafito y lima: sidebar grafito `#23272E` (punto activo
  lima luminoso `#9CCC65`), fondo gris frío `#F4F6F4`, superficie `#FFFFFF`, texto `#1A1D21`,
  texto secundario `#4A5158` (contraste ≥ 4.5:1 sobre blanco; prohibido texto claro sobre fondo
  claro), borde `#C9CFC9`.
- Acentos semáforo: verde `#2E7D32` (al día), lima sobrio `#7CB342` (énfasis/alerta),
   ámbar `#8A5F14` (único en toda la app; el `#B7791F` anterior queda descartado), peligro rojo `#B3261E`. Banners con texto oscuro: ámbar pálido `#FDF3D7`
  con borde `#8A5F14`, rojo pálido `#FDECEA` con borde `#8F1D16`, barra lateral de 4px.
- El color nunca es la única señal: siempre hay texto que lo acompaña.
- Fondos pálidos de etiqueta: verde `#F1F8F1`, ámbar `#FDF3D7`, rojo `#FDECEA`, gris `#ECEFEC`.
  El verde se aclaró respecto del pálido natural porque con `#2E7D32` a 12 px daba 4,45:1 y AA
  pide 4,5:1; así queda en 4,75:1.
- Borde de control de formulario `#767E76`, no `#C9CFC9`: WCAG 1.4.11 pide 3:1 para el contorno de
  un control y el borde general da 1,58:1. El resto de los bordes sí usa `#C9CFC9` / `#E2E6EA`.
- Escala de urgencias estándar en toda la app (color + icono Lucide + palabra): **URGENTE** rojo
  `#B3261E` + `siren` (agua, gas, electricidad, seguridad · 72 h), **ALTA** ámbar `#8A5F14` +
   `triangle-alert` (bloquea el uso · 7 días), **ORDINARIA** tinta apagada `#4A5158` + `circle`
  (resto · 15 días). Extra: **AL DÍA** verde `#2E7D32` + `badge-check`. Iconos Lucide (MIT,
  paquete `lucide-react`, trazo 24px consistente); se usa igual en reclamos, reservas y avisos.

### 3.3 Espaciado y retícula
- Unidad base 4 px. Contenedor 1200 px, 12 columnas en escritorio; 1 columna a 390 px.
- Tarjetas blancas con borde `#E2E6EA` y radio 10 px; sombra solo para elevar diálogos.
- Densidad: tablas con filas de 44 px mínimo (táctil), acciones a la derecha.

### 3.4 Componentes base
- KPI en cards hero oscuras: fondo grafito `#23272E`, icono Lucide en pastilla lima `#9CCC65`
  a la izquierda, etiqueta-rótulo `10px` en mayúsculas lima (única medida fuera de la
  escala §3.1, clases `.kpi__rotulo`), número Inter blanco 21-24px (clases
  `.kpi__cifra cifra`), delta en `#E8EAED` (clase `.kpi__detalle`). Una por pantalla para la métrica que manda; las secundarias repiten el formato
  en fila. Sin sombras ni brillos.
- Botones pastilla (radio completo): primario lima `#7CB342` con texto grafito (una acción
  principal por vista),   secundario blanco con borde grafito de 2px, peligro rojo de 2px solo para anular/borrar
  con confirmación explícita. Altura mínima 44 px, peso 700. Texto en infinitivo
  imperativo neutro («Cargar gasto», «Confirmar anulación», «Cancelar»): sin tuteo
  ni voseo, igual que el resto del contenido (§4).
- Formularios: etiqueta siempre visible, ayuda debajo, error debajo en rojo con qué corregir.
  `input` y `select` comparten el mismo control (`.campo`, borde `--linea-control`,
  `aria-invalid` + mensaje en errores); el `select` es nativo y filtra con GET a
  la misma dirección, sin guion. Importes con separador de miles `es-AR`,
  2 decimales, alineados a la derecha. `.cifra` solo en dinero: fechas, CUIT,
  períodos y conteos se muestran sin ella.
- Tablas: encabezado fijo, filtro por período/rubro/estado arriba, paginación abajo (clase
  `.paginacion`, página actual con `aria-current="page"`), fila
  clicable solo si lleva a detalle.
- Diálogo de dinero (patrón «Diálogo de dinero» del ejemplo): una `.tarjeta` con el importe
  en grande (`.kpi__cifra cifra` o `.cifra`), motivo en `.campo` con error debajo y
  confirmación explícita con `.boton--peligro` + `.boton--fantasma` para cancelar.
  Nada automático toca dinero sin clic (RN-14, RN-06); sombra solo para elevar diálogos (§3.3).
- Diálogo modal (patrón «Modal», componente `BotonModal` en `src/app/(panel)/modal.tsx`,
  clases `.modal` en `globals.css`): `<dialog>` nativo con `showModal()`, sin librerías.
  Cuándo sí: crear o confirmar en ≤ 3 pasos (Nuevo consorcio en 3 pasos con indicador
  `ol` + `aria-current="step"`; Pago nuevo, Gasto nuevo, Invitar persona y Abrir período
  en 1 pantalla + revisión). Cuándo no: lectura, detalle y flujos largos (van en página;
  `/consorcios/nuevo` queda como alternativa sin guion). Anatomía: título `h2` con
  `aria-labelledby`, botón Cerrar siempre visible, formulario existente adentro y Server
  Action existente (el éxito redirige con `?nuevo=1` / `?registrado=1` / `?invitado=1` donde
  ya hay `role="status"`, o cierra y lo muestra). Foco: al título al abrir, al primer error
  si no se avanza (RNF-10 por paso) y de vuelta al disparador al cerrar. Escape nativo y
  clic en el fondo cierran. A 390 px casi pantalla completa, sin scroll horizontal de página
  (la tabla del padrón desplaza adentro de `.tabla-desplazable`). Entrada solo
  `opacity`/`transform` 200 ms con `prefers-reduced-motion`.
- Navegación: lateral en escritorio con las 8 secciones implementadas (Consorcios,
  Gastos, Períodos, Expensas, Pagos, Morosidad, Proveedores, Usuarios), barra
  inferior con las 5 principales en móvil (variante C, icono Lucide + etiqueta,
  landmark propio) y menú `details`/`summary` como alternativa. El ejemplo
  anticipa las 8 secciones objetivo con iteración 3 (Liquidación, Gastos, Pagos,
  Reclamos, Reservas, Documentos, Indicadores, Notificaciones): Reclamos,
  Reservas, Documentos, Indicadores y Notificaciones son roadmap pendiente (§8),
   sin pantallas todavía. El consorcio activo siempre visible en la barra
   (formulario `.selector-consorcio` con `select` nativo y Server Action
   `elegirConsorcio`, sin guion), no como sección.
  - Consorcio activo persistente: `elegirConsorcio` valida el id contra
    `misConsorcios` (alcance del usuario; si no es alcanzable, no lo guarda) y
    lo guarda en la galleta de presentación `flay_consorcio` (`httpOnly`,
    `SameSite=Lax`, `path=/`), redirigiendo a la misma página con
    `?consorcio=<id>` y el resto de los parámetros intactos (las direcciones
    compartidas no cambian). Cada pantalla resuelve con
    `resolverConsorcioActivo(parametros, consorcios, galleta)`: `?consorcio=`
    válido > galleta válida > aviso RNF-10 (solo cuando no hay ni parámetro ni
    galleta válidos; un parámetro inválido muestra «no está al alcance» aunque
    haya galleta). `src/middleware.ts` espeja `?consorcio=` en la galleta
    antes de renderizar (sin validar: no hay base en el filo), para que la
    barra muestre el mismo consorcio que la pantalla incluso al abrir una
    dirección compartida. La galleta nunca se confía sin validar contra los
    alcanzables y cada operación la sigue autorizando su caso de uso (FR-002):
    solo decide qué se dibuja.
  - Encabezado de consorcio + Volver (componente `EncabezadoDeConsorcio`,
    clases `.encabezado-consorcio`): obligatorio arriba de cada pantalla que
    trabaja sobre un consorcio resuelto (`?consorcio=`, galleta recordada o
    `consorcios/[id]`),
    antes del `h1` (la página conserva su `h1`). Cuándo aparece: solo con
    consorcio resuelto; sin consorcio elegido se muestra el aviso existente,
    sin encabezado. Anatomía: izquierda, insignia lima con icono `Building2`
    (`aria-hidden`) + nombre del consorcio como texto prominente (no `h1`,
    `var(--t-titulo2)` 22 px peso 600; en teléfono baja a
    `var(--t-titulo3)`);
   derecha, `Link` `.boton--fantasma` con icono `ArrowLeft` + texto («Volver»
   o «Volver a \<lista\>»). Destinos: el detalle y el alta vuelven a su lista
   con `?consorcio=` preservado; las listas con consorcio vuelven a
   `/consorcios`. La fila puede envolverse a 390 px; el botón nunca se corta.
- Estados vacíos (clase `.vacio`, icono `32px` en tinta apagada) con ilustración simple + texto + botón ("Sin gastos en este período. Cargar gasto").
- Carga con esqueleto (clase `.esqueleto`, nunca pantalla en blanco); diferidos (documentos, indexación) con progreso (clase `.progreso`: barra + texto con magnitud exacta + reintento visible). Etiquetas de estado con clase `.etiqueta` + variante (`--rendido`, `--propietario`, `--pendiente`, `--vencido`).

## 4. Contenido y tono

- Tuteo evitado; trato neutro: "Se registró el gasto", "La reserva quedó confirmada".
- Dinero: `$ 1.234.567,89`. Fechas: `12/08/2026`. Períodos: `2026-08`.
- Confirmaciones humanas explícitas antes de crear gasto desde extracción o de anular
  liquidación (RN-14, RN-06). Nada automático toca dinero sin clic.
- Documentos: cada respuesta documental cita documento y fragmento; sin fuente, "no encontrado".

## 5. Accesibilidad y dispositivos (RNF-01, RNF-11)

- Foco visible con contorno de 3 px (`#2E7D32`; sobre grafito, `#9CCC65`) y 2 px de separación:
  se define una vez y nunca se quita. Orden lógico, todo operable por teclado; imágenes con
  alternativo. Lo que parece accionable es un `a` o un `button` de verdad: nada de texto subrayado
  que simule un enlace, porque no recibe foco y no existe para un lector de pantalla.
- Ninguna página desplaza en horizontal. Lo que no entra —una tabla financiera— se desplaza dentro
  de su propio contenedor, alcanzable por teclado (`tabindex="0"` con `role="region"` y nombre).
  En una retícula, el hijo lleva `min-width: 0` o el contenido la estira y desborda igual.
- El menú de teléfono es `details`/`summary` nativo: sin guion, operable por teclado desde el día 1.
  Esconder la navegación sin reemplazarla la deja inalcanzable.
- `test:a11y` (axe) con 0 infracciones A/AA en pantallas del consorcista; Playwright 390×844
  sin desplazamiento horizontal en cada entrega. La propia guía está cubierta:
  `pruebas/e2e/guia-estilos.spec.ts` y `guia-estilos.a11y.spec.ts` verifican desborde, navegación en
  teléfono, enlaces reales y foco.

## 6. Rendimiento percibido (RNF-06, RNF-07)

- Listados <2 s p95 (`medir:p95`); liquidación 100 uds <30 s sin documentos; documentos e
  indexación diferidos con reintento visible. Con correo caído, el negocio sigue y el aviso
  queda pendiente (RNF-14).

## 7. Checklist por PR

1. Verde `verificar` + revisión del otro. 2. Autorización rol+consorcio probada (incluye matriz
   rol×acción y 0 filas sin habilitación). 3. 390 px + axe sin infracciones. 4. Errores
   comprensibles. 5. Demo desplegado. 6. Asiento de auditoría si toca dinero. 7. Docs y
   trazabilidad `RF-/RN-/RNF-` actualizadas.

## 8. Roadmap de iteración 3 (pendiente, sin pantallas)

Registro, no implementación: nada de esta sección crea rutas ni componentes en
`src/app`. La base visual ya está lista; cuando cada caso de uso se construya,
reutiliza estos patrones sin CSS nuevo salvo necesidad justificada.

| Caso de uso (`12-diseno.md` §4) | Requerimientos | Patrones ya disponibles | Pendiente de presentación |
|---|---|---|---|
| CU-07 Crear reclamo y seguirlo + CU-08 Gestionar reclamo | RF-11, RF-12, RF-13 (RN-11, RN-15) | Escala de urgencias §3.2 (clases `.urgencia` + iconos `siren` / `triangle-alert` / `circle` / `badge-check`), `.aviso`, `.etiqueta`, confirmación en dos pasos | Pantallas de reclamo, historial, clasificación manual (flujo 2a/3a) y avisos por correo (CU-15) |
| CU-09 Reservar espacio común | RF-15, RF-16 (RN-10) | `.campo` + `select` nativo por GET, errores RNF-10 con regla concreta y valor admitido, `.tabla-desplazable` para la agenda | Pantallas de espacios, agenda, validaciones visibles y confirmación con depósito en garantía |
| CU-10 Consultar documentación + CU-12 Publicar novedad | RF-18, RF-19, RF-20 | `.progreso` (barra + magnitud exacta + reintento) para indexación diferida, cita documental §4, `.vacio` para «no encontrado» | Pantallas de documentos, novedades y respuesta con citas |
| CU-11 Consultar panel de indicadores | RF-21…RF-25 (vistas `v_morosidad_consorcio`, `v_gasto_rubro_periodo`, `v_desempeno_proveedor`, `v_resolucion_reclamos`) | `.kpi` hero + `.rejilla`, `.tabla-desplazable`, `.cifra` | Pantallas de indicadores |

## 9. Pendientes honestos (la guía pide, las pantallas aún no)

1. Paginación `.paginacion`: solo `/gastos` la usa; el resto de los listados
   todavía no pagina.
2. `.esqueleto` y `.progreso`: CSS listo, ninguna pantalla los usa todavía.
3. `.cifra` fuera del dinero: el padrón muestra coeficientes con `.cifra` y
   Morosidad muestra conteos («N de M», períodos vencidos) con `.cifra`; la
   regla §3.4 dice dinero. Uniformar o ampliar la regla queda pendiente.
4. Ejemplo: marco simplificado (`.disposicion` con `gap`); el marco opción 3
   real (contenido redondeado sobre grafito, `overflow: clip`, lateral pegado,
   `.barra-inferior`, `.selector-consorcio`) vive en `globals.css` +
   `layout.tsx` + `navegacion.tsx` y el ejemplo no lo demuestra completo.
