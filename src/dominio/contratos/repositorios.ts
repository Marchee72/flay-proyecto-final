import type { Rol } from '@/dominio/identidad/rol'

/**
 * Puertos de persistencia. Devuelven y aceptan tipos del dominio, nunca filas
 * del mapeador, y nunca el tipo numerico nativo para dinero o coeficientes
 * (FR-013).
 */

export interface HabilitacionVigente {
  usuarioId: string
  consorcioId: string
  rol: Rol
}

export interface RepositorioHabilitaciones {
  /**
   * Habilitacion de cartera vigente: el cuarto rol, el que da de alta
   * consorcios. No lleva consorcio porque, al crear el primero, todavia no hay
   * ninguno contra el cual autorizar.
   */
  esAdministradorDeCartera(usuarioId: string, fecha: Date): Promise<boolean>
  /** Habilitacion vigente a la fecha dada, o nula. Vigencia vencida = inexistente (FR-004). */
  vigente(usuarioId: string, consorcioId: string, fecha: Date): Promise<HabilitacionVigente | null>
  /** Consorcios sobre los que el usuario tiene habilitacion vigente. */
  consorciosDe(usuarioId: string, fecha: Date): Promise<string[]>
}
