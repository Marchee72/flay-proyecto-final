import type { TipoTrabajo } from '@prisma/client'
import { z } from 'zod'

import { manejadorDocumentoExpensa } from '@/aplicacion/liquidacion/documentos'
import type { Manejador } from '@/aplicacion/pendientes/drenar'
import { generadorPdf } from '@/infraestructura/documentos/expensa'
import { almacenBlob } from '@/infraestructura/objetos/blob'
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
  // El documento de expensa (`003-liquidacion` FR-016): rendea, guarda y anota
  // la clave. El drenaje oportunista lo toma de a lotes; el disparo explicito
  // del administrador lo agota (research R-02).
  documento_expensa: manejadorDocumentoExpensa(generadorPdf, almacenBlob),
}
