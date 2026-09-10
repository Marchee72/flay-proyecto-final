# Research — 002-nucleo (Fase 0)

Las cinco decisiones abiertas se cerraron en la sesión de clarificación del 2026-09-09 y están en
`spec.md` § Clarifications. Lo que queda aquí es cómo se implementan sobre el andamiaje de `001`, y
las tres dependencias nuevas que la etapa incorpora. Cero `NEEDS CLARIFICATION` al 2026-09-09.

## R-01 Sesión y autorización (FR-002, FR-004, RNF-03)

- **Decisión**: la sesión de Auth.js transporta **únicamente la identidad** (id de usuario). Ni el
  rol ni el consorcio viajan en la credencial de sesión. Cada caso de uso de `src/aplicacion`
  resuelve la habilitación vigente consultando la base, por par (rol, consorcio).
- **Fundamento**: el caso borde de la especificación lo exige —«un usuario que pierde su
  habilitación mientras tiene una sesión abierta»—: si el rol viajara en la credencial, revocar una
  habilitación no tendría efecto hasta que la sesión expirara. Además evita el problema clásico de
  las credenciales autocontenidas, que no se pueden revocar antes de su vencimiento.
- **Alternativas**: rol y consorcios dentro de la credencial firmada (más rápido, revocación
  diferida: rechazado, viola FR-004); sesión en base con adaptador (`@auth/prisma-adapter`, 2.11.3),
  que también resuelve la revocación pero agrega una lectura por pedido sin beneficio adicional
  dado que igual hay que leer la habilitación. **Se adopta credencial de sesión sólo con identidad y
  habilitación siempre desde la base.**

## R-02 Dónde se fija el consorcio activo (FR-003, Principio I)

- **Decisión**: el caso de uso abre el contexto con `enConsorcio(consorcioId, ...)` —la función que
  `001` ya expone— **después** de verificar la habilitación y **antes** de tocar el repositorio. La
  extensión del cliente inyecta el filtro; ninguna consulta de negocio lo escribe.
- **Fundamento**: FR-003 y SC-003. El punto único es lo que hace que olvidarse sea imposible en vez
  de improbable.
- **Alternativas**: seguridad a nivel de fila en la base con `SET LOCAL`, que sería más fuerte
  todavía. **Rechazada por ahora**: la conexión pasa por un agrupador de conexiones, donde una
  variable de sesión puede sobrevivir al pedido que la fijó y contaminar al siguiente. Queda
  anotada como refuerzo posible si alguna vez se conecta sin agrupador.

## R-03 Suma de coeficientes impuesta por la base (FR-011b, FR-011c, regla RN-01)

- **Decisión**: disparador de restricción `DEFERRABLE INITIALLY DEFERRED` sobre `Unidad` y
  `CoeficienteHistorico`. Al confirmar la transacción verifica, por cada consorcio tocado, que la
  suma de los coeficientes vigentes dé exactamente `100.00000000`. Un consorcio sin unidades no se
  evalúa. Escrito a mano en la migración: el mapeador no modela disparadores.
- **Fundamento**: es el mismo criterio que la constitución ya impone para la regla RN-09. Diferido
  y no inmediato porque un alta carga N unidades dentro de una transacción y sólo la última la deja
  cuadrada.
- **Alternativas**: verificación sólo en la aplicación (deja la ventana de carrera que la
  clarificación descartó); columna calculada con restricción de verificación (no puede agregar
  entre filas).

## R-04 Superposición de ocupaciones (FR-008, regla RN-09)

- **Decisión**: `Ocupacion` lleva la vigencia como **una columna de rango de fechas** y la
  restricción de exclusión `EXCLUDE USING gist (unidad_id WITH =, tipo WITH =, vigencia WITH &&)`,
  apoyada en `btree_gist`, que `001` ya instaló. El mapeador declara la columna como tipo no
  soportado y la migración la escribe a mano; el repositorio la lee y la escribe con consulta
  cruda, encapsulada en infraestructura.
- **Fundamento**: la constitución exige que lo que la base pueda imponer, lo imponga la base. SC-005
  prueba el rechazo **salteándose la capa de aplicación**, así que no hay forma de aprobarlo con
  una verificación de código.
- **Alternativas**: dos columnas de fecha más verificación en la aplicación (rechazada por la misma
  razón); rango sin exclusión (no impide nada).

## R-05 Subida directa del comprobante (FR-018, FR-018b, FR-018c)

- **Decisión**: `@vercel/blob` 2.8.0 con **subida desde el navegador**. La aplicación expone una
  ruta que valida habilitación, tipo y tamaño, y devuelve un permiso de corta duración; el archivo
  va del navegador al almacenamiento sin pasar por la función. El puerto del dominio expone
  `emitirPermisoDeSubida` y `resolverLecturaAutorizada`, nunca «recibir bytes» (FR-019).
- **Fundamento**: la plataforma limita el cuerpo de un pedido muy por debajo de los 25 MB que la
  clarificación fijó. No es optimización: sin subida directa, el requisito no se cumple.
- **Alternativas**: subir a través de la función (imposible por el límite); trocear el archivo en la
  aplicación (complejidad propia para reimplementar lo que el proveedor ya ofrece).
