'use client'

import { useState } from 'react'

import { importe } from '@/compartido/dinero'
import { type FilaDePadron, padronPorPisos } from '@/compartido/padron'

const OBJETIVO = '100.00000000'

/**
 * El generador de padron parejo, compartido por el asistente de alta y el
 * cargador: pisos por unidades por piso y, aparte, las cocheras con el
 * porcentaje del edificio que se llevan entre todas. Lo generado se puede
 * corregir despues fila por fila.
 */
export function GeneradorDePadron({
  prefijo,
  leyenda,
  alGenerar,
}: {
  prefijo: string
  leyenda: string
  alGenerar: (filas: FilaDePadron[]) => void
}) {
  const [pisos, setPisos] = useState('')
  const [porPiso, setPorPiso] = useState('')
  const [cocheras, setCocheras] = useState('')
  const [porcentaje, setPorcentaje] = useState('')
  const [error, setError] = useState('')

  const hayCocheras = Number(cocheras) > 0
  const soloDigitos = (valor: string) => valor.replace(/\D/g, '')

  const generar = () => {
    const decimal = porcentaje.trim().replace(',', '.')
    const valido = /^\d+(\.\d{1,8})?$/.test(decimal)
    const generadas = padronPorPisos(Number(pisos), Number(porPiso), importe(OBJETIVO), {
      cantidad: hayCocheras ? Number(cocheras) : 0,
      porcentaje: importe(hayCocheras && valido ? decimal : '0'),
    })
    if (generadas.length === 0) {
      setError(
        hayCocheras
          ? 'Indicá qué porcentaje del edificio suman las cocheras: más de 0 y menos de 100, con hasta ocho decimales.'
          : 'Indicá cuántos pisos y cuántas unidades por piso.',
      )
      return
    }
    setError('')
    alGenerar(generadas)
  }

  return (
    <fieldset className="fila-de-filtros">
      <legend className="ayuda">{leyenda}</legend>

      <div className="campo">
        <label htmlFor={`${prefijo}pisos`}>Pisos</label>
        <input
          id={`${prefijo}pisos`}
          className="cifra"
          inputMode="numeric"
          value={pisos}
          onChange={(evento) => setPisos(soloDigitos(evento.target.value))}
        />
      </div>

      <div className="campo">
        <label htmlFor={`${prefijo}por-piso`}>Unidades por piso</label>
        <input
          id={`${prefijo}por-piso`}
          className="cifra"
          inputMode="numeric"
          value={porPiso}
          onChange={(evento) => setPorPiso(soloDigitos(evento.target.value))}
        />
      </div>

      <div className="campo">
        <label htmlFor={`${prefijo}cocheras`}>Cocheras</label>
        <input
          id={`${prefijo}cocheras`}
          className="cifra"
          inputMode="numeric"
          placeholder="0"
          value={cocheras}
          onChange={(evento) => setCocheras(soloDigitos(evento.target.value))}
        />
      </div>

      <div className="campo">
        <label htmlFor={`${prefijo}porcentaje-cocheras`}>% del total para cocheras</label>
        <input
          id={`${prefijo}porcentaje-cocheras`}
          className="cifra"
          inputMode="decimal"
          placeholder="0.00"
          value={porcentaje}
          disabled={!hayCocheras}
          onChange={(evento) => setPorcentaje(evento.target.value)}
          aria-invalid={error !== '' || undefined}
          aria-describedby={`${prefijo}ayuda-cocheras`}
        />
      </div>

      <button
        className="boton boton--fantasma"
        type="button"
        onClick={generar}
        disabled={pisos === '' || porPiso === ''}
      >
        Generar padrón
      </button>

      <p className="ayuda" id={`${prefijo}ayuda-cocheras`}>
        Las cocheras salen como C1, C2… y se reparten parejo ese porcentaje; los departamentos, el
        resto.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}
