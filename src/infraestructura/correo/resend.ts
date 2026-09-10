import { Resend } from 'resend'

import type { Invitacion, Notificador } from '@/dominio/contratos/notificador'

/**
 * Correo transaccional. El dominio no nombra al proveedor: lo consume por el
 * puerto `Notificador` (FR-019).
 */
const REMITENTE = process.env.CORREO_REMITENTE ?? 'Flay <no-responder@flay.ar>'

export const notificadorResend: Notificador = {
  async enviarInvitacion({ destino, nombre, consorcio, enlaceDeAlta }: Invitacion) {
    const clave = process.env.RESEND_API_KEY
    if (!clave) throw new Error('Falta RESEND_API_KEY')

    const { error } = await new Resend(clave).emails.send({
      from: REMITENTE,
      to: destino,
      subject: `Acceso a ${consorcio} en Flay`,
      text: [
        `Hola ${nombre},`,
        '',
        `Se te dio acceso a ${consorcio} en Flay.`,
        'Para entrar, fija tu contraseña en este enlace:',
        enlaceDeAlta,
        '',
        'El enlace vence en 72 horas. Si no lo pediste, ignora este mensaje.',
      ].join('\n'),
    })

    // El error del proveedor no se traga: lo necesita el reintento para decidir.
    if (error) throw new Error(error.message)
  },
}
