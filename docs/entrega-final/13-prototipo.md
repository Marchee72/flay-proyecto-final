# 13. Prototipo

> **Requisito de la cátedra (Última entrega, punto 13):** *"Prototipo."*
> **Fecha límite:** 18 de diciembre de 2026.

> ⚠️ **Estado: esqueleto.** Este documento se completa durante la construcción. La estructura y los
> criterios ya están definidos; el contenido se incorpora al cerrar cada iteración.

---

## 13.1 Naturaleza del prototipo

Conforme al punto 8.4, en este proyecto conviven dos tipos de prototipo:

| Tipo | Destino | Documento |
|---|---|---|
| Prototipo de interfaz, desechable | Se descarta tras validarlo con el cliente | Se documenta en 13.2 |
| **Prototipo del sistema, evolutivo** | **Se convierte en el sistema entregado** | Es el prototipo exigido por este punto |

El prototipo entregado es el resultado de las tres iteraciones del punto 8.3.1, desplegado y
operativo, no una maqueta.

## 13.2 Prototipo de interfaz — resultado de la validación

*Verificación FR-027 (`001-andamiaje`) al 09/09/2026 — H-09 parte verificable:*

| Hito (punto 10) | Fecha prevista | Estado real | Evidencia |
|---|---|---|---|
| Prototipo de interfaz 2.5 | 24/07/2026 | No cumplido | Sin pantallas ni acta en el repo; se reprograma al arranque de 001 |
| Prueba de concepto 5.1 | semana del 24/08/2026 | No cumplida | Sin código desechable ni medición 80/85 %; pasa a paquete 5.1 de 004 con datos de `datos-cliente/` |
| Demo de iteración 1 | 04/09/2026 | No cumplida | Entorno de demostración desplegado y actualizándose solo desde el 09/09/2026, pero sin funcionalidad que demostrar: `001-andamiaje` no construye ningún `RF-nn`. Pasa a SC-014 de 002 |

*Validación con cliente (paquete 2.5 del punto 10.2), pendiente de reprogramación:*

| Pantalla | Usuario validador | Fecha | Observaciones recibidas | Resolución |
|---|---|---|---|---|
| Panel de administración | Socio gerente | | | |
| Carga de gasto con comprobante | Responsable de liquidaciones | | | |
| Ejecución de la liquidación | Responsable de liquidaciones | | | |
| Estado de cuenta de la unidad | Consorcista | | | |
| Alta y seguimiento de reclamo | Consorcista | | | |
| Panel de indicadores | Socio gerente | | | |

## 13.3 Alcance del prototipo entregado

*A completar al cierre de las tres iteraciones. Debe coincidir con el alcance comprometido del
punto 9.11: 433 puntos de función sin ajustar, con las 23 funcionalidades diferidas allí
enumeradas.*

**Estado al cierre de la iteración 1** (etapa `002-nucleo`, 2026-09-10):

| Módulo | Requerimientos | Estado | Observaciones |
|---|---|---|---|
| Usuarios, roles y habilitaciones | RF-03 | **Construido** | Identidad, invitación por correo y habilitación en tres niveles (plataforma, administradora, consorcio). Bloqueo por intentos fallidos con mensaje único |
| Consorcios y unidades | RF-01, RF-02 | **Construido** | Alta, padrón y cambio de coeficiente hacia el futuro. La suma exacta la impone un disparador diferido, no el código |
| Gastos y comprobantes | RF-04, RF-05, RF-10 | **Construido** | Alta de gasto sobre período abierto, subida directa del comprobante al almacenamiento, listado filtrable. Sin baja de gasto: diferida (§ 9.11) |
| Liquidación de expensas | RF-07, RF-08 | Iteración 2 | El contrato del estado del período ya está declarado y compartido (M-04) |
| Pagos y morosidad | RF-09 | Iteración 2 | |
| Reclamos | RF-11, RF-13 | Iteración 2 | |
| Reservas | RF-15, RF-16 | Iteración 3 | |
| Proveedores | RF-17 | **Construido** | Alta y edición. Sin baja: diferida (§ 9.11) |
| Comunicación y documentación | RF-18, RF-19 | Iteración 3 | |
| Notificaciones | RF-14 | **Parcial** | El mecanismo de reintento está construido y probado; el único aviso que produce esta etapa es la invitación |
| Indicadores de gestión | RF-21 a RF-25 | Iteración 3 | |
| Funciones asistidas | RF-06, RF-12, RF-20 | Iteración 3 | La pantalla de alta de gasto ya admite valores precargados y exige confirmación humana, para que `RF-06` se enchufe sin rediseñarla (FR-020, regla RN-14) |
| Auditoría | RF-26 | **Construido** | Las cinco tablas económicas de la etapa dejan asiento por disparador; la aplicación no puede escribir la bitácora |

### Lo que la iteración 1 deja verificado

