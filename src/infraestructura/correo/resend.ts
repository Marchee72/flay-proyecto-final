import { Resend } from 'resend'

import type { Aviso, Invitacion, Notificador } from '@/dominio/contratos/notificador'

/**
 * Correo transaccional. El dominio no nombra al proveedor: lo consume por el
 * puerto `Notificador` (FR-019).
 */
const REMITENTE = process.env.CORREO_REMITENTE ?? 'Flay <no-responder@flay.ar>'

async function enviar(destino: string, asunto: string, texto: string): Promise<void> {
  const clave = process.env.RESEND_API_KEY
  if (!clave) throw new Error('Falta RESEND_API_KEY')

  const { error } = await new Resend(clave).emails.send({
    from: REMITENTE,
    to: destino,
    subject: asunto,
    text: texto,
  })

  // El error del proveedor no se traga: lo necesita el reintento para decidir.
  if (error) throw new Error(error.message)
}

export const notificadorResend: Notificador = {
  enviarInvitacion({ destino, nombre, consorcio, enlaceDeAlta }: Invitacion) {
    return enviar(
      destino,
      `Acceso a ${consorcio} en Flay`,
      [
        `Hola ${nombre},`,
        '',
        `Se te dio acceso a ${consorcio} en Flay.`,
        'Para entrar, fija tu contraseña en este enlace:',
        enlaceDeAlta,
        '',
        'El enlace vence en 72 horas. Si no lo pediste, ignora este mensaje.',
      ].join('\n'),
    )
  },

  // Los avisos de § 12.7 (RF-14): el texto ya viene redactado por quien lo creo.
  enviarNotificacion({ destino, titulo, cuerpo }: Aviso) {
    return enviar(destino, `${titulo} — Flay`, cuerpo)
  },
}
