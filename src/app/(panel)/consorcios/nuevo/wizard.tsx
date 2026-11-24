'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Check, CloudUpload, FileText, Pencil, Trash2, TriangleAlert } from 'lucide-react'

import { importe } from '@/compartido/dinero'
import { ajustePorRedondeo, decimalesDelPadron, type FilaDePadron } from '@/compartido/padron'

import { accionAltaConsorcioConPadron, accionRevisarArchivoDeAlta } from '../acciones'
import { GeneradorDePadron } from '../generador-padron'
import { TablaDesplazable } from '../../tabla-desplazable'

const SIN_ERROR = { mensaje: '' }

const OBJETIVO = '100.00000000'

const POR_OMISION = 'departamento'

type Dueno = { nombre: string; apellido: string; dni: string; correo: string; telefono: string }

const SIN_DUENO: Dueno = { nombre: '', apellido: '', dni: '', correo: '', telefono: '' }

type Fila = { designacion: string; coeficiente: string; tipo: string; dueno: Dueno }

const VACIA: Fila = { designacion: '', coeficiente: '', tipo: POR_OMISION, dueno: SIN_DUENO }

const CAMPOS_DUENO: { campo: keyof Dueno; etiqueta: string; modo?: 'numeric' | 'email' | 'tel' }[] =
  [
    { campo: 'nombre', etiqueta: 'Nombre' },
    { campo: 'apellido', etiqueta: 'Apellido' },
    { campo: 'dni', etiqueta: 'DNI', modo: 'numeric' },
    { campo: 'correo', etiqueta: 'Correo', modo: 'email' },
    { campo: 'telefono', etiqueta: 'Teléfono', modo: 'tel' },
  ]

const PASOS = ['Datos', 'Padrón', 'Revisión', 'Confirmar']

// Presentación no importa dominio (§ 12.1.2): copia de MAX_BYTES de `dominio/importacion/planilla`.
const MAX_BYTES = 500 * 1024

/** Lo que el servidor leyó del archivo: las unidades con su dueño, para corregirlas acá. */
type RevisionDelArchivo = {
  unidades: { designacion: string; tipo: string; coeficiente: string; dueno: Dueno | null }[]
}

