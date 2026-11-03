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
  opciones: ['', ''],
}

const SIN_RESULTADO: Resultado = { mensaje: '' }

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
  const [puntos, setPuntos] = useState<PuntoEditable[]>(inicial?.puntos ?? [{ ...PUNTO_VACIO }])

  const cambiar = (i: number, cambio: Partial<PuntoEditable>) =>
    setPuntos((todos) => todos.map((p, j) => (j === i ? { ...p, ...cambio } : p)))

  const serializados = JSON.stringify(
    puntos.map((p) => ({
      titulo: p.titulo,
      descripcion: p.descripcion,
      modalidad: p.modalidad,
      mayoria: p.modalidad === 'binaria' ? p.mayoria : null,
      opciones: p.modalidad === 'opcion_multiple' ? p.opciones : [],
    })),
  )

  return (
    <form action={accion} className="formulario-asamblea" noValidate>
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
            defaultValue={inicial?.titulo}
            required
            maxLength={200}
          />
        </div>
        <div className="campo">
          <label htmlFor="tipo">Tipo</label>
          <select id="tipo" name="tipo" defaultValue={inicial?.tipo ?? 'ordinaria'}>
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
            defaultValue={inicial?.fechaHora}
            required
            aria-describedby="ayuda-fecha"
          />
          <p className="ayuda" id="ayuda-fecha">
            Hora de Argentina. La segunda convocatoria es media hora después.
          </p>
        </div>
        <div className="campo">
          <label htmlFor="lugar">Lugar</label>
          <input id="lugar" name="lugar" defaultValue={inicial?.lugar} required maxLength={300} />
        </div>
        {esConsejo && (
          <div className="campo">
            <label>
              <input
                name="administracionInvitada"
                type="checkbox"
                defaultChecked={inicial?.administracionInvitada ?? true}
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
                  />
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
                  <fieldset className="opciones-punto">
                    <legend>Opciones (gana la más votada)</legend>
                    {p.opciones.map((o, j) => (
                      <div key={j} className="opciones-punto__fila">
                        <label className="oculto" htmlFor={`punto-${i}-opcion-${j}`}>
                          Opción {j + 1}
                        </label>
                        <input
                          id={`punto-${i}-opcion-${j}`}
                          value={o}
                          placeholder={`Opción ${j + 1}`}
                          maxLength={200}
                          onChange={(ev) =>
                            cambiar(i, {
                              opciones: p.opciones.map((x, k) => (k === j ? ev.target.value : x)),
                            })
                          }
                        />
                        {p.opciones.length > 2 && (
                          <button
                            type="button"
                            className="boton boton--icono"
                            aria-label={`Quitar la opción ${j + 1}`}
                            onClick={() =>
                              cambiar(i, { opciones: p.opciones.filter((_, k) => k !== j) })
                            }
                          >
                            <Trash2 className="icono" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="boton boton--terciario"
                      onClick={() => cambiar(i, { opciones: [...p.opciones, ''] })}
                    >
                      <Plus className="icono" aria-hidden="true" />
                      Agregar opción
                    </button>
                  </fieldset>
                )}
                {puntos.length > 1 && (
                  <button
                    type="button"
                    className="boton boton--fantasma"
                    onClick={() => setPuntos((todos) => todos.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="icono" aria-hidden="true" />
                    Quitar el punto {i + 1}
                  </button>
                )}
              </fieldset>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="boton boton--terciario"
          onClick={() => setPuntos((todos) => [...todos, { ...PUNTO_VACIO, opciones: ['', ''] }])}
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
        <button className="boton boton--primario" type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar borrador'}
        </button>
      </div>
    </form>
  )
}
