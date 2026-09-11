'use client'

import { BotonModal } from '../modal'
import { FormularioPago } from './nuevo/formulario'

/**
 * Alta de pago en modal (guia §3.4, patron «Modal»). Reutiliza el formulario
 * y la Server Action existentes: el exito redirige a `/pagos` con
 * `?registrado=1`, donde ya hay un `role="status"` que lo confirma.
 */
export function ModalPago({
  consorcioId,
  unidades,
  medios,
  hoy,
  etiqueta = 'Registrar un pago',
}: {
  consorcioId: string
  unidades: readonly { id: string; designacion: string }[]
  medios: readonly { valor: string; etiqueta: string }[]
  hoy: string
  etiqueta?: string
}) {
  return (
    <BotonModal etiqueta={etiqueta} titulo="Registrar un pago">
      <FormularioPago consorcioId={consorcioId} unidades={unidades} medios={medios} hoy={hoy} />
    </BotonModal>
  )
}
