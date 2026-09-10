'use client'

import { useActionState, useState } from 'react'

import { importe } from '@/compartido/dinero'

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

  const cargadas = filas.filter((fila) => fila.designacion.trim() !== '')
  const suma = cargadas.reduce(
    (total, fila) => total.plus(importe(esDecimal(fila.coeficiente) ? fila.coeficiente : '0')),
    importe('0'),
  )
  const diferencia = suma.minus(importe(OBJETIVO))
  const cuadra = diferencia.isZero()

  const cambiar = (indice: number, campo: keyof Fila, valor: string) =>
    setFilas(filas.map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)))

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />

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
                    placeholder="0.00000000"
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
              <td className="numero cifra">{suma.toFixed(8)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p aria-live="polite" className={cuadra ? 'aviso aviso--atencion' : 'ayuda'}>
        {cuadra
          ? `Cierra exacto en ${OBJETIVO} %.`
          : `${diferencia.isNegative() ? 'Falta' : 'Sobra'} ${diferencia.abs().toFixed(8)} % para llegar a 100.`}
      </p>

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
