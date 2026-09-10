import type { Metadata } from 'next'

import { FormularioInvitacion } from '../../formularios'

export const metadata: Metadata = { title: 'Fijar contraseña — Flay' }

/**
 * El invitado fija su propia contrasena (FR-006). La credencial no se valida al
 * abrir la pantalla: si estuviera vencida y se dijera aca, el enlace serviria
 * para averiguar cuales credenciales son validas.
 */
export default async function InvitacionPage({
  params,
}: {
  params: Promise<{ credencial: string }>
}) {
  const { credencial } = await params

  return (
    <div>
      <span className="marca">FLAY</span>

      <div className="tarjeta">
        <h1>Fijá tu contraseña</h1>
        <p className="apagado">Con ella entrás a Flay de ahora en más.</p>

        <FormularioInvitacion credencial={credencial} />
      </div>
    </div>
  )
}
