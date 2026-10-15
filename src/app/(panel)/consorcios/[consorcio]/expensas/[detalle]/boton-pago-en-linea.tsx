'use client'

import { useActionState } from 'react'
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react'

import { importeParaMostrar } from '@/compartido/formato'
import { accionPagarExpensaEnLinea, type ResultadoInicioPago } from './acciones'

const SIN_ERROR: ResultadoInicioPago = { mensaje: '' }

export function BotonPagoEnLinea({
  consorcioId,
  detalleId,
  saldoExigible,
}: {
  consorcioId: string
  detalleId: string
  saldoExigible: string
}) {
  const [estado, accion, enviando] = useActionState(accionPagarExpensaEnLinea, SIN_ERROR)
  const hayError = estado.mensaje !== ''

  return (
    <form action={accion} className="pago-en-linea-form">
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name="detalle" value={detalleId} />

      <button
        type="submit"
        className="boton boton--primario"
        disabled={enviando}
        aria-describedby={hayError ? 'error-pago-en-linea' : 'ayuda-pago-en-linea'}
      >
        {enviando ? (
          <>
            <Loader2 className="icono icono--girando" aria-hidden="true" />
            <span>Conectando con la pasarela…</span>
          </>
        ) : (
          <>
            <CreditCard className="icono" aria-hidden="true" />
            <span>Pagar {importeParaMostrar(saldoExigible)} en línea</span>
            <ExternalLink className="icono" aria-hidden="true" />
          </>
        )}
      </button>

      <p id="ayuda-pago-en-linea" className="ayuda apagado">
        Pago seguro a través de Mercado Pago (Checkout Pro).
      </p>

      {hayError && (
        <p id="error-pago-en-linea" className="error" role="alert">
          {estado.mensaje}
        </p>
      )}
    </form>
  )
}
