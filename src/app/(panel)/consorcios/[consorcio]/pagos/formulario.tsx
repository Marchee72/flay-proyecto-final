'use client'

import { useActionState, useState } from 'react'

import { Decimal } from '@/compartido/dinero'
import { importeParaMostrar } from '@/compartido/formato'

import { accionRegistrarPago, type Resultado } from './acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

export function FormularioPago({
  consorcioId,
  unidades,
  medios,
  hoy,
  saldos,
  unidadInicial,
  vuelta,
}: {
  consorcioId: string
  unidades: readonly { id: string; designacion: string }[]
  medios: readonly { valor: string; etiqueta: string }[]
  hoy: string
  /** Lo que debe cada unidad (`unidadId` → importe como cadena); sin el mapa no hay ayuda. */
  saldos?: Record<string, { exigible: string; bloqueado: boolean }>
  /** Desde la expensa, la unidad ya elegida. */
  unidadInicial?: string
  /** Adonde volver con exito; la accion lo valida dentro del consorcio. */
  vuelta?: string
}) {
  const [estado, accion, enviando] = useActionState(accionRegistrarPago, SIN_ERROR)
  const hayError = estado.mensaje !== ''
  const [unidadElegida, setUnidadElegida] = useState(
    estado.valores?.unidad ?? unidadInicial ?? unidades[0]?.id ?? '',
  )
  const cuenta = saldos?.[unidadElegida]

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      {vuelta && <input type="hidden" name="vuelta" value={vuelta} />}

      <div className="campo">
        <label htmlFor="unidad">Unidad</label>
        <select
          key={estado.valores?.unidad ?? 'inicial'}
          id="unidad"
          name="unidad"
          defaultValue={estado.valores?.unidad ?? unidadInicial}
          onChange={(evento) => setUnidadElegida(evento.target.value)}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={
            [hayError && 'error-pago', cuenta && 'ayuda-deuda'].filter(Boolean).join(' ') ||
            undefined
          }
        >
          {unidades.map((unidad) => (
            <option key={unidad.id} value={unidad.id}>
              {unidad.designacion}
            </option>
          ))}
        </select>
        {cuenta && (
          <p className="ayuda cifra" id="ayuda-deuda">
            {cuenta.bloqueado
              ? 'Pago bloqueado: se paga con la próxima liquidación.'
              : new Decimal(cuenta.exigible).greaterThan(0)
                ? `Debe hoy: ${importeParaMostrar(cuenta.exigible)}`
                : 'Sin deuda'}
          </p>
        )}
      </div>

      <div className="campo">
        <label htmlFor="importe">Importe</label>
        <input
          id="importe"
          name="importe"
          className="cifra"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={estado.valores?.importe}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-pago ayuda-importe' : 'ayuda-importe'}
        />
        <p className="ayuda" id="ayuda-importe">
          Con coma o punto decimal y hasta dos decimales. Se imputa a lo más viejo primero; lo que
          sobre queda a favor de la unidad.
        </p>
      </div>

      <div className="campo">
        <label htmlFor="fecha">Fecha del pago</label>
        <input
          id="fecha"
          name="fecha"
          type="date"
          defaultValue={estado.valores?.fecha ?? hoy}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-pago' : undefined}
        />
      </div>

      <div className="campo">
        <label htmlFor="medio">Medio</label>
        <select
          key={estado.valores?.medio ?? 'inicial'}
          id="medio"
          name="medio"
          defaultValue={estado.valores?.medio ?? 'transferencia'}
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-pago' : undefined}
        >
          {medios.map((medio) => (
            <option key={medio.valor} value={medio.valor}>
              {medio.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="referencia">Referencia</label>
        <input
          id="referencia"
          name="referencia"
          placeholder="Número de operación"
          defaultValue={estado.valores?.referencia}
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-pago' : undefined}
        />
      </div>

      {hayError && (
        <p className="error" id="error-pago" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Registrando…' : 'Registrar'}
      </button>
    </form>
  )
}
