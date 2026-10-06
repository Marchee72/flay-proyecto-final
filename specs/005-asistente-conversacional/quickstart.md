# Quickstart — Validar el asistente conversacional (RF-27)

Guía para comprobar la feature de punta a punta. No contiene código de implementación.

## Prerrequisitos

- Base local levantada y migrada: `npm run db:deploy`.
- Semilla cargada: `npm run semilla` (incluye el juego de § 13.4 y la demo; ver CLAUDE.md).
- Para la prueba con proveedor real: `GEMINI_API_KEY` en `.env`. Para degradación: dejarla vacía.

## 1. Pruebas automatizadas (puerta única)

```bash
npm run verificar
```

Encadena formato, lint (incluye que no haya filtros `consorcioId` a mano fuera de la lista
blanca), typecheck, dominio, migraciones/deriva, integración, build y e2e. Las pruebas de IA
corren con `FLAY_ASISTENCIA=determinista` (ya fijado en el arnés).

Pruebas nuevas que deben estar en verde:
- `pruebas/integracion/asistente.spec.ts`: ruteo a la herramienta correcta; **SC-001** (consorcista
  no ve datos ajenos), **SC-002** (morosidad agregada vs nominada), **SC-004** (lo enviado al
  modelo no trae nombre/correo/teléfono/documento), **SC-003** (escritura sin confirmar no cambia
  nada; confirmar ejecuta una sola vez; segundo confirmar no duplica; otro usuario no confirma),
  **SC-006** (pedido fuera de dominio → negativa).
- `pruebas/e2e/asistente.spec.ts`: reserva por chat con tarjeta y confirmación; admin asigna un
  reclamo; proyecto Playwright `nula` → mensaje de degradación (**SC-007**); vista 390×844 y axe
  (**FR-014**).

## 2. Validación manual en la app

```bash
npm run dev
```

Entrar al panel y navegar a un consorcio (`/consorcios/<id>/…`); abrir el asistente.

**Como consorcista** (usuario de la semilla con unidad con deuda):
1. "¿cuánto debo?" → responde con el saldo y períodos de **su** unidad; ninguna ajena (SC-001).
2. "¿cómo viene la morosidad del edificio?" → dato **agregado**, sin nombres (SC-002).
3. "¿qué reservas hay para el salón el sábado?" → interpreta "sábado" contra hoy (Argentina).
4. "reservá el salón el sábado de 20 a 23" → aparece la **tarjeta** con espacio, unidad y horario y
   un botón **Confirmar**; antes de confirmar, no existe la reserva (SC-003).
5. Confirmar → se crea **una** reserva, con aviso de éxito; volver a confirmar/recargar no crea otra.
6. "¿qué dice el reglamento sobre mascotas?" → responde **con cita** o declara que no hay respaldo
   (SC-005).
7. "escribime un poema" → **negativa fija**, sin intentar responder (SC-006).

**Como administrador**:
8. "morosidad del edificio" → nómina **nominada** de deudores (la que al consorcista se le niega).
9. "asigná el reclamo del ascensor a <responsable>" → tarjeta con el responsable resuelto por su
   nombre; al confirmar, el reclamo pasa a "asignado".
10. "publicá una novedad: corte de agua el martes" → tarjeta; al confirmar, se publica y notifica.
11. Nombrar **otro consorcio de su administración** en una consulta → responde sobre ese; nombrar
    uno ajeno → no obtiene datos (SC-001 / FR-011).

**Degradación** (con `GEMINI_API_KEY` vacía, `FLAY_ASISTENCIA` sin fijar → `nula`):
12. Cualquier pregunta → mensaje claro de "asistente no disponible"; el resto del panel sigue
    funcionando (SC-007).

## 3. Revisión de alcance (lo que NO debe pasar)

- Ninguna respuesta contiene datos de una unidad que el usuario no ocupa ni de otro consorcio.
- El modelo nunca ejecuta una escritura sin la confirmación.
- En los registros de `MensajeAsistente` con `rol = herramienta`, el `resultado` guardado
  (lo que vio el modelo) no contiene nombre, correo, teléfono ni documento.