const nombreDelDueno = (d: Dueno) => `${d.nombre} ${d.apellido}`.trim()

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
  const [nombreArchivo, setNombreArchivo] = useState('')
  const archivoRef = useRef<HTMLInputElement | null>(null)
  const generado = useRef<{ filas: FilaDePadron[]; error: string }>({ filas: [], error: '' })
  const [arrastrando, setArrastrando] = useState(false)
  // Nombre del archivo del que salió el padrón, una vez leído (el padrón pasa a ser las filas).
  const [desdeArchivo, setDesdeArchivo] = useState('')
  const [revisando, setRevisando] = useState(false)
  // Índice (en `filas`) del renglón que se está corrigiendo en el paso de revisión.
  const [editando, setEditando] = useState<number | null>(null)

  const soltarArchivo = (evento: React.DragEvent) => {
    evento.preventDefault()
    setArrastrando(false)
    const soltado = evento.dataTransfer.files[0]
    if (!soltado || !archivoRef.current) return
    const lista = new DataTransfer()
    lista.items.add(soltado)
    archivoRef.current.files = lista.files
    setNombreArchivo(soltado.name)
    setErrorPaso('')
  }

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

  const cambiar = (
    indice: number,
    campo: 'designacion' | 'coeficiente' | 'tipo',
    valor: string,
  ) => {
    setFilas(filas.map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)))
    setErrorPaso('')
  }

  const cambiarDueno = (indice: number, campo: keyof Dueno, valor: string) => {
    setFilas(
      filas.map((fila, i) =>
        i === indice ? { ...fila, dueno: { ...fila.dueno, [campo]: valor } } : fila,
      ),
    )
    setErrorPaso('')
  }

  const quitar = (indice: number) => {
    const restantes = filas.filter((_, i) => i !== indice)
    setFilas(restantes.length > 0 ? restantes : [{ ...VACIA }])
  }

  const aplicarAjuste = () => {
    if (!ajuste) return
    cambiar(ajuste.indice, 'coeficiente', ajuste.nuevo)
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

  const continuarDesdePadron = async () => {
    // Con archivo, el servidor lo lee y valida antes de crear nada (suma, filas, dueños).
    if (nombreArchivo !== '') {
      const archivo = archivoRef.current?.files?.[0]
      if (!archivo) return setErrorPaso('Elegí un archivo .xlsx o .csv.')
      if (archivo.size > MAX_BYTES) return setErrorPaso('El archivo pesa más de 500 KB.')
      setRevisando(true)
      setErrorPaso('')
      const datos = new FormData()
      datos.set('archivo', archivo)
      try {
        const respuesta = await accionRevisarArchivoDeAlta(datos)
        const resultado = respuesta.resultado
        if (resultado?.estado === 'revisado') {
          const leido = resultado as unknown as RevisionDelArchivo
          setFilas(
            leido.unidades.map((u) => ({
              designacion: u.designacion,
              tipo: u.tipo,
              coeficiente: u.coeficiente,
              dueno: u.dueno ?? SIN_DUENO,
            })),
          )
          setDesdeArchivo(archivo.name)
          // El padrón ya son las filas: el archivo no viaja de nuevo al confirmar.
          if (archivoRef.current) archivoRef.current.value = ''
          setNombreArchivo('')
          setEditando(null)
          setPaso(2)
        } else if (resultado?.estado === 'errores') {
          const detalle = resultado.errores
            .slice(0, 5)
            .map((e) => (e.fila !== null ? `Fila ${e.fila}: ${e.mensaje}` : e.mensaje))
            .join(' · ')
          const resto =
            resultado.errores.length > 5 ? ` · y ${resultado.errores.length - 5} más` : ''
          setErrorPaso(
            `El archivo tiene ${resultado.errores.length === 1 ? 'un error' : `${resultado.errores.length} errores`}: no se crea nada hasta corregirlo. ${detalle}${resto}`,
          )
        } else {
          setErrorPaso(respuesta.mensaje || 'No pudimos leer el archivo. Probá de nuevo.')
        }
      } catch {
        setErrorPaso('No pudimos revisar el archivo. Revisá la conexión y probá de nuevo.')
      } finally {
        setRevisando(false)
      }
      return
    }

    // Sin archivo, lo que se tipeó en el generador es el padrón.
    if (generado.current.error !== '') return setErrorPaso(generado.current.error)
    if (generado.current.filas.length > 0) {
      setFilas(generado.current.filas.map(conTipo))
      setEditando(null)
      setErrorPaso('')
      setPaso(2)
      return
    }

    // Sin archivo ni generador, el padrón se carga a mano en la revisión.
    // La suma se exige recién al salir de la revisión: ahí se corrige renglón por renglón.
    setErrorPaso('')
    setPaso(2)
  }

  const continuarDesdeRevision = () => {
    if (cargadas.length === 0) {
      setErrorPaso('El padrón está vacío. Cargar al menos una unidad con su coeficiente.')
      return
    }
    if (!cuadra) {
      setErrorPaso(
        `${diferencia.isNegative() ? 'Falta' : 'Sobra'} ${diferencia.abs().toFixed(decimales)} % para llegar a 100. Corregí los coeficientes: el alta se rechaza si la suma no cierra exacto.`,
      )
      return
    }
    setEditando(null)
    setErrorPaso('')
    setPaso(3)
  }

  // Los pasos son botones solo hacia atrás: adelante se pasa con «Continuar», que
  // valida (RNF-10). Los ya completados llevan su marca.
  const pasosDelAlta = (
    <ol className="modal__pasos" aria-label="Pasos del alta">
      {PASOS.map((etiqueta, indice) => (
        <li
          key={etiqueta}
          aria-current={indice === paso ? 'step' : undefined}
          data-estado={indice < paso ? 'hecho' : indice === paso ? 'actual' : 'pendiente'}
        >
          <button
            type="button"
            className="modal__paso"
            disabled={indice > paso}
            onClick={() => {
              setErrorPaso('')
              setPaso(indice)
            }}
          >
            <span className="modal__paso-n" aria-hidden="true">
              <span className="modal__paso-num">{indice + 1}</span>
              <Check className="icono modal__paso-ok" />
            </span>
            {etiqueta}
            {indice < paso && <span className="oculto"> (completo)</span>}
          </button>
        </li>
      ))}
    </ol>
  )

  return (
    <form action={accion} noValidate>
      {pasosDelAlta}

      <div hidden={paso !== 0}>
        <h3 ref={paso === 0 ? tituloPasoRef : undefined} tabIndex={-1}>
          Paso 1 de 4 · Datos del consorcio
        </h3>

        <div className="campo alta-datos__nombre">
          <label htmlFor="asistente-nombre">Nombre del consorcio</label>
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

        <div className="alta-datos__grupos">
          <div className="alta-datos__grupo">
            <h4>Ubicación</h4>
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
          </div>

          <div className="alta-datos__grupo">
            <h4>Administración</h4>
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
              <label htmlFor="asistente-cuit">CUIT</label>
              <input
                id="asistente-cuit"
                name="cuit"
                required
                inputMode="numeric"
                placeholder="20-12345678-9"
                value={cuit}
                onChange={(evento) => setCuit(evento.target.value)}
              />
            </div>
          </div>
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

        <p className="fila-acciones fila-acciones--pie">
          <button className="boton boton--primario" type="button" onClick={continuarDesdeDatos}>
            Continuar
          </button>
        </p>
      </div>

      <div hidden={paso !== 1}>
        <h3 ref={paso === 1 ? tituloPasoRef : undefined} tabIndex={-1}>
          Paso 2 de 4 · Padrón de unidades
        </h3>

        <div className="alta-padron__lado">
          <div className="alta-padron__col">
            <p className="alta-padron__rotulo">
              <span aria-hidden="true">A</span>Subir un archivo
            </p>
            <label
              htmlFor="asistente-archivo"
              className={`zona-soltar${nombreArchivo !== '' ? ' zona-soltar--lleno' : ''}${arrastrando ? ' zona-soltar--activa' : ''}`}
              onDragOver={(evento) => {
                evento.preventDefault()
                setArrastrando(true)
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={soltarArchivo}
            >
              <input
                id="asistente-archivo"
                name="archivo"
                type="file"
                ref={archivoRef}
                className="oculto"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                aria-describedby="asistente-archivo-ayuda"
                onChange={(evento) => {
                  setNombreArchivo(evento.target.files?.[0]?.name ?? '')
                  setErrorPaso('')
                }}
              />
              {nombreArchivo !== '' ? (
                <>
                  <FileText aria-hidden="true" />
                  <strong className="zona-soltar__nombre">{nombreArchivo}</strong>
                  <span className="ayuda" id="asistente-archivo-ayuda">
                    Listo para revisar. <u>Elegir otro archivo</u>
                  </span>
                  <button
                    className="boton boton--fantasma"
                    type="button"
                    onClick={(evento) => {
                      evento.preventDefault()
                      if (archivoRef.current) archivoRef.current.value = ''
                      setNombreArchivo('')
                    }}
                  >
                    Quitar
                  </button>
                </>
              ) : (
                <>
                  <CloudUpload aria-hidden="true" />
                  {arrastrando ? (
                    <span>Soltá para elegirlo</span>
                  ) : (
                    <span>
                      <span className="solo-escritorio">Arrastrá el padrón acá o </span>
                      <u>elegí un archivo</u>
                    </span>
                  )}
                  <span className="ayuda" id="asistente-archivo-ayuda">
                    Excel (.xlsx) o CSV, hasta 500 KB, con dueños si querés. Todo o nada: con un
                    solo error no se crea el consorcio.
                  </span>
                  <a className="ayuda" href="/api/plantillas/nuevo/padron.xlsx" download>
                    Bajar plantilla
                  </a>
                </>
              )}
            </label>
          </div>

          <div
            className="alta-padron__col alta-padron__gen"
            inert={nombreArchivo !== '' ? true : undefined}
          >
            <p className="alta-padron__rotulo">
              <span aria-hidden="true">B</span>O generarlo, si el edificio es parejo
            </p>
            <GeneradorDePadron
              prefijo="asistente-"
              leyenda="Generar el padrón"
              alCambiar={(generadas, error) => {
                generado.current = { filas: generadas, error }
              }}
            />
          </div>
        </div>

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

        <p className="fila-acciones fila-acciones--pie">
          <button
            className="boton boton--fantasma"
            type="button"
            onClick={() => {
              setErrorPaso('')
              setPaso(0)
            }}
          >
            Volver
          </button>
          <button
            className="boton boton--primario"
            type="button"
            onClick={continuarDesdePadron}
            disabled={revisando}
          >
            {revisando ? 'Leyendo el archivo…' : 'Continuar'}
          </button>
        </p>
      </div>

      <div hidden={paso !== 2}>
        <h3 ref={paso === 2 ? tituloPasoRef : undefined} tabIndex={-1}>
          Paso 3 de 4 · Revisá el padrón
        </h3>

        <p className="ayuda">
          {desdeArchivo !== '' && <>Leído de {desdeArchivo}. </>}Con el lápiz corregís una unidad y
          su dueño. Todo se confirma recién en el paso siguiente.
        </p>

        <TablaDesplazable paginar={false}>
          <table className="alta-revision">
            <caption className="ayuda">Padrón a cargar</caption>
            <thead>
              <tr>
                <th scope="col">Designación</th>
                <th scope="col">Tipo</th>
                <th scope="col" className="numero">
                  Coeficiente %
                </th>
                <th scope="col">Dueño</th>
                <th scope="col">
                  <span className="oculto">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.flatMap((fila, i) => {
                if (fila.designacion.trim() === '' && editando !== i) return []
                if (editando === i) {
                  return [
                    <tr key={i} className="alta-revision__editando">
                      <td colSpan={5}>
                        <div className="alta-revision__form">
                          <div className="alta-revision__linea">
                            <div className="campo">
                              <label htmlFor={`revision-designacion-${i}`}>Designación</label>
                              <input
                                id={`revision-designacion-${i}`}
                                value={fila.designacion}
                                onChange={(evento) =>
                                  cambiar(i, 'designacion', evento.target.value)
                                }
                              />
                            </div>
                            <div className="campo">
                              <label htmlFor={`revision-tipo-${i}`}>Tipo</label>
                              <select
                                id={`revision-tipo-${i}`}
                                value={fila.tipo}
                                onChange={(evento) => cambiar(i, 'tipo', evento.target.value)}
                              >
                                {tipos.map((tipo) => (
                                  <option key={tipo.valor} value={tipo.valor}>
                                    {tipo.etiqueta}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="campo">
                              <label htmlFor={`revision-coeficiente-${i}`}>Coeficiente %</label>
                              <input
                                id={`revision-coeficiente-${i}`}
                                className="cifra"
                                inputMode="decimal"
                                value={fila.coeficiente}
                                onChange={(evento) =>
                                  cambiar(i, 'coeficiente', evento.target.value)
                                }
                              />
                            </div>
                            <div className="alta-revision__botones">
                              <button
                                className="boton boton--fantasma boton--icono"
                                type="button"
                                aria-label={`Quitar la unidad ${fila.designacion || i + 1}`}
                                onClick={() => {
                                  quitar(i)
                                  setEditando(null)
                                }}
                              >
                                <Trash2 className="icono" aria-hidden="true" />
                              </button>
                              <button
                                className="boton boton--primario boton--icono"
                                type="button"
                                aria-label="Listo"
                                title="Listo"
                                onClick={() => setEditando(null)}
                              >
                                <Check className="icono" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                          <fieldset className="alta-revision__dueno">
                            <legend className="alta-revision__dueno-titulo">
                              Dueño de la unidad (opcional; con nombre y apellido)
                            </legend>
                            <div className="alta-revision__dueno-panel">
                              {CAMPOS_DUENO.map(({ campo, etiqueta, modo }) => (
                                <div className="campo" key={campo}>
                                  <label htmlFor={`revision-${campo}-${i}`}>{etiqueta}</label>
                                  <input
                                    id={`revision-${campo}-${i}`}
                                    inputMode={modo}
                                    value={fila.dueno[campo]}
                                    onChange={(evento) =>
                                      cambiarDueno(i, campo, evento.target.value)
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                          </fieldset>
                        </div>
                      </td>
                    </tr>,
                  ]
                }
                return [
                  <tr key={i}>
                    <td>
                      <strong>{fila.designacion}</strong>
                    </td>
                    <td>{tipos.find((t) => t.valor === fila.tipo)?.etiqueta ?? fila.tipo}</td>
                    <td className="numero cifra">{fila.coeficiente || '—'}</td>
                    <td>{nombreDelDueno(fila.dueno) || '—'}</td>
                    <td className="alta-revision__acciones">
                      <button
                        className="boton boton--fantasma boton--icono"
                        type="button"
                        aria-label={`Editar la unidad ${fila.designacion}`}
                        onClick={() => setEditando(i)}
                      >
                        <Pencil className="icono" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>,
                ]
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Suma</td>
                <td className="numero cifra">{suma.toFixed(decimales)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </TablaDesplazable>

        <p className="fila-acciones">
          <button
            className="boton boton--fantasma"
            type="button"
            onClick={() => {
              setEditando(filas.length)
              setFilas([...filas, { ...VACIA }])
            }}
          >
            Agregar unidad
          </button>
        </p>

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
            Es la unidad de mayor coeficiente: pasaría de {ajuste.anterior} a {ajuste.nuevo} %.
          </p>
        )}

        {paso === 2 && errorPaso !== '' && (
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

        <p className="fila-acciones fila-acciones--pie">
          <button
            className="boton boton--fantasma"
            type="button"
            onClick={() => {
              setEditando(null)
              setErrorPaso('')
              setPaso(1)
            }}
          >
            Volver
          </button>
          <button className="boton boton--primario" type="button" onClick={continuarDesdeRevision}>
            Continuar
          </button>
        </p>
      </div>

      <div hidden={paso !== 3}>
        <h3 ref={paso === 3 ? tituloPasoRef : undefined} tabIndex={-1}>
          Paso 4 de 4 · Confirmación
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
          <div className="resumen__item">
            <p className="resumen__rotulo">Dueños cargados</p>
            <p className="resumen__valor">
              {cargadas.filter((fila) => nombreDelDueno(fila.dueno) !== '').length}
            </p>
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

        <p className="fila-acciones fila-acciones--pie">
          <button
            className="boton boton--fantasma"
            type="button"
            onClick={() => {
              setPaso(2)
            }}
          >
            Volver
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
  dueno: SIN_DUENO,
})

/** Lo que todavia no es un decimal valido cuenta como cero mientras se tipea. */
const esDecimal = (valor: string) => /^\d+(\.\d{1,8})?$/.test(valor.trim())
