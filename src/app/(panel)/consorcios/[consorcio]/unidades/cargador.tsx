'use client'

import { useActionState, useState } from 'react'
import { Trash2, TriangleAlert, Undo2 } from 'lucide-react'

import { importe } from '@/compartido/dinero'
import { ajustePorRedondeo, decimalesDelPadron, filasDesdePegado } from '@/compartido/padron'

import { accionCargarPadron, accionEditarPadron } from '../../acciones'
import { GeneradorDePadron } from '../../generador-padron'
import { TablaDesplazable } from '../../../tabla-desplazable'

const SIN_ERROR = { mensaje: '' }

const OBJETIVO = '100.00000000'

/** Con `id`, una unidad que ya existe; `baja` solo tiene sentido para esas. */
export type Fila = {
  id?: string
  designacion: string
  coeficiente: string
  tipo: string
  baja?: boolean
}

const POR_OMISION = 'departamento'

const VACIA: Fila = { designacion: '', coeficiente: '', tipo: POR_OMISION }

/**
 * Carga del padron con la **suma corriente a la vista** (contrato de
 * consorcios): el rechazo del final no puede ser una sorpresa despues de
 * cargar noventa y seis unidades.
 *
 * Con `inicial` es la edicion del padron ya cargado (FR-011): las mismas
 * filas, mas agregar y dar de baja, y todo se guarda junto. Ahi no hay
 * generador: regenerar pisaria las unidades que ya tienen historia.
 *
 * La suma se hace con aritmetica decimal, tambien en el navegador. Con el tipo
 * numerico nativo, `0.1 + 0.2` ya no da `0.3`: la pantalla diria que cierra
 * cuando no cierra (Principio II).
 */
