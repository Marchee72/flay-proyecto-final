'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Trash2, TriangleAlert } from 'lucide-react'

import { importe } from '@/compartido/dinero'
import {
  ajustePorRedondeo,
  decimalesDelPadron,
  filasDesdePegado,
  padronPorPisos,
} from '@/compartido/padron'

import { accionAltaConsorcioConPadron } from '../acciones'

const SIN_ERROR = { mensaje: '' }

const OBJETIVO = '100.00000000'

const POR_OMISION = 'departamento'

type Fila = { designacion: string; coeficiente: string; tipo: string }

const VACIA: Fila = { designacion: '', coeficiente: '', tipo: POR_OMISION }

const PASOS = ['Datos', 'Padrón', 'Revisión']

/**
 * Asistente «Nuevo consorcio» en modal (guia §3.4, patron «Modal»).
 *
 * Paso 1: los mismos campos y nombres que `nuevo/formulario.tsx`, asi las
 * validaciones del caso de uso responden igual. Paso 2: el mismo editor del
 * cargador del padron —pegado desde planilla, generador por pisos y suma
 * corriente en vivo con aritmetica decimal— con los mismos nombres de campo.
 * Paso 3: resumen y Confirmar, que crea consorcio + padron con el caso de uso
 * existente en la misma transaccion (FR-011c).
 *
 * No se avanza de paso con errores (RNF-10): cada bloqueo dice que falta, en
 * que magnitud y como seguir, y el foco va al primer error.
 */
