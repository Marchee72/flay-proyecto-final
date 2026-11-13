'use client'

import { BotonModal } from '../../../modal'
import { FormularioPago } from './formulario'

/**
 * Alta de pago en modal (guia §3.4, patron «Modal»). Reutiliza el formulario
 * y la Server Action existentes: el exito redirige a `/pagos` —o a `vuelta`,
 * si se abrio desde la expensa— con `conHecho(…, 'pago-registrado')` y lo
 * confirma la pila de avisos.
 */
export function ModalPago({
  consorcioId,
  unidades,
  medios,
  hoy,
  saldos,
  etiqueta = 'Registrar un pago',
  abrir = false,
  unidadInicial,
  vuelta,
}: {
  consorcioId: string
  unidades: readonly { id: string; designacion: string }[]
  medios: readonly { valor: string; etiqueta: string }[]
  hoy: string
  saldos?: Record<string, string>
  etiqueta?: string
  abrir?: boolean
  unidadInicial?: string
  vuelta?: string
}) {
  return (
    <BotonModal etiqueta={etiqueta} titulo="Registrar un pago" abrirAlMontar={abrir}>
      <FormularioPago
        consorcioId={consorcioId}
        unidades={unidades}
        medios={medios}
        hoy={hoy}
        saldos={saldos}
        unidadInicial={unidadInicial}
        vuelta={vuelta}
      />
    </BotonModal>
  )
}
