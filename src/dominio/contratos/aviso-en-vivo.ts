export type PermisoDeEscucha = { canal: string; token: string }

/**
 * El aviso de que una asamblea cambió. No lleva datos: cada pantalla relee la
 * sala con sus propios permisos, así que el canal no expone nada (RN-12).
 */
export interface AvisoEnVivo {
  publicar(asambleaId: string): Promise<void>
  /** `null`: no hay servicio configurado. */
  permisoDeEscucha(asambleaId: string): Promise<PermisoDeEscucha | null>
}
