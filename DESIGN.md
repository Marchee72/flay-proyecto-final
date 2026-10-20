---
name: Flay
description: Tu consorcio online. Panel flotante en grafito y lima, tarjetas sin borde, cifras tabulares.
colors:
  grafito: "#16191d"
  grafito-claro: "#23282e"
  fondo: "#eef0eb"
  superficie: "#ffffff"
  superficie-hundida: "#f5f6f2"
  tinta: "#15181b"
  tinta-apagada: "#4f575f"
  verde: "#256b29"
  lima: "#7cb342"
  lima-alto: "#a5d66f"
  ambar: "#7a5410"
  rojo: "#a52a21"
  azul: "#1f57a0"
  linea: "#d6dbd2"
typography:
  titulo1:
    fontFamily: "Plus Jakarta Sans, -apple-system, Segoe UI, sans-serif"
    fontSize: "28px"
  titulo2:
    fontFamily: "Plus Jakarta Sans, -apple-system, Segoe UI, sans-serif"
    fontSize: "22px"
  titulo3:
    fontFamily: "Plus Jakarta Sans, -apple-system, Segoe UI, sans-serif"
    fontSize: "18px"
  body:
    fontFamily: "Plus Jakarta Sans, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
  ayuda:
    fontFamily: "Plus Jakarta Sans, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
rounded:
  chico: "10px"
  boton: "12px"
  tarjeta: "16px"
  grande: "22px"
  pastilla: "999px"
spacing:
  e1: "4px"
  e2: "8px"
  e3: "12px"
  e4: "16px"
  e5: "24px"
  e6: "32px"
components:
  boton-primario:
    backgroundColor: "{colors.grafito}"
    textColor: "#ffffff"
    rounded: "{rounded.boton}"
    height: "44px"
    padding: "0 18px"
  boton-fantasma:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.boton}"
    height: "44px"
---

# Design System: Flay

## Overview

**Creative North Star: "El libro mayor a la luz del día"**

Una interfaz de administración que trata el dinero con seriedad sin parecer una planilla: fondo verde-grisáceo claro, tarjetas blancas sin borde que flotan con sombra suave, grafito casi negro para lo que manda y lima como único gesto de marca. Un solo sistema atiende al administrador en escritorio y al copropietario en el teléfono.

Densidad cómoda, jerarquía por peso y tamaño (no por color), cifras en tabular. El color semántico (verde, ámbar, rojo, azul) significa estado, nunca decoración.

**Key Characteristics:**
- Tarjetas sin borde, sombra suave; estados sin borde (pálidos).
- Un botón primario grafito por vista.
- Objetivos táctiles de 44 px.
- Todo valor sale de tokens en `src/app/globals.css`.

## Colors

Neutros verdosos y fríos, un grafito profundo y un acento lima escaso.

### Primary
- **Grafito** (#16191d): botón primario, armazón oscuro del panel.
- **Lima** (#7cb342) / **Lima alto** (#a5d66f): acento de marca sobre grafito; escaso.

### Neutral
- **Fondo musgo claro** (#eef0eb): lienzo de la aplicación.
- **Superficie** (#ffffff) y **Superficie hundida** (#f5f6f2): tarjetas y zonas rebajadas.
- **Tinta** (#15181b) / **Tinta apagada** (#4f575f): texto y secundario.
- **Línea** (#d6dbd2): divisores.

### Semantic
- Verde #256b29, Ámbar #7a5410, Rojo #a52a21, Azul #1f57a0, cada uno con su pálido para fondos de estado.

**The Estado Rule.** El color semántico solo comunica estado (al día, atención, mora, información).

## Typography

**Font:** Plus Jakarta Sans (con -apple-system, Segoe UI), cifras tabulares.

Escala: 28 / 22 / 18 títulos, 15 cuerpo, 13 menor, 12 ayuda.

**The Cifra Rule.** Los importes van en tabular y alineados; jamás se reformatean como número flotante.

## Layout

Panel flotante con navegación por consorcio en la ruta. Ritmo de 4/8/12/16/24/32 px. En teléfono (390×844) una columna; los objetivos táctiles no bajan de 44 px.

## Elevation & Depth

Híbrido: tarjetas sin borde con sombra ambiental (`0 1px 2px rgb(21 24 27/4%), 0 10px 30px rgb(21 24 27/5%)`); sombra alta (`0 16px 40px rgb(21 24 27/16%)`) solo para capas flotantes.

## Shapes

Esquinas generosas: tarjetas 16 px, botones 12 px, controles 10 px, pastillas totales.

## Components

### Buttons
- **Primario:** grafito, texto blanco, 44 px de alto, 12 px de radio, peso 600/14 px; uno por vista.
- **Fantasma:** blanco con borde `linea`. **Terciario:** sin borde. **Peligro:** blanco con borde rojizo.

### Avisos
- Toast para el resultado de una acción; banner `.aviso` para el estado de lo que se mira.

## Do's and Don'ts

### Do:
- **Do** usar tokens de `globals.css`; no escribir colores ni espacios a mano.
- **Do** mantener un solo primario por vista.

### Don't:
- **Don't** usar lima como relleno extenso.
- **Don't** añadir bordes a tarjetas ni usar color semántico como decoración.
