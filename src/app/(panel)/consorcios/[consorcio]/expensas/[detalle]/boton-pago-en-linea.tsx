'use client'

import { useState } from 'react'
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react'

import { importeParaMostrar } from '@/compartido/formato'
import { accionPagarExpensaEnLinea } from './acciones'

export function BotonPagoEnLinea({
  consorcioId,
  detalleId,
  saldoExigible,
}: {
  consorcioId: string
  detalleId: string
  saldoExigible: string
}) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const manejarPago = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setEnviando(true)

    // Abre la pestaña en blanco inmediatamente dentro del evento de usuario para que el navegador no bloquee el popup
    const nuevaPestana = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null

    const formData = new FormData()
    formData.append('consorcio', consorcioId)
    formData.append('detalle', detalleId)

    try {
      const resultado = await accionPagarExpensaEnLinea({ mensaje: '' }, formData)
      if (resultado.urlPago && nuevaPestana) {
        nuevaPestana.location.href = resultado.urlPago
      } else {
        nuevaPestana?.close()
        if (resultado.mensaje) {
          setError(resultado.mensaje)
        }
      }
    } catch {
      nuevaPestana?.close()
      setError('Ocurrió un error inesperado al conectar con Mercado Pago.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={manejarPago} className="pago-en-linea-form">
      <button
        type="submit"
        className="boton boton--primario"
        disabled={enviando}
        aria-describedby={error ? 'error-pago-en-linea' : 'ayuda-pago-en-linea'}
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
        Pago seguro a través de Mercado Pago (Checkout Pro) · se abre en una nueva pestaña.
      </p>

      {error && (
        <p id="error-pago-en-linea" className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
