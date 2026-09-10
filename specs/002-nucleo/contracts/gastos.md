# Contrato — Gastos, comprobantes y consulta (`CU-02`, `CU-05`, `RF-04`, `RF-05`, `RF-10`, `RF-17`)

## Casos de uso

| Caso de uso | Entrada | Sale bien | Sale mal |
|---|---|---|---|
| `abrirPeriodo` | consorcio, año, mes | Período `abierto` | Ya existe uno para ese consorcio y mes (FR-024) |
| `registrarGasto` | período, rubro, proveedor, importe (cadena), fecha, descripción | Gasto persistido; la bitácora recibe su asiento por disparador | Período no `abierto`: rechazado (regla RN-03, SC-012) |
| `pedirPermisoDeSubida` | gasto, tipo de contenido, bytes | Permiso de corta duración para subir **directo** al almacenamiento | Tipo no aceptado o más de 25 MB: rechazado **antes** de transferir un byte (FR-018) |
| `confirmarComprobante` | gasto, clave del objeto | Comprobante `disponible` | Si la confirmación no llega, queda `pendiente` y se reintenta (FR-006b) |
| `listarGastos` | consorcio, período, rubro, paginado | Listado con acceso al comprobante | Sólo de los consorcios habilitados |
| `verComprobante` | comprobante | Dirección temporal de lectura | Comprobante de otro consorcio: «no encontrado», nunca «prohibido» |
| `altaProveedor` / `editarProveedor` | razón social, CUIT, rubro habitual | Proveedor del consorcio | Sin baja: diferida (§ 9.11) |

## Rutas

| Ruta | Quién |
|---|---|
| `/gastos` (listado filtrable) | Todos los habilitados; es la pantalla del consorcista (`CU-05`) |
| `/gastos/nuevo` | Administrador |
| `/gastos/[id]` | Habilitados del consorcio |
| `/api/comprobantes/permiso` | Habilitados con rol de carga |
| `/proveedores` · `/periodos` | Administrador |

## La costura de `RF-06` (FR-020, Principio IV)

El formulario de alta de gasto acepta **valores precargados** por parámetro y marca cada campo
precargado como tal. La creación exige confirmación humana explícita. En `004-servicios`, la
extracción del comprobante llena esos mismos parámetros: **la pantalla no se rediseña**, y ninguna
salida automática crea un gasto (regla RN-14).

## Reglas verificables

- Comprobante de 25 MB: sube y se recupera. De 26 MB: rechazado antes de transferir. HEIC: se
  recupera por descarga, con la razón dicha. El archivo **nunca** atraviesa el servidor (SC-006c).
- Con 10.800 gastos, el listado filtrado responde bajo 2 s en el percentil 95, medido en caliente
  (SC-006); el arranque en frío se informa aparte (SC-006b).
- Un importe de más de quince dígitos significativos llega a la interfaz **como cadena**, sin
  pérdida (SC-010).
- Las cinco tablas económicas dejan exactamente un asiento por operación (SC-007), y la aplicación
  no puede escribir la bitácora (SC-008).
- El listado y el detalle se ven a 390 px sin desplazamiento horizontal y pasan axe sin
  infracciones A ni AA (SC-011).
