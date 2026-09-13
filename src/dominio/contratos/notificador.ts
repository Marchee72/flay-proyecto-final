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

/** Un aviso de § 12.7 ya redactado: el despachador no sabe de que trata. */
export interface Aviso {
  destino: string
  titulo: string
  cuerpo: string
}

export interface Notificador {
  enviarInvitacion(invitacion: Invitacion): Promise<void>
  enviarNotificacion(aviso: Aviso): Promise<void>
}
