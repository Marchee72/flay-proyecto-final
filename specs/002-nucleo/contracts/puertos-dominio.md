# Puertos del dominio — 002-nucleo

Interfaces declaradas en `src/dominio/contratos` e implementadas en `src/infraestructura`
(Principio III, FR-019). El dominio no nombra a ningún proveedor. La zona de análisis estático de
`001-andamiaje` rechaza en `src/dominio` cualquier importación del cliente de datos, del proveedor
de correo, del de objetos y de `next/*`.

## `Reloj`

```text
ahora(): Fecha
hoy(): FechaSinHora
```

Existe para que la vigencia de una habilitación y la de un coeficiente se puedan probar sin esperar
al calendario. Ninguna regla llama al reloj del sistema directamente.

## `AlmacenObjetos` (FR-018b, FR-019)

```text
emitirPermisoDeSubida(clave, tipoContenido, bytesMaximos): PermisoDeSubida
resolverLecturaAutorizada(clave, duracion): DireccionTemporal
eliminar(clave): void
```

**No expone «recibir bytes»**: el archivo va del navegador al almacenamiento y nunca atraviesa el
servidor. `bytesMaximos` es 26.214.400 y los tipos aceptados son PDF, JPEG, PNG, WebP, HEIC y TIFF.

## `Notificador` (FR-006, FR-009 de la constitución)

```text
enviarInvitacion(destino, enlaceDeAlta, consorcio): void
```

Toda invocación pasa antes por `TrabajoPendiente`: el camino feliz y el de reintento son el mismo,
así el de reintento no se ejercita únicamente cuando el proveedor falla.

## `DerivadorDeContrasenas` (FR-001, RNF-04)

```text
derivar(contrasenaEnClaro): ClaveDerivada
verificar(contrasenaEnClaro, claveDerivada): booleano
```

Argon2id. El dominio no conoce la biblioteca ni los parámetros; la infraestructura los fija y los
ajusta según el presupuesto de tiempo de la plataforma.

## Repositorios

Uno por raíz: `RepositorioConsorcios`, `RepositorioUnidades`, `RepositorioPersonas`,
`RepositorioUsuarios`, `RepositorioHabilitaciones`, `RepositorioProveedores`, `RepositorioPeriodos`,
`RepositorioGastos`, `RepositorioComprobantes`, `RepositorioTrabajosPendientes`.

Todos devuelven y aceptan tipos del dominio, **nunca** filas del mapeador, y **nunca** el tipo
numérico nativo para dinero o coeficientes (FR-013).

## Regla de invocación

Un caso de uso de `src/aplicacion`, en este orden:

1. Verifica la habilitación vigente por par (rol, consorcio) — FR-002.
2. Abre el contexto con `enConsorcio(consorcioId, ...)` — FR-003.
3. Abre la transacción.
4. Llama al dominio, que decide.
5. Persiste por repositorio; la auditoría la pone el disparador, no el código (FR-025).
6. Encola en `TrabajoPendiente` lo que dependa de un servicio externo.

Saltarse el paso 1 o el 2 es un defecto de aislamiento, no un descuido de estilo.
