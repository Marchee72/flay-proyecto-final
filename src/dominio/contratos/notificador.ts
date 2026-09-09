/**
 * Correo transaccional (FR-006). Toda invocacion pasa antes por
 * TrabajoPendiente: el camino feliz y el de reintento son el mismo, asi el de
 * reintento no se ejercita unicamente cuando el proveedor falla.
 */
export interface Invitacion {
  destino: string
  nombre: string
  consorcio: string
  enlaceDeAlta: string
}

export interface Notificador {
  enviarInvitacion(invitacion: Invitacion): Promise<void>
}
