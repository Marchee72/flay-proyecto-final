import type { Rol } from '@/dominio/identidad/rol'

/**
 * Puertos de persistencia. Devuelven y aceptan tipos del dominio, nunca filas
 * del mapeador, y nunca el tipo numerico nativo para dinero o coeficientes
 * (FR-013).
 */

/** De donde sale el permiso. Importa para la auditoria y para la interfaz. */
export type OrigenDelAcceso = 'plataforma' | 'administradora' | 'consorcio'

export interface AccesoVigente {
  usuarioId: string
  consorcioId: string
  /**
   * Puede traer **varios**: el consejo se suma a consorcista en vez de
   * reemplazarlo, con la vigencia de su mandato (FR-007).
   */
  roles: Rol[]
  origen: OrigenDelAcceso
}

export interface RepositorioHabilitaciones {
  /**
   * Rol efectivo sobre un consorcio, resuelto **en un solo lugar** por los tres
   * niveles y en este orden (FR-007c):
   *
   * 1. habilitacion de plataforma — vale sobre cualquier consorcio;
   * 2. habilitacion sobre la administradora duena del consorcio;
   * 3. habilitaciones sobre el consorcio.
   *
   * Los dos ejes de aislamiento colapsan aca y no en cada consulta: es el mismo
   * criterio del Principio I. Nulo si no hay ninguno vigente, y una habilitacion
   * no vigente equivale a inexistente (FR-004).
   */
  accesoVigente(usuarioId: string, consorcioId: string, fecha: Date): Promise<AccesoVigente | null>

  /** Super administrador de la plataforma: da de alta administradoras y consorcios. */
  esSuperAdministrador(usuarioId: string, fecha: Date): Promise<boolean>

  /** Administradoras sobre las que el usuario tiene habilitacion de empresa vigente. */
  administradorasDe(usuarioId: string, fecha: Date): Promise<string[]>

  /** Consorcios alcanzables, por cualquiera de los tres niveles. */
  consorciosDe(usuarioId: string, fecha: Date): Promise<string[]>
}
