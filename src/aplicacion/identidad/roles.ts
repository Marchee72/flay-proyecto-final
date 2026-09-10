import { ErrorDeAplicacion } from '@/compartido/errores'
import { ROLES, type Rol } from '@/dominio/identidad/rol'

/**
 * Los roles, del lado de la interfaz. Existe porque la presentacion no importa
 * el dominio (§12.1.2): sin esto, cada pantalla escribiria los tres nombres a
 * mano y un cuarto rol no aparecería en ninguna.
 */

export const ROLES_ASIGNABLES: readonly { valor: string; etiqueta: string }[] = [
  { valor: 'administrador', etiqueta: 'Administrador' },
  { valor: 'consejo', etiqueta: 'Consejo de administración' },
  { valor: 'consorcista', etiqueta: 'Consorcista' },
]

export class RolDesconocido extends ErrorDeAplicacion {
  constructor() {
    super('Elegí un rol de la lista.', 'RF-03')
  }
}

/** Valida lo que llega de un formulario y recien ahi es un `Rol`. */
export function rolDesdeFormulario(valor: unknown): Rol {
  const rol = ROLES.find((candidato) => candidato === valor)
  if (!rol) throw new RolDesconocido()
  return rol
}