export function WizardConsorcio({
  administradoras,
  tipos,
}: {
  administradoras: readonly { id: string; razonSocial: string }[]
  tipos: readonly { valor: string; etiqueta: string }[]
}) {
  const [estado, accion, enviando] = useActionState(accionAltaConsorcioConPadron, SIN_ERROR)
  const [paso, setPaso] = useState(0)
  const [errorPaso, setErrorPaso] = useState('')

  const [administradora, setAdministradora] = useState(administradoras[0]?.id ?? '')
  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [localidad, setLocalidad] = useState('')
  const [cuit, setCuit] = useState('')

  const [filas, setFilas] = useState<Fila[]>([{ ...VACIA }])
  const [pisos, setPisos] = useState('')
  const [porPiso, setPorPiso] = useState('')

  const tituloPasoRef = useRef<HTMLHeadingElement | null>(null)
  const errorPasoRef = useRef<HTMLParagraphElement | null>(null)
  const errorServidorRef = useRef<HTMLParagraphElement | null>(null)

  useEffect(() => {
    tituloPasoRef.current?.focus()
  }, [paso])

  useEffect(() => {
    if (errorPaso !== '') errorPasoRef.current?.focus()
  }, [errorPaso])

  useEffect(() => {
    if (estado.mensaje !== '') errorServidorRef.current?.focus()
  }, [estado.mensaje])

  const cargadas = filas.filter((fila) => fila.designacion.trim() !== '')
  const suma = cargadas.reduce(
    (total, fila) => total.plus(importe(esDecimal(fila.coeficiente) ? fila.coeficiente : '0')),
    importe('0'),
  )
  const diferencia = suma.minus(importe(OBJETIVO))
  const cuadra = diferencia.isZero()
  const decimales = decimalesDelPadron(cargadas.map((fila) => fila.coeficiente))
  const ajuste = ajustePorRedondeo(filas, importe(OBJETIVO))

  const cambiar = (indice: number, campo: keyof Fila, valor: string) => {
    setFilas(filas.map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)))
    setErrorPaso('')
  }

  const quitar = (indice: number) => {
    const restantes = filas.filter((_, i) => i !== indice)
    setFilas(restantes.length > 0 ? restantes : [{ ...VACIA }])
  }

  const pegar = (indice: number, evento: React.ClipboardEvent) => {
    const pegadas = filasDesdePegado(
      evento.clipboardData.getData('text'),
      tipos.map((tipo) => tipo.valor),
    )
    if (pegadas.length < 2) return

    evento.preventDefault()
    const antes = filas.slice(0, indice)
    const despues = filas.slice(indice + 1).filter((fila) => fila.designacion.trim() !== '')
    setFilas([...antes, ...pegadas.map(conTipo), ...despues])
  }

  const aplicarAjuste = () => {
    if (!ajuste) return
    cambiar(ajuste.indice, 'coeficiente', ajuste.nuevo)
  }

  const generar = () => {
    const generadas = padronPorPisos(Number(pisos), Number(porPiso), importe(OBJETIVO))
    if (generadas.length > 0) setFilas(generadas.map(conTipo))
  }

  const continuarDesdeDatos = () => {
    const faltantes = [
      ['Administradora', administradora.trim()],
      ['Nombre', nombre.trim()],
      ['Dirección', direccion.trim()],
      ['Localidad', localidad.trim()],
      ['CUIT', cuit.trim()],
    ].filter(([, valor]) => valor === '')

    if (faltantes.length > 0) {
      setErrorPaso(
        `Falta completar ${faltantes.map(([campo]) => campo).join(', ')}. Completar esos campos para pasar al padrón.`,
      )
      return
    }

    setErrorPaso('')
    setPaso(1)
  }

  const continuarDesdePadron = () => {
    if (cargadas.length === 0) {
      setErrorPaso(
        'El padrón está vacío. Cargar al menos una unidad con su coeficiente para revisar el alta.',
      )
      return
    }

    if (!cuadra) {
      setErrorPaso(
        `${diferencia.isNegative() ? 'Falta' : 'Sobra'} ${diferencia.abs().toFixed(decimales)} % para llegar a 100. Ajustar los coeficientes: el alta se rechaza si la suma no cierra exacto.`,
      )
      return
    }

    setErrorPaso('')
    setPaso(2)
  }

  return (
    <form action={accion} noValidate>
      <ol className="modal__pasos" aria-label="Pasos del alta">
        {PASOS.map((etiqueta, indice) => (
          <li key={etiqueta} aria-current={indice === paso ? 'step' : undefined}>
            {etiqueta}
          </li>
        ))}
      </ol>

      <div hidden={paso !== 0}>
        <h3 ref={paso === 0 ? tituloPasoRef : undefined} tabIndex={-1}>
          Paso 1 de 3 · Datos del consorcio
        </h3>

        <div className="campo">
          <label htmlFor="asistente-administradora">Administradora</label>
          <select
            id="asistente-administradora"
            name="administradora"
            required
            value={administradora}
            onChange={(evento) => setAdministradora(evento.target.value)}
          >
            {administradoras.map((candidata) => (
              <option key={candidata.id} value={candidata.id}>
                {candidata.razonSocial}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="asistente-nombre">Nombre</label>
          <input
            id="asistente-nombre"
            name="nombre"
            required
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
            aria-invalid={errorPaso !== '' || undefined}
            aria-describedby={errorPaso !== '' ? 'error-asistente-paso' : undefined}
          />
        </div>

        <div className="campo">
          <label htmlFor="asistente-direccion">Dirección</label>
          <input
            id="asistente-direccion"
            name="direccion"
            required
            value={direccion}
            onChange={(evento) => setDireccion(evento.target.value)}
          />
        </div>

        <div className="campo">
          <label htmlFor="asistente-localidad">Localidad</label>
          <input
            id="asistente-localidad"
            name="localidad"
            required
            value={localidad}
            onChange={(evento) => setLocalidad(evento.target.value)}
          />
        </div>

        <div className="campo">
          <label htmlFor="asistente-cuit">CUIT</label>
          <input
            id="asistente-cuit"
            name="cuit"
            required
            inputMode="numeric"
            value={cuit}
            onChange={(evento) => setCuit(evento.target.value)}
          />
        </div>

        {paso === 0 && errorPaso !== '' && (
          <p
            className="error"
            id="error-asistente-paso"
            role="alert"
            ref={errorPasoRef}
            tabIndex={-1}
          >
            {errorPaso}
          </p>
        )}

        <p className="fila-acciones">
          <button className="boton boton--primario" type="button" onClick={continuarDesdeDatos}>
            Continuar al padrón
          </button>
        </p>
      </div>

      <div hidden={paso !== 1}>
        <h3 ref={paso === 1 ? tituloPasoRef : undefined} tabIndex={-1}>
          Paso 2 de 3 · Padrón de unidades
        </h3>

        <p className="ayuda">
          Pegar el padrón desde una planilla en la primera casilla —designación y coeficiente— y las
          filas se completan solas.
        </p>

        <fieldset className="fila-de-filtros">
          <legend className="ayuda">O generarlo, si el edificio es parejo</legend>

          <div className="campo">
            <label htmlFor="asistente-pisos">Pisos</label>
            <input
              id="asistente-pisos"
              className="cifra"
              inputMode="numeric"
              value={pisos}
              onChange={(evento) => setPisos(evento.target.value.replace(/\D/g, ''))}
            />
          </div>

          <div className="campo">
            <label htmlFor="asistente-por-piso">Unidades por piso</label>
            <input
              id="asistente-por-piso"
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
                <th scope="col">Tipo</th>
                <th scope="col" className="numero">
                  Coeficiente %
                </th>
                <th scope="col">Quitar</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, indice) => (
                <tr key={indice}>
                  <td>
                    <label className="oculto" htmlFor={`asistente-designacion-${indice}`}>
                      Designación de la unidad {indice + 1}
                    </label>
                    <input
                      id={`asistente-designacion-${indice}`}
                      name="designacion"
                      value={fila.designacion}
                      onChange={(evento) => cambiar(indice, 'designacion', evento.target.value)}
                      onPaste={(evento) => pegar(indice, evento)}
                    />
                  </td>
                  <td>
                    <label className="oculto" htmlFor={`asistente-tipo-${indice}`}>
                      Tipo de la unidad {indice + 1}
                    </label>
                    <select
                      id={`asistente-tipo-${indice}`}
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
                    <label className="oculto" htmlFor={`asistente-coeficiente-${indice}`}>
                      Coeficiente de la unidad {indice + 1}
                    </label>
                    <input
                      id={`asistente-coeficiente-${indice}`}
                      name="coeficiente"
                      className="cifra"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={fila.coeficiente}
                      onChange={(evento) => cambiar(indice, 'coeficiente', evento.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      className="boton boton--fantasma boton--icono"
                      type="button"
                      onClick={() => quitar(indice)}
                      aria-label={`Quitar la unidad ${indice + 1}${fila.designacion.trim() ? ` (${fila.designacion.trim()})` : ''}`}
                    >
                      <Trash2 className="icono" aria-hidden="true" />
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
        </div>

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
            diferencia sólo se ofrece cuando cabe en el redondeo.
          </p>
        )}

        {paso === 1 && errorPaso !== '' && (
          <p
            className="error"
            id="error-asistente-paso"
            role="alert"
            ref={errorPasoRef}
            tabIndex={-1}
          >
            {errorPaso}
          </p>
        )}

        <p className="fila-acciones">
          <button
            className="boton boton--fantasma"
            type="button"
            onClick={() => {
              setErrorPaso('')
              setPaso(0)
            }}
          >
            Volver a los datos
          </button>
          <button
            className="boton boton--fantasma"
            type="button"
            onClick={() => setFilas([...filas, { ...VACIA }])}
          >
            Agregar fila
          </button>
          <button className="boton boton--primario" type="button" onClick={continuarDesdePadron}>
            Revisar el alta
          </button>
        </p>
      </div>

      <div hidden={paso !== 2}>
        <h3 ref={paso === 2 ? tituloPasoRef : undefined} tabIndex={-1}>
          Paso 3 de 3 · Revisión y confirmación
        </h3>

        <div className="resumen">
          <div className="resumen__item">
            <p className="resumen__rotulo">Consorcio</p>
            <p className="resumen__valor">{nombre.trim() || '—'}</p>
          </div>
          <div className="resumen__item">
            <p className="resumen__rotulo">Dirección</p>
            <p className="resumen__valor">{direccion.trim() || '—'}</p>
          </div>
          <div className="resumen__item">
            <p className="resumen__rotulo">Unidades</p>
            <p className="resumen__valor">{cargadas.length}</p>
          </div>
          <div className="resumen__item">
            <p className="resumen__rotulo">Suma de coeficientes</p>
            <p className="resumen__valor cifra">{suma.toFixed(decimales)} %</p>
          </div>
        </div>

        <p className="ayuda">
          Al confirmar se crea el consorcio con su padrón en una sola operación. Si la suma no
          cierra o el CUIT ya existe, el alta se rechaza y se dice por qué.
        </p>

        {estado.mensaje !== '' && (
          <p className="error" role="alert" ref={errorServidorRef} tabIndex={-1}>
            {estado.mensaje}
          </p>
        )}

        <p className="fila-acciones">
          <button
            className="boton boton--fantasma"
            type="button"
            onClick={() => {
              setPaso(1)
            }}
          >
            Volver al padrón
          </button>
          <button className="boton boton--primario" type="submit" disabled={enviando}>
            {enviando ? 'Creando…' : `Confirmar el alta de ${cargadas.length} unidades`}
          </button>
        </p>
      </div>
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
