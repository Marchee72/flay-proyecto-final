'use client'

import { useActionState, useState } from 'react'

import { importe } from '@/compartido/dinero'
import {
  ajustePorRedondeo,
  decimalesDelPadron,
  filasDesdePegado,
  padronPorPisos,
} from '@/compartido/padron'

import { accionCargarPadron } from '../../acciones'

const SIN_ERROR = { mensaje: '' }

const OBJETIVO = '100.00000000'

type Fila = { designacion: string; coeficiente: string }

const VACIA: Fila = { designacion: '', coeficiente: '' }

/**
 * Carga del padron con la **suma corriente a la vista** (contrato de
 * consorcios): el rechazo del final no puede ser una sorpresa despues de
 * cargar noventa y seis unidades.
 *
 * La suma se hace con aritmetica decimal, tambien en el navegador. Con el tipo
 * numerico nativo, `0.1 + 0.2` ya no da `0.3`: la pantalla diria que cierra
 * cuando no cierra (Principio II).
 */
export function CargadorDePadron({ consorcioId }: { consorcioId: string }) {
  const [estado, accion, enviando] = useActionState(accionCargarPadron, SIN_ERROR)
  const [filas, setFilas] = useState<Fila[]>([{ ...VACIA }])
  const [pisos, setPisos] = useState('')
  const [porPiso, setPorPiso] = useState('')

  const cargadas = filas.filter((fila) => fila.designacion.trim() !== '')
  const suma = cargadas.reduce(
    (total, fila) => total.plus(importe(esDecimal(fila.coeficiente) ? fila.coeficiente : '0')),
    importe('0'),
  )
  const diferencia = suma.minus(importe(OBJETIVO))
  const cuadra = diferencia.isZero()
  const decimales = decimalesDelPadron(cargadas.map((fila) => fila.coeficiente))
  const ajuste = ajustePorRedondeo(filas, importe(OBJETIVO))

  const cambiar = (indice: number, campo: keyof Fila, valor: string) =>
    setFilas(filas.map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)))

  /**
   * Pegar desde una planilla es como llega un padron de verdad: el del
   * reglamento son noventa y seis renglones, y transcribirlos a mano es donde
   * se cuelan los errores que despues rechaza el disparador.
   */
  const pegar = (indice: number, evento: React.ClipboardEvent) => {
    const pegadas = filasDesdePegado(evento.clipboardData.getData('text'))
    if (pegadas.length < 2) return // una sola celda: es un pegado normal

    evento.preventDefault()
    const antes = filas.slice(0, indice)
    const despues = filas.slice(indice + 1).filter((fila) => fila.designacion.trim() !== '')
    setFilas([...antes, ...pegadas, ...despues])
  }

  const aplicarAjuste = () => {
    if (!ajuste) return
    cambiar(ajuste.indice, 'coeficiente', ajuste.nuevo)
  }

  const generar = () => {
    const generadas = padronPorPisos(Number(pisos), Number(porPiso), importe(OBJETIVO))
    if (generadas.length > 0) setFilas(generadas)
  }

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />

      <p className="ayuda">
        Pegá el padrón desde una planilla en la primera casilla —designación y coeficiente— y las
        filas se completan solas.
      </p>

      <fieldset className="fila-de-filtros">
        <legend className="ayuda">O generalo, si el edificio es parejo</legend>

        <div className="campo">
          <label htmlFor="pisos">Pisos</label>
          <input
            id="pisos"
            className="cifra"
            inputMode="numeric"
            value={pisos}
            onChange={(evento) => setPisos(evento.target.value.replace(/\D/g, ''))}
          />
        </div>

        <div className="campo">
          <label htmlFor="por-piso">Unidades por piso</label>
          <input
            id="por-piso"
            className="cifra"
            inputMode="numeric"
            value={porPiso}
            onChange={(evento) => setPorPiso(evento.target.value.replace(/\D/g, ''))}
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
      </fieldset>

      <div className="tabla-desplazable">
        <table>
          <caption className="ayuda">Unidades a cargar</caption>
          <thead>
            <tr>
              <th scope="col">Designación</th>
              <th scope="col" className="numero">
                Coeficiente %
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, indice) => (
              <tr key={indice}>
                <td>
                  <label className="oculto" htmlFor={`designacion-${indice}`}>
                    Designación de la unidad {indice + 1}
                  </label>
                  <input
                    id={`designacion-${indice}`}
                    name="designacion"
                    value={fila.designacion}
                    onChange={(evento) => cambiar(indice, 'designacion', evento.target.value)}
                    onPaste={(evento) => pegar(indice, evento)}
                  />
                </td>
                <td className="numero">
                  <label className="oculto" htmlFor={`coeficiente-${indice}`}>
                    Coeficiente de la unidad {indice + 1}
                  </label>
                  <input
                    id={`coeficiente-${indice}`}
                    name="coeficiente"
                    className="cifra"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={fila.coeficiente}
                    onChange={(evento) => cambiar(indice, 'coeficiente', evento.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Suma corriente</td>
              <td className="numero cifra">{suma.toFixed(decimales)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p aria-live="polite" className={cuadra ? 'aviso aviso--atencion' : 'ayuda'}>
        {cuadra
          ? `Cierra exacto en ${importe(OBJETIVO).toFixed(decimales)} %.`
          : `${diferencia.isNegative() ? 'Falta' : 'Sobra'} ${diferencia.abs().toFixed(decimales)} % para llegar a 100.`}
      </p>

      {ajuste && (
        <p className="ayuda">
          <button className="boton boton--fantasma" type="button" onClick={aplicarAjuste}>
            Asignar la diferencia a {ajuste.designacion}
          </button>{' '}
          Es la unidad de mayor coeficiente: pasaría de {ajuste.anterior} a {ajuste.nuevo} %. La
          diferencia sólo se ofrece cuando cabe en el redondeo; si es mayor, el padrón está mal
          transcripto y moverlo sería falsear el reglamento.
        </p>
      )}

      <div className="fila-de-filtros">
        <button
          className="boton boton--fantasma"
          type="button"
          onClick={() => setFilas([...filas, { ...VACIA }])}
        >
          Agregar fila
        </button>

        <button className="boton boton--primario" type="submit" disabled={enviando}>
          {enviando ? 'Cargando…' : `Cargar ${cargadas.length} unidades`}
        </button>
      </div>

      {estado.mensaje && (
        <p className="error" role="alert">
          {estado.mensaje}
        </p>
      )}
    </form>
  )
}

/** Lo que todavia no es un decimal valido cuenta como cero mientras se tipea. */
const esDecimal = (valor: string) => /^\d+(\.\d{1,8})?$/.test(valor.trim())