export function CargadorDePadron({
  consorcioId,
  tipos,
  inicial,
}: {
  consorcioId: string
  tipos: readonly { valor: string; etiqueta: string }[]
  inicial?: Fila[]
}) {
  const edicion = inicial !== undefined
  const [estado, accion, enviando] = useActionState(
    edicion ? accionEditarPadron : accionCargarPadron,
    SIN_ERROR,
  )
  const [filas, setFilas] = useState<Fila[]>(inicial ?? [{ ...VACIA }])

  const cargadas = filas.filter((fila) => fila.designacion.trim() !== '' && !fila.baja)
  const suma = cargadas.reduce(
    (total, fila) => total.plus(importe(esDecimal(fila.coeficiente) ? fila.coeficiente : '0')),
    importe('0'),
  )
  const diferencia = suma.minus(importe(OBJETIVO))
  const cuadra = diferencia.isZero()
  const decimales = decimalesDelPadron(cargadas.map((fila) => fila.coeficiente))
  // La dada de baja cuenta como cero, sin correr los indices de las demas.
  const ajuste = ajustePorRedondeo(
    filas.map((fila) => (fila.baja ? { ...fila, coeficiente: '0' } : fila)),
    importe(OBJETIVO),
  )

  const cambiar = (indice: number, campo: 'designacion' | 'coeficiente' | 'tipo', valor: string) =>
    setFilas(filas.map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)))

  /**
   * Quitar una fila nueva (solo presentación: vive en el estado del formulario
   * hasta confirmar) o marcar para dar de baja una que ya existe, que se puede
   * deshacer. Si no queda ninguna, una vacía para seguir cargando. Táctil:
   * `.boton` ya cumple `--toque` (RNF-01).
   */
  const quitar = (indice: number) => {
    if (filas[indice].id) {
      setFilas(filas.map((fila, i) => (i === indice ? { ...fila, baja: !fila.baja } : fila)))
      return
    }
    const restantes = filas.filter((_, i) => i !== indice)
    setFilas(restantes.length > 0 ? restantes : [{ ...VACIA }])
  }

  /**
   * Pegar desde una planilla es como llega un padron de verdad: el del
   * reglamento son noventa y seis renglones, y transcribirlos a mano es donde
   * se cuelan los errores que despues rechaza el disparador.
   */
  const pegar = (indice: number, evento: React.ClipboardEvent) => {
    if (filas[indice].id) return // sobre una unidad existente, pegar es pegar
    const pegadas = filasDesdePegado(
      evento.clipboardData.getData('text'),
      tipos.map((tipo) => tipo.valor),
    )
    if (pegadas.length < 2) return // una sola celda: es un pegado normal

    evento.preventDefault()
    const antes = filas.slice(0, indice)
    const despues = filas.slice(indice + 1).filter((fila) => fila.designacion.trim() !== '')
    setFilas([...antes, ...pegadas.map(conTipo), ...despues])
  }

  const aplicarAjuste = () => {
    if (!ajuste) return
    cambiar(ajuste.indice, 'coeficiente', ajuste.nuevo)
  }

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />

      {edicion ? (
        <p className="ayuda">
          Los cambios rigen desde hoy y quedan en la historia de coeficientes. Una unidad con
          ocupantes, deuda o reservas por delante no se puede dar de baja.
        </p>
      ) : (
        <>
          <p className="ayuda">
            Pegar el padrón desde una planilla en la primera casilla —designación y coeficiente— y
            las filas se completan solas.
          </p>
          <GeneradorDePadron
            prefijo=""
            leyenda="O generalo, si el edificio es parejo"
            alGenerar={(generadas) => setFilas(generadas.map(conTipo))}
          />
        </>
      )}

      <TablaDesplazable paginar={false}>
        <table>
          <caption className="ayuda">{edicion ? 'Padrón a guardar' : 'Unidades a cargar'}</caption>
          <thead>
            <tr>
              <th scope="col">Designación</th>
              <th scope="col">Tipo</th>
              <th scope="col" className="numero">
                Coeficiente %
              </th>
              <th scope="col">{edicion ? 'Baja' : 'Quitar'}</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, indice) => (
              <tr key={fila.id ?? `nueva-${indice}`} className={fila.baja ? 'apagado' : undefined}>
                <td>
                  <input type="hidden" name="id" value={fila.id ?? ''} />
                  <input type="hidden" name="baja" value={fila.baja ? '1' : ''} />
                  <label className="oculto" htmlFor={`designacion-${indice}`}>
                    Designación de la unidad {indice + 1}
                  </label>
                  <input
                    id={`designacion-${indice}`}
                    name="designacion"
                    value={fila.designacion}
                    readOnly={fila.baja}
                    onChange={(evento) => cambiar(indice, 'designacion', evento.target.value)}
                    onPaste={(evento) => pegar(indice, evento)}
                  />
                </td>
                <td>
                  <label className="oculto" htmlFor={`tipo-${indice}`}>
                    Tipo de la unidad {indice + 1}
                  </label>
                  <select
                    id={`tipo-${indice}`}
                    name="tipo"
                    value={fila.tipo}
                    onChange={(evento) => cambiar(indice, 'tipo', evento.target.value)}
                  >
                    {tipos.map((tipo) => (
                      <option key={tipo.valor} value={tipo.valor}>
                        {tipo.etiqueta}
                      </option>
                    ))}
                  </select>
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
                    value={fila.baja ? '0' : fila.coeficiente}
                    readOnly={fila.baja}
                    onChange={(evento) => cambiar(indice, 'coeficiente', evento.target.value)}
                  />
                </td>
                <td>
                  <button
                    className="boton boton--fantasma boton--icono"
                    type="button"
                    onClick={() => quitar(indice)}
                    aria-pressed={fila.id ? fila.baja === true : undefined}
                    aria-label={`${fila.id ? (fila.baja ? 'Deshacer la baja de' : 'Dar de baja') : 'Quitar'} la unidad ${indice + 1}${fila.designacion.trim() ? ` (${fila.designacion.trim()})` : ''}`}
                  >
                    {fila.baja ? (
                      <Undo2 className="icono" aria-hidden="true" />
                    ) : (
                      <Trash2 className="icono" aria-hidden="true" />
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Suma corriente</td>
              <td className="numero cifra">{suma.toFixed(decimales)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </TablaDesplazable>

      <p aria-live="polite" className={cuadra ? 'aviso aviso--atencion' : 'ayuda'}>
        {cuadra && <TriangleAlert className="icono" aria-hidden="true" />}
        <span>
          {cuadra
            ? `Cierra exacto en ${importe(OBJETIVO).toFixed(decimales)} %.`
            : `${diferencia.isNegative() ? 'Falta' : 'Sobra'} ${diferencia.abs().toFixed(decimales)} % para llegar a 100.`}
        </span>
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
          {edicion ? 'Agregar unidad' : 'Agregar fila'}
        </button>

        <button className="boton boton--primario" type="submit" disabled={enviando}>
          {enviando
            ? edicion
              ? 'Guardando…'
              : 'Cargando…'
            : edicion
              ? 'Guardar cambios'
              : `Cargar ${cargadas.length} unidades`}
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

/** El vocabulario de tipos lo pone la aplicacion; lo pegado que no coincida
 *  cae en departamento, que es lo que casi toda unidad es. */
const conTipo = (fila: { designacion: string; coeficiente: string; tipo?: string }): Fila => ({
  designacion: fila.designacion,
  coeficiente: fila.coeficiente,
  tipo: fila.tipo?.toLowerCase() ?? POR_OMISION,
})

/** Lo que todavia no es un decimal valido cuenta como cero mientras se tipea. */
const esDecimal = (valor: string) => /^\d+(\.\d{1,8})?$/.test(valor.trim())
