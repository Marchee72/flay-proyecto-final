'use client'

import { useActionState, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { accionGuardarAsamblea, type Resultado } from './acciones'

type Modalidad = 'binaria' | 'opcion_multiple'
type Mayoria = 'absoluta' | 'dos_tercios' | 'unanimidad'

export interface PuntoEditable {
  titulo: string
  descripcion: string
  modalidad: Modalidad
  mayoria: Mayoria
  opciones: string[]
}

const PUNTO_VACIO: PuntoEditable = {
  titulo: '',
  descripcion: '',
  modalidad: 'binaria',
  mayoria: 'absoluta',
  opciones: [''],
}

function normalizarOpcionesIniciales(opciones: string[]): string[] {
  const limpias = opciones.map((o) => o.trim()).filter(Boolean)
  return [...limpias, '']
}

/** Fecha y hora actual en Argentina (`YYYY-MM-DDTHH:mm`) para el atributo `min` de `datetime-local`. */
function ahoraEnArgentinaLocal(): string {
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
  return partes.replace(' ', 'T')
}

function validarFechaHoraEnVivo(valor: string): string {
  if (!valor) return ''
  const instante = new Date(`${valor}:00-03:00`).getTime()
  if (Number.isNaN(instante)) return 'Indicá una fecha y hora válidas.'
  if (instante < Date.now() - 60_000) {
    return 'La primera convocatoria no puede ser una fecha u hora hacia atrás.'
  }
  return ''
}

const SIN_RESULTADO: Resultado = { mensaje: '' }

interface ErroresDelPunto {
  titulo?: string
  opciones?: string
}

/** Lo que el caso de uso va a rechazar, dicho al lado del campo y antes de viajar (RNF-10). */
function erroresDelPunto(p: PuntoEditable): ErroresDelPunto {
  const errores: ErroresDelPunto = {}
  if (!p.titulo.trim()) errores.titulo = 'Poné un título al punto.'
  if (p.modalidad === 'opcion_multiple') {
    const opciones = p.opciones.map((o) => o.trim().toLocaleLowerCase('es')).filter(Boolean)
    if (opciones.length < 2) errores.opciones = 'Cargá al menos dos opciones.'
    else if (new Set(opciones).size < opciones.length) errores.opciones = 'Hay opciones repetidas.'
  }
  return errores
}

/**
 * Alta y edición de una asamblea en borrador (RF-29, FR-001 a FR-003). El
 * orden del día se arma acá, punto por punto; viaja como JSON en un campo
 * oculto y la acción lo valida. Convocada, ya no se edita (FR-004).
 */
export function FormularioAsamblea({
  consorcioId,
  asambleaId,
  esConsejo,
  inicial,
}: {
  consorcioId: string
  asambleaId?: string
  /** Solo quien organiza desde el consejo elige si invita a la administración. */
  esConsejo: boolean
  inicial?: {
    tipo: 'ordinaria' | 'extraordinaria'
    titulo: string
    fechaHora: string
    lugar: string
    administracionInvitada: boolean
    puntos: PuntoEditable[]
  }
}) {
  const [estado, accion, enviando] = useActionState(accionGuardarAsamblea, SIN_RESULTADO)
  // Los campos vacíos se marcan recién al intentar guardar, no mientras se completan.
  const [intento, setIntento] = useState(false)
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '')
  const [tipo, setTipo] = useState<'ordinaria' | 'extraordinaria'>(inicial?.tipo ?? 'ordinaria')
  const [fechaHora, setFechaHora] = useState(inicial?.fechaHora ?? '')
  const [minFechaHora] = useState(() => ahoraEnArgentinaLocal())
  const errorFecha = validarFechaHoraEnVivo(fechaHora)
  const [lugar, setLugar] = useState(inicial?.lugar ?? '')
  const [administracionInvitada, setAdministracionInvitada] = useState(
    inicial?.administracionInvitada ?? true,
  )
  const [puntos, setPuntos] = useState<PuntoEditable[]>(() =>
    inicial?.puntos
      ? inicial.puntos.map((p) => ({
          ...p,
          opciones: normalizarOpcionesIniciales(p.opciones),
        }))
      : [{ ...PUNTO_VACIO }],
  )

  const cambiar = (i: number, cambio: Partial<PuntoEditable>) =>
    setPuntos((todos) => todos.map((p, j) => (j === i ? { ...p, ...cambio } : p)))

  const errorTitulo = intento && !titulo.trim() ? 'Poné un título a la asamblea.' : ''
  const errorLugar = intento && !lugar.trim() ? 'Indicá el lugar de la reunión.' : ''
  const errorFechaVisible =
    errorFecha ||
    (intento && !fechaHora ? 'Indicá la fecha y la hora de la primera convocatoria.' : '')
  const errores = puntos.map(erroresDelPunto)

  /** El id del primer campo con problemas, en el orden de la pantalla. */
  const primerError = (): string | undefined => {
    if (!titulo.trim()) return 'titulo'
    if (!fechaHora || errorFecha) return 'fechaHora'
    if (!lugar.trim()) return 'lugar'
    const i = errores.findIndex((e) => e.titulo || e.opciones)
    if (i < 0) return undefined
    return errores[i].titulo ? `punto-titulo-${i}` : `punto-${i}-opciones-coma`
  }

  const serializados = JSON.stringify(
    puntos.map((p) => ({
      titulo: p.titulo,
      descripcion: p.descripcion,
      modalidad: p.modalidad,
      mayoria: p.modalidad === 'binaria' ? p.mayoria : null,
      opciones:
        p.modalidad === 'opcion_multiple' ? p.opciones.map((o) => o.trim()).filter(Boolean) : [],
    })),
  )

  return (
    <form
      action={accion}
      className="formulario-asamblea"
      noValidate
      onSubmit={(ev) => {
        setIntento(true)
        const campo = primerError()
        if (campo) {
          ev.preventDefault()
          document.getElementById(campo)?.focus()
        }
      }}
    >
      <input type="hidden" name="consorcio" value={consorcioId} />
      {asambleaId && <input type="hidden" name="asamblea" value={asambleaId} />}
      <input type="hidden" name="puntos" value={serializados} />

      <div className="tarjeta">
        <h2>Datos</h2>
        <div className="campo">
          <label htmlFor="titulo">Título</label>
          <input
            id="titulo"
            name="titulo"
            value={titulo}
            onChange={(ev) => setTitulo(ev.target.value)}
            required
            maxLength={200}
            aria-invalid={errorTitulo ? 'true' : undefined}
            aria-describedby={errorTitulo ? 'error-titulo' : undefined}
          />
          {errorTitulo && (
            <p className="error" id="error-titulo">
              {errorTitulo}
            </p>
          )}
        </div>
        <div className="campo">
          <label htmlFor="tipo">Tipo</label>
          <select
            id="tipo"
            name="tipo"
            value={tipo}
            onChange={(ev) => setTipo(ev.target.value as 'ordinaria' | 'extraordinaria')}
          >
            <option value="ordinaria">Ordinaria</option>
            <option value="extraordinaria">Extraordinaria</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="fechaHora">Primera convocatoria</label>
          <input
            id="fechaHora"
            name="fechaHora"
            type="datetime-local"
            min={minFechaHora}
            value={fechaHora}
            onChange={(ev) => setFechaHora(ev.target.value)}
            required
            aria-invalid={errorFechaVisible ? 'true' : undefined}
            aria-describedby={errorFechaVisible ? 'error-fecha ayuda-fecha' : 'ayuda-fecha'}
          />
          {errorFechaVisible && (
            <p className="error" id="error-fecha" role="alert">
              {errorFechaVisible}
            </p>
          )}
          <p className="ayuda" id="ayuda-fecha">
            Hora de Argentina. La segunda convocatoria es media hora después.
          </p>
        </div>
        <div className="campo">
          <label htmlFor="lugar">Lugar</label>
          <input
            id="lugar"
            name="lugar"
            value={lugar}
            onChange={(ev) => setLugar(ev.target.value)}
            required
            maxLength={300}
            aria-invalid={errorLugar ? 'true' : undefined}
            aria-describedby={errorLugar ? 'error-lugar' : undefined}
          />
          {errorLugar && (
            <p className="error" id="error-lugar">
              {errorLugar}
            </p>
          )}
        </div>
        {esConsejo && (
          <div className="campo">
            <label>
              <input
                name="administracionInvitada"
                type="checkbox"
                checked={administracionInvitada}
                onChange={(ev) => setAdministracionInvitada(ev.target.checked)}
              />{' '}
              Invitar a la administración
            </label>
            <p className="ayuda">
              Sin invitación, la administración puede ver la asamblea pero no la dirige ni vota.
            </p>
          </div>
        )}
      </div>

      <div className="tarjeta">
        <h2>Orden del día</h2>
        <p className="ayuda">
          Solo se puede tratar lo que esté acá: una vez enviada la convocatoria, el orden del día no
          cambia.
        </p>
        <ol className="orden-del-dia">
          {puntos.map((p, i) => (
            <li key={i} className="orden-del-dia__punto">
              <fieldset>
                <legend>Punto {i + 1}</legend>
                <div className="campo">
                  <label htmlFor={`punto-titulo-${i}`}>Título</label>
                  <input
                    id={`punto-titulo-${i}`}
                    value={p.titulo}
                    onChange={(ev) => cambiar(i, { titulo: ev.target.value })}
                    maxLength={200}
                    aria-invalid={intento && errores[i].titulo ? 'true' : undefined}
                    aria-describedby={
                      intento && errores[i].titulo ? `error-punto-titulo-${i}` : undefined
                    }
                  />
                  {intento && errores[i].titulo && (
                    <p className="error" id={`error-punto-titulo-${i}`}>
                      {errores[i].titulo}
                    </p>
                  )}
                </div>
                <div className="campo">
                  <label htmlFor={`punto-desc-${i}`}>Descripción (opcional)</label>
                  <textarea
                    id={`punto-desc-${i}`}
                    rows={2}
                    value={p.descripcion}
                    onChange={(ev) => cambiar(i, { descripcion: ev.target.value })}
                  />
                </div>
                <div className="campo">
                  <label htmlFor={`punto-modalidad-${i}`}>Cómo se vota</label>
                  <select
                    id={`punto-modalidad-${i}`}
                    value={p.modalidad}
                    onChange={(ev) => cambiar(i, { modalidad: ev.target.value as Modalidad })}
                  >
                    <option value="binaria">Positivo, negativo o abstención</option>
                    <option value="opcion_multiple">Entre opciones</option>
                  </select>
                </div>
                {p.modalidad === 'binaria' ? (
                  <div className="campo">
                    <label htmlFor={`punto-mayoria-${i}`}>Mayoría que necesita</label>
                    <select
                      id={`punto-mayoria-${i}`}
                      value={p.mayoria}
                      onChange={(ev) => cambiar(i, { mayoria: ev.target.value as Mayoria })}
                    >
                      <option value="absoluta">Absoluta (más de la mitad)</option>
                      <option value="dos_tercios">Dos tercios</option>
                      <option value="unanimidad">Unanimidad</option>
                    </select>
                  </div>
                ) : (
                  <div className="campo opciones-coma">
                    <label htmlFor={`punto-${i}-opciones-coma`}>
                      Opciones (separadas por coma — gana la más votada)
                    </label>
                    <div className="opciones-coma__barra">
                      {p.opciones.slice(0, -1).map((o, idx) => (
                        <span key={idx} className="opciones-coma__chip">
                          <span className="opciones-coma__num">{idx + 1}.</span> {o}
                          <button
                            type="button"
                            className="opciones-coma__quitar"
                            aria-label={`Quitar opción ${o}`}
                            onClick={() => {
                              const confirmadas = p.opciones.slice(0, -1)
                              const borrador = p.opciones[p.opciones.length - 1] ?? ''
                              cambiar(i, {
                                opciones: [...confirmadas.filter((_, k) => k !== idx), borrador],
                              })
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <input
                        id={`punto-${i}-opciones-coma`}
                        aria-invalid={intento && errores[i].opciones ? 'true' : undefined}
                        aria-describedby={
                          intento && errores[i].opciones ? `error-punto-opciones-${i}` : undefined
                        }
                        value={p.opciones[p.opciones.length - 1] ?? ''}
                        placeholder={
                          p.opciones.length <= 1
                            ? 'Ej.: Presupuesto A, Presupuesto B, Postergar'
                            : 'Otra opción…'
                        }
                        onChange={(ev) => {
                          const valor = ev.target.value
                          const confirmadas = p.opciones.slice(0, -1)
                          if (valor.includes(',')) {
                            const partes = valor.split(',')
                            const nuevas = partes
                              .slice(0, -1)
                              .map((s) => s.trim())
                              .filter(Boolean)
                            const resto = (partes[partes.length - 1] ?? '').trimStart()
                            cambiar(i, {
                              opciones: [...confirmadas, ...nuevas, resto],
                            })
                          } else {
                            cambiar(i, {
                              opciones: [...confirmadas, valor],
                            })
                          }
                        }}
                        onKeyDown={(ev) => {
                          const confirmadas = p.opciones.slice(0, -1)
                          const borrador = p.opciones[p.opciones.length - 1] ?? ''
                          if (ev.key === 'Enter' && borrador.trim().length > 0) {
                            ev.preventDefault()
                            cambiar(i, {
                              opciones: [...confirmadas, borrador.trim(), ''],
                            })
                          } else if (
                            ev.key === 'Backspace' &&
                            borrador === '' &&
                            confirmadas.length > 0
                          ) {
                            ev.preventDefault()
                            const ultima = confirmadas[confirmadas.length - 1] ?? ''
                            cambiar(i, {
                              opciones: [...confirmadas.slice(0, -1), ultima],
                            })
                          }
                        }}
                      />
                    </div>
                    {intento && errores[i].opciones && (
                      <p className="error" id={`error-punto-opciones-${i}`}>
                        {errores[i].opciones}
                      </p>
                    )}
                  </div>
                )}
                {puntos.length > 1 && (
                  <button
                    type="button"
                    className="boton boton--icono boton--terciario orden-del-dia__quitar"
                    aria-label={`Quitar el punto ${i + 1}`}
                    title={`Quitar el punto ${i + 1}`}
                    onClick={() => setPuntos((todos) => todos.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="icono" aria-hidden="true" />
                  </button>
                )}
              </fieldset>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="boton boton--terciario"
          onClick={() => setPuntos((todos) => [...todos, { ...PUNTO_VACIO, opciones: [''] }])}
        >
          <Plus className="icono" aria-hidden="true" />
          Agregar punto
        </button>
      </div>

      {estado.mensaje && (
        <p className="error" role="alert">
          {estado.mensaje}
        </p>
      )}
      <div className="fila-acciones">
        <button
          className="boton boton--primario"
          type="submit"
          disabled={enviando || Boolean(errorFecha)}
        >
          {enviando ? 'Guardando…' : 'Guardar borrador'}
        </button>
      </div>
    </form>
  )
}
