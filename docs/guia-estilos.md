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
  en Inter tabular (Google Fonts con fallback a Inter). Titulares 20/24, cuerpo 14/16, ayuda 12/13.
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
  ámbar `#B7791F`, peligro rojo `#B3261E`. Banners con texto oscuro: ámbar pálido `#FDF3D7`
  con borde `#8A5F14`, rojo pálido `#FDECEA` con borde `#8F1D16`, barra lateral de 4px.
- El color nunca es la única señal: siempre hay texto que lo acompaña.
- Escala de urgencias estándar en toda la app (color + icono Lucide + palabra): **URGENTE** rojo
  `#B3261E` + `siren` (agua, gas, electricidad, seguridad · 72 h), **ALTA** ámbar `#8A5F14` +
  `triangle-alert` (bloquea el uso · 7 días), **ORDINARIA** grafito `#4A5158` + `circle`
  (resto · 15 días). Extra: **AL DÍA** verde `#2E7D32` + `badge-check`. Iconos Lucide (MIT,
  paquete `lucide-react`, trazo 24px consistente); se usa igual en reclamos, reservas y avisos.

### 3.3 Espaciado y retícula
- Unidad base 4 px. Contenedor 1200 px, 12 columnas en escritorio; 1 columna a 390 px.
- Tarjetas blancas con borde `#E2E6EA` y radio 10 px; sombra solo para elevar diálogos.
- Densidad: tablas con filas de 44 px mínimo (táctil), acciones a la derecha.

### 3.4 Componentes base
- KPI en cards hero oscuras: fondo grafito `#23272E`, icono Lucide en pastilla lima `#9CCC65`
  a la izquierda, etiqueta 10px en mayúsculas lima, número Inter blanco 21-24px, delta en
  `#E8EAED`. Una por pantalla para la métrica que manda; las secundarias repiten el formato
  en fila. Sin sombras ni brillos.
- Botones pastilla (radio completo): primario lima `#7CB342` con texto grafito (una acción
  principal por vista),   secundario blanco con borde grafito de 2px, peligro rojo de 2px solo para anular/borrar
  con confirmación explícita. Altura mínima 44 px, peso 700.
- Formularios: etiqueta siempre visible, ayuda debajo, error debajo en rojo con qué corregir.
  Importes con separador de miles `es-AR`, 2 decimales, alineados a la derecha.
- Tablas: encabezado fijo, filtro por período/rubro/estado arriba, paginación abajo, fila
  clicable solo si lleva a detalle.
- Navegación: lateral en escritorio (Consorcio, Gastos, Liquidación, Pagos, Reclamos, Reservas,
  Documentos, Indicadores), inferior o hamburguesa en móvil. El consorcio activo siempre visible.
- Estados vacíos con ilustración simple + texto + botón ("Sin gastos en este período. Cargar gasto").
- Carga con esqueleto, nunca pantalla en blanco; diferidos (documentos, indexación) con progreso.

## 4. Contenido y tono

- Tuteo evitado; trato neutro: "Se registró el gasto", "La reserva quedó confirmada".
- Dinero: `$ 1.234.567,89`. Fechas: `12/08/2026`. Períodos: `2026-08`.
- Confirmaciones humanas explícitas antes de crear gasto desde extracción o de anular
  liquidación (RN-14, RN-06). Nada automático toca dinero sin clic.
- Documentos: cada respuesta documental cita documento y fragmento; sin fuente, "no encontrado".

## 5. Accesibilidad y dispositivos (RNF-01, RNF-11)

- Foco visible, orden lógico, todo operable por teclado; imágenes con alternativo.
- `test:a11y` (axe) con 0 infracciones A/AA en pantallas del consorcista; Playwright 390×844
  sin desplazamiento horizontal en cada entrega.

## 6. Rendimiento percibido (RNF-06, RNF-07)

- Listados <2 s p95 (`medir:p95`); liquidación 100 uds <30 s sin documentos; documentos e
  indexación diferidos con reintento visible. Con correo caído, el negocio sigue y el aviso
  queda pendiente (RNF-14).

## 7. Checklist por PR

1. Verde `verificar` + revisión del otro. 2. Autorización rol+consorcio probada (incluye matriz
   rol×acción y 0 filas sin habilitación). 3. 390 px + axe sin infracciones. 4. Errores
   comprensibles. 5. Demo desplegado. 6. Asiento de auditoría si toca dinero. 7. Docs y
   trazabilidad `RF-/RN-/RNF-` actualizadas.
