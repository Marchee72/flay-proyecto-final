# Diseño visual — Flay (2026-09-09)

Decidido con el equipo por brainstorming visual (sesión `.superpowers/brainstorm/flay-estilo/`).
Dirección C (dato financiero) en toda la app + paleta B (grafito y lima) + KPI en cards planas.

## 1. Identidad y tokens (aprobado)

- Idea: Flay parece el home banking del consorcio. Sidebar grafito `#23272E` siempre visible
  (móvil: topbar compacta oscura), contenido sobre gris frío `#F4F6F4`, tarjetas `#FFFFFF`.
- Texto `#1A1D21`, secundario `#4A5158` (≥ 4.5:1 sobre blanco, nunca texto claro sobre
  fondo claro), borde `#C9CFC9`. Acento lima sobrio `#7CB342` (punto activo `#9CCC65` sobre
  grafito) para estados de alerta/énfasis; verde `#2E7D32` al día; rojo `#B3261E` peligro/deuda
  vencida. Banners: texto `#1A1D21` sobre ámbar pálido `#FDF3D7` (borde `#8A5F14`) o rojo pálido
  `#FDECEA` (borde `#8F1D16`), barra lateral de 4px, enlaces subrayados oscuros.
  El color nunca es la única señal: siempre hay texto.
- Números Inter tabular; titulares Poppins 600 (equivalente abierta de Product Sans, vía Google
  Fonts con fallback a Inter) 20/24; KPI 19-24 bold con etiqueta 10px en mayúsculas espaciadas
  (Inter); moneda `es-AR` a la derecha; contraste ≥ 4.5:1. Reglas duras: nunca texto claro sobre
  fondo claro ni texto oscuro sobre fondo oscuro (sobre grafito: `#E8EAED` con opacidad ≥ 75 %).

## 2. Layout y componentes (aprobado)

- Sidebar fija: consorcio activo con selector arriba; Liquidación, Gastos, Pagos, Reclamos,
  Reservas, Documentos, Indicadores, Notificaciones. 390px: topbar + hamburguesa.
- KPI hero oscura (F+D, estándar): fondo grafito `#23272E`, icono Lucide en pastilla lima
  `#9CCC65`, etiqueta lima 10px en mayúsculas, número Inter blanco 21-24px, delta en `#E8EAED`.
  Sin sombras ni brillos.
- Tablas financieras: filtro arriba, importes tabulares a la derecha, fila de totales fija.
- Banner de alerta con causa y acción. Diálogos de dinero con importe en grande y confirmación
  explícita; la IA propone, nunca crea gasto (RN-14).
- Botones pastilla (radio completo): primario lima con texto grafito, secundario con borde,
  peligro rojo con confirmación. Altura mínima 44 px.
  explícita; la IA propone, nunca crea gasto (RN-14).
- Vacíos con acción; diferidos con progreso; `test:a11y` 0 A/AA; `medir:p95` <2 s.
- Iconos Lucide (MIT, `lucide-react` 0.525.0, a verificar en `package-lock`): urgencias
  `siren`/`triangle-alert`/`circle`, estado `badge-check`. Color + icono + palabra, siempre.

## 3. Alcance de implementación

1. Actualizar `docs/guia-estilos.md` §3 a estos tokens y componentes.
2. Rehacer `docs/guia-estilos-ejemplo.html` con sidebar grafito + KPI cards nuevas.
3. Push de espera en el companion y cierre de sesión visual.