- **Presentación**: HEIC y TIFF no los muestra ningún navegador. Se ofrece descarga con la razón
  dicha (FR-018c); convertir queda para `004-servicios`.

## R-06 Drenaje de trabajos pendientes (FR-006b)

- **Decisión**: `TrabajoPendiente` con estado, intentos y momento del próximo intento. El drenaje
  se dispara con `after()` de Next 15 —disponible en 15.5.25— al final de los pedidos del panel:
  corre **después** de responder, así no le agrega latencia al usuario. Toma un lote pequeño con
  bloqueo de fila y salteando lo bloqueado, para que dos pedidos simultáneos no despachen lo mismo.
  Espera creciente entre intentos y acción explícita de reenvío para el administrador.
- **Fundamento**: cumple lo que la cláusula de notificaciones protege sin depender de un ejecutor
  programado que la capa gratuita limita a una corrida diaria. Ver el cumplimiento diferido
  declarado en `plan.md`.
- **Alternativas**: tarea programada diaria (peor resultado para una invitación); servicio de colas
  externo (un proveedor más en la etapa más cargada); sin reintento automático (incumple RNF-14).

## R-07 Contraseñas y freno a la prueba por fuerza bruta (FR-001, FR-001b, FR-001c)

- **Decisión**: `@node-rs/argon2` 2.0.2 con Argon2id y los parámetros recomendados por OWASP —19 MiB
  de memoria, dos iteraciones, paralelismo 1—, verificados contra el tiempo real de la plataforma y
  ajustados si el inicio de sesión se va por encima de los presupuestos. `IntentoInicioSesion`
  registra momento, correo probado y origen; cinco fallos consecutivos bloquean quince minutos. El
  mensaje es idéntico exista o no la cuenta y esté o no bloqueada.
- **Fundamento**: Argon2id protege la base robada; el bloqueo protege el formulario. Son problemas
  distintos y hacen falta los dos (RNF-04, § 18).
- **Alternativas**: retardo creciente sin bloqueo (elegida por el equipo la opción de bloqueo:
  queda el flanco de negación de servicio asentado en `spec.md` § Assumptions); prueba anti-robot
  (proveedor externo, se difiere).

## R-08 El dinero en el borde (FR-013, FR-016, SC-009, SC-010)

- **Decisión**: `Prisma.Decimal` en toda firma pública del dominio; hacia la interfaz, cadena con
  dos decimales para importes y ocho para coeficientes. Entrada validada con Zod desde cadena, sin
  pasar jamás por el tipo numérico nativo. La regla `flay/sin-aritmetica-monetaria` de `001` marca
  cualquier operador aritmético sobre un decimal.
- **Fundamento**: medidas 1, 2 y 3 de § 14.1. SC-010 se prueba con un importe de más de quince
  dígitos significativos, que es donde el tipo nativo pierde precisión.
- **Alternativas**: enteros de centavos (no sirve para ocho decimales de coeficiente); cadena en el
  dominio con conversión al calcular (mueve el problema al peor lugar).

## R-09 Correo transaccional (FR-006)

- **Decisión**: `resend` 6.26.0 detrás del puerto `Notificador` del dominio. La invitación se
  encola siempre como `TrabajoPendiente`; el envío feliz también pasa por la tabla, de modo que hay
  un solo camino y no dos.
- **Fundamento**: un solo camino se prueba una vez. Si el envío directo fuera el camino normal y la
  tabla el excepcional, el camino excepcional se ejercitaría sólo cuando el proveedor falla, que es
  justo cuando no se quiere descubrir un defecto.
- **Alternativas**: envío sincrónico con reintento en memoria (se pierde al reiniciar el proceso).

## R-10 Juego de datos y medición (FR-028, SC-006)

- **Decisión**: el juego de § 13.4 —12 y 96 unidades— se carga con una semilla determinística que
  vive en el repositorio y se usa como fixture de integración y de extremo a extremo. Para SC-006 se
  genera el volumen anual (10.800 gastos) con la misma semilla y se mide con `medir:p95` de `001`,
  en caliente.
- **Fundamento**: FR-028 lo pide y evita mantener dos juegos de datos. La semilla determinística es
  lo que hace comparable una medición con la siguiente.
- **Alternativas**: datos aleatorios por corrida (mediciones no comparables); volumen sólo en
  desarrollo (no prueba el entorno donde se demuestra).

## Dependencias nuevas de la etapa

| Paquete | Versión | Para qué | Nota |
|---|---:|---|---|
| `@vercel/blob` | 2.8.0 | Subida directa y lectura autorizada de comprobantes | Tras el puerto de FR-019 |
| `resend` | 6.26.0 | Correo de invitación | Tras el puerto `Notificador` |
| `@auth/prisma-adapter` | 2.11.3 | Persistencia de usuarios y verificación de correo para Auth.js | Sólo si la invitación lo requiere; se decide al implementar el bloque A |

Las tres se fijan con versión exacta y se agregan a § 14.1 antes de cerrar la etapa: `npm run
docs:versiones` falla si el documento no las menciona (FR-023 de `001`).
