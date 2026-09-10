import type { TipoTrabajo } from '@prisma/client'
import { z } from 'zod'

import type { Manejador } from '@/aplicacion/pendientes/drenar'
import { notificadorResend } from '@/infraestructura/correo/resend'

/**
 * Que hace cada tipo de trabajo pendiente. El drenaje no sabe de correo ni de
 * almacenamiento: recibe este mapa (FR-006b). Cada historia agrega el suyo.
 */

// La carga viaja como JSONB: al volver es un `unknown` y hay que abrirla.
const INVITACION = z.object({
  destino: z.string(),
  nombre: z.string(),
  consorcio: z.string(),
  enlaceDeAlta: z.string(),
})

export const MANEJADORES: Partial<Record<TipoTrabajo, Manejador>> = {
  invitacion: async (carga) => notificadorResend.enviarInvitacion(INVITACION.parse(carga)),
}
