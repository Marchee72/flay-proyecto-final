'use client'

import { UserPlus } from 'lucide-react'

import { BotonModal } from '../../../modal'
import { FormularioInvitar } from './formulario'

/**
 * Invitacion en modal (guia §3.4, patron «Modal»). Reutiliza el formulario y
 * la Server Action existentes: el exito redirige a `/usuarios` con
 * `?invitado=1`, donde ya hay un `role="status"` que lo confirma.
 */
export function ModalInvitar({
  consorcioId,
  roles,
  hoy,
  unidades,
}: {
  consorcioId: string
  roles: readonly { valor: string; etiqueta: string }[]
  hoy: string
  unidades: readonly { id: string; designacion: string }[]
}) {
  return (
    <BotonModal
      etiqueta={
        <>
          <UserPlus className="icono" aria-hidden="true" />
          Invitar persona
        </>
      }
      titulo="Invitar persona"
    >
      <FormularioInvitar consorcioId={consorcioId} roles={roles} hoy={hoy} unidades={unidades} />
    </BotonModal>
  )
}