| Criterio | Medición al 2026-09-10 |
|---|---|
| Suma de coeficientes exacta en los dos consorcios de § 13.4 (SC-001) | `100.00000000` en ambos, comparado por decimal |
| Aislamiento por consorcio y por rol (SC-002, SC-002b) | 82 pruebas de integración; el filtro por consorcio aparece en un solo archivo |
| Invariantes impuestos por la base (SC-004b, SC-005) | Verificados **salteándose la capa de aplicación** |
| Tiempo de respuesta del listado con 10.800 gastos (SC-006) | p95 de 363 ms contra un límite de 2.000 ms (§ 14.5) |
| Accesibilidad de las pantallas del consorcista (SC-011) | axe sin infracciones A ni AA |

## 13.4 Datos de demostración

*Semilla versionada en `datos-cliente/juego-ficticio-13-4/` (M-08). La demostración corre únicamente
sobre esta semilla; se registra su hash SHA256 por archivo:*

- Dos consorcios contrastantes: C-A Mitre 456 (12 uds, 12.50000000/7.50000000/5.00000000 =
  100.00000000) y C-B San Martín 7890 (96 uds, 95×1.04166667 + 1×1.04166635 = 100.00000000).
  **Construido** en `pruebas/fixtures/juego-13-4.ts`, con esos mismos coeficientes, y cargado por
  `npm run semilla`; el volumen anual de 10.800 gastos lo agrega `npm run semilla:volumen`. La
  semilla es código y no un juego de archivos con hash bajo `datos-cliente/`: al ser
  determinística, el hash que M-08 pedía lo da el control de versiones.
- Doce períodos (C-A 2025-09 a 2026-08, 11 liquidados + 1 abierto; C-B 11 liquidados + 1 abierto).
- Mora: C-A 3B (3 períodos), 1C (2), 2C (1); resto al día. Reclamos RC-01 a RC-05 en todos los estados.
- Reglamento indexado: `datos-cliente/reglamento/reglamento-copropiedad.md` + 20 preguntas.
- Un usuario por rol (`usuarios.csv`): administrador, consejo, consorcistas al día y morosos.

| Archivo | SHA256 |
|---|---|
| `consorcios.csv` | `2F25629373F4AEE86121B27E2DB801852CA97737F00B069CCD4170D830AE0834` |
| `unidades-12.csv` | `8B78D0AF2E09E20B6EC16193BD09F6E47D8F30F580381FAE9927BB791FF4E732` |
| `unidades-96.csv` | `DA14E0F84A826BB03CD7C5FC187A1BA33FE80109B981B2B71AA08B0FCD9EC43B` |
| `periodos-12.csv` | `6415808F00F47BD56835F41DB1E94AA5D27C3AF58BA8268FC8BF05238E69BB6C` |
| `reclamos.csv` | `F87B669AD6E90864086DDA547350003896B188936F604A5B8421EDFF48524A4D` |
| `usuarios.csv` | `6D6C2CCE06FA55329F5E71FBD14182EF8A2D64513D60CF06AEF1B2A21635B3F4` |

Los datos son ficticios. **No se utilizan datos reales de Grupo Delta en el entorno de demostración**,
conforme al punto 5.3.2.

## 13.5 Acceso al prototipo

*A completar.*

| Dato | Valor |
|---|---|
| Dirección del sistema | |
| Usuario administrador | |
| Usuario operador | |
| Usuario consorcista | |
| Repositorio de código | |
| Versión entregada | |

## 13.6 Guion de demostración

*A completar.* Recorrido sugerido para la evaluación, que muestra el circuito completo del negocio:

1. Ingreso como operador, carga de un gasto adjuntando el comprobante y verificación de la extracción
   asistida.
2. Ingreso como administrador, ejecución de la liquidación del período y verificación de la
   cuadratura.
3. Ingreso como consorcista, consulta del estado de cuenta y descarga de la expensa con acceso a los
   comprobantes de respaldo.
4. Alta de un reclamo como consorcista y verificación de la clasificación automática.
5. Gestión del reclamo como operador hasta su cierre, con notificación al vecino.
6. Consulta sobre el reglamento en lenguaje natural, verificando la cita de la fuente.
7. Panel de indicadores: morosidad, desvío de gasto, desempeño de proveedores y tiempo de resolución.
8. Demostración de la degradación: con el servicio de asistencia deshabilitado, la carga manual y el
   alta de reclamo siguen funcionando.

El punto 8 del guion no es habitual en una demostración, pero es la verificación de RNF-14 y de los
principios del punto 12.8.1.

## 13.7 Limitaciones conocidas

*A completar.* Debe enumerar, sin omitir: las funcionalidades diferidas del punto 9.11, los defectos
abiertos de severidad baja y media, y toda diferencia entre lo diseñado y lo construido.

---

## Referencias

*A completar.*
