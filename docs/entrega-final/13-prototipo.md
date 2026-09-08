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

*A completar tras el paquete 2.5 del punto 10.2.*

| Pantalla | Usuario validador | Fecha | Observaciones recibidas | Resolución |
|---|---|---|---|---|
| Panel de administración | Socio gerente | | | |
| Carga de gasto con comprobante | Responsable de liquidaciones | | | |
| Ejecución de la liquidación | Responsable de liquidaciones | | | |
| Estado de cuenta de la unidad | Consorcista | | | |
| Alta y seguimiento de reclamo | Consorcista | | | |
| Panel de indicadores | Socio gerente | | | |

## 13.3 Alcance del prototipo entregado

*A completar. Debe coincidir con el alcance comprometido del punto 9.11: 433 puntos de función sin
ajustar, con las 23 funcionalidades diferidas allí enumeradas.*

| Módulo | Requerimientos | Estado | Observaciones |
|---|---|---|---|
| Usuarios, roles y habilitaciones | RF-03 | | |
| Consorcios y unidades | RF-01, RF-02 | | |
| Gastos y comprobantes | RF-04, RF-05, RF-10 | | |
| Liquidación de expensas | RF-07, RF-08 | | |
| Pagos y morosidad | RF-09 | | |
| Reclamos | RF-11, RF-13 | | |
| Reservas | RF-15, RF-16 | | |
| Proveedores | RF-17 | | |
| Comunicación y documentación | RF-18, RF-19 | | |
| Notificaciones | RF-14 | | |
| Indicadores de gestión | RF-21 a RF-25 | | |
| Funciones asistidas | RF-06, RF-12, RF-20 | | |
| Auditoría | RF-26 | | |

## 13.4 Datos de demostración

*A completar.* El prototipo se entrega con un juego de datos que permita evaluarlo sin carga previa:

- Dos consorcios de tamaño contrastante, uno de 12 y otro de 96 unidades.
- Doce períodos con gastos y liquidaciones, para que los indicadores tengan histórico.
- Unidades en distintos estados de mora.
- Reclamos en todos los estados posibles.
- Un reglamento de copropiedad indexado, para demostrar la consulta documental.
- Un usuario por cada rol.

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
