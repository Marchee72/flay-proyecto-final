# Quickstart — 004-servicios

Cómo se valida la etapa de punta a punta. Quien clona arranca en `002-nucleo/quickstart.md` y
`003-liquidacion/quickstart.md`; esto agrega lo propio de servicios, indicadores y asistencia.

## Preparar

1. Todo lo de `003`: base, `.env`, `npm run db:deploy`, `npm run semilla`.
2. `npm run db:deploy` aplica las migraciones de esta etapa: `Reclamo` con su `CHECK` de RN-11,
   `ReclamoHistorial`, `SugerenciaReclamo`, `EspacioComun`, `Reserva` con su restricción de
   exclusión, `Novedad`, `DocumentoConsorcio`, `FragmentoDocumento` con su índice HNSW,
   `ConsultaDocumental`, `ExtraccionComprobante`, los cuatro tipos de trabajo, las cinco vistas
   materializadas, los disparadores de auditoría nuevos y la migración de datos que encola las
   notificaciones que `003` dejó pendientes.
3. `npm run semilla` agrega al juego de § 13.4: dos espacios comunes por consorcio, los reclamos
   de `datos-cliente/juego-ficticio-13-4/reclamos.csv` con historial, y el reglamento de
   `datos-cliente/reglamento/` como documento del consorcio de 12 unidades.
4. Asistencia, según lo que se quiera probar:
   - **Sin nada** en `.env`: implementación nula. Todo funciona; las tres funciones asistidas dicen
     que el servicio no está disponible (SC-013).
   - `FLAY_ASISTENCIA=determinista`: lo que corren las pruebas de extremo a extremo.
   - `GEMINI_API_KEY=…`: el proveedor real (research R-01). Sólo para la demostración y para la
     verificación manual de la última tabla.
5. Vistas: `npm run indicadores:refrescar` (o el botón del panel). La tarea programada las refresca
   a las 04:00.

## Validar

| # | Qué se corre | Qué prueba |
|---|---|---|
| 1 | `npm run verificar` | La puerta completa, ahora con reclamos, reservas, comunicación, indicadores y asistencia |
| 2 | `npm run test:dominio` | Máquina de estados de reclamo y fragmentación de texto, **sin base** |
| 3 | `npm run test:integracion` | RN-11 por `CHECK` (SC-004), exclusión de reservas con dos inserciones concurrentes saltando la aplicación (SC-005), deuda vencida (SC-006), avisos de `003` despachados (SC-007), correo caído sin fallas de negocio (SC-008), tres implementaciones por interfaz contadas (SC-012), filtro antes de recuperar con dos consorcios (SC-016), cero gastos sin confirmación (SC-017), auditoría de las tablas nuevas (SC-021) |
| 4 | `npm run test:e2e` | `CU-07` a `CU-15` con la determinista, escritorio y teléfono (SC-019) |
| 5 | `npm run test:a11y` | Reclamo y reserva a 390 px, cero infracciones A/AA (SC-020) |
| 6 | `npm run validar:indicadores` | Los seis indicadores contra el cálculo manual sobre § 13.4 con doce períodos liquidados, decimal con tolerancia cero (SC-009, SC-022) |
| 7 | `npm run medir:p95 /panel` | Panel consolidado bajo 2 s en el percentil 95 sobre el volumen de `semilla:volumen` (SC-010) |
| 8 | `npm run exportar:verificar` | Los tres CSV de un consorcio abren con la planilla y cuadran con la liquidación (SC-018) |

## Verificación manual contra el proveedor real (demostración)

Con `GEMINI_API_KEY` cargada y el reglamento indexado:

| Qué | Cómo | Se espera |
|---|---|---|
| Extracción | Subir `datos-cliente/comprobantes/archivos/C15.png` (total manuscrito) desde «cargar con asistencia» | En menos de un minuto el formulario aparece precargado con `62500.00`; confirmar crea el gasto |
| Sin respaldo | Preguntar «¿cuánto cuesta el estacionamiento para visitas?» | «No lo encontramos en la documentación cargada», sin inventar (SC-015) |
| Otro consorcio | Como consorcista del consorcio de 96 unidades, preguntar por el SUM | «No lo encontramos»: el reglamento es del de 12 (SC-016) |
| Degradación | Quitar la clave, reiniciar, repetir las tres | Mensajes de servicio no disponible; reclamos, gastos y reservas siguen funcionando (SC-013) |
