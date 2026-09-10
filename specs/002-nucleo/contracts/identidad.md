# Contrato — Identidad y habilitaciones (`CU-01`, `RF-03`)

## Casos de uso

| Caso de uso | Entrada | Sale bien | Sale mal |
|---|---|---|---|
| `iniciarSesion` | correo, contraseña, origen | Sesión con identidad únicamente (R-01) | Mensaje **idéntico** para cuenta inexistente, contraseña incorrecta y cuenta bloqueada (FR-001c) |
| `invitarPersona` | correo, nombre, rol, consorcio, vigencia | Usuario en estado `invitado`, habilitación creada y `TrabajoPendiente` de tipo `invitacion` | El alta **no falla** si el correo falla (FR-006) |
| `fijarContrasena` | credencial de invitación, contraseña nueva | Usuario `activo`; el administrador nunca conoce la contraseña | Credencial vencida o ya usada |
| `otorgarHabilitacion` | usuario, consorcio, rol, vigencia | Habilitación vigente | Sólo administrador; nunca sobre un consorcio ajeno |
| `revocarHabilitacion` | habilitación | Vigencia cerrada a hoy | Efecto **inmediato**: la próxima operación del usuario ya no pasa (FR-004) |
| `reenviarInvitacion` | usuario | Trabajo pendiente despachado sin esperar el próximo intento | Sólo administrador |
| `desbloquearUsuario` | usuario | `bloqueado_hasta` en nulo | Sólo administrador (FR-001c) |

## Rutas

| Ruta | Quién |
|---|---|
| `/ingresar` | Público |
| `/invitacion/[credencial]` | Público con credencial válida |
| `/usuarios` · `/usuarios/invitar` | Administrador |

## Reglas verificables

- Cinco intentos fallidos consecutivos bloquean quince minutos; el sexto falla **aunque la
  contraseña sea correcta** (SC-006d).
- Un usuario con habilitación vigente sobre A y ninguna sobre B recibe cero filas o «no encontrado»
  al pedir cualquier dato de B, **también por identificador directo en la dirección** (SC-002).
- Un consorcista que intenta un alta de gasto o de usuario es denegado (SC-002b): la dimensión rol
  se prueba, no sólo la de consorcio.
- La semilla de arranque crea un solo administrador, con la contraseña tomada de una variable de
  entorno y jamás versionada (FR-005).
