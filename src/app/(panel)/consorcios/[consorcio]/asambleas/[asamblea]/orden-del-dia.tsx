import { momentoParaMostrar } from '@/compartido/formato'
import type { VistaAsamblea } from '@/aplicacion/asambleas/ver'

import { accionOponerme, accionOposicionEnPapel } from './acciones'
import {
  ETIQUETA_DECISION,
  ETIQUETA_MAYORIA,
  Ocultos,
  TablaConteo,
  textoResultado,
} from './comunes'

/**
 * El orden del día. Antes de tratarse, qué se vota y con qué mayoría; cerrado,
 * su resultado, su conteo y el estado de la decisión, con la oposición del
 * ausente cuando corresponde (FR-027 a FR-029).
 */
export function OrdenDelDia({
  vista,
  conResultados,
}: {
  vista: VistaAsamblea
  conResultados: boolean
}) {
  const oponibles = new Map(vista.yo.puedoOponerme.map((o) => [o.puntoId, o]))
  const ausentesSinCuenta = (puntoId: string) => {
    const punto = vista.puntos.find((p) => p.id === puntoId)!
    return vista.propietariosSinCuenta.filter((p) => {
      const u = vista.padron.find((x) => x.unidadId === p.unidadId)
      return u && !u.presente && !u.sinVoto && !punto.oposiciones.includes(p.unidadId)
    })
  }

  return (
    <section className="tarjeta" aria-labelledby="orden-titulo">
      <h2 id="orden-titulo">Orden del día</h2>
      <ol className="orden-del-dia">
        {vista.puntos.map((p) => (
          <li key={p.id} className="orden-del-dia__punto">
            <h3>
              {p.orden}. {p.titulo}
            </h3>
            {p.descripcion && <p>{p.descripcion}</p>}
            <p className="apagado">
              {p.modalidad === 'binaria'
                ? `Positivo, negativo o abstención · ${ETIQUETA_MAYORIA[p.mayoria ?? 'absoluta']}`
                : `Entre opciones: ${p.opciones.map((o) => o.texto).join(', ')} · gana la más votada`}
            </p>

            {conResultados && p.estado === 'cerrado' && (
              <>
                <p>
                  <strong>{textoResultado(p)}</strong>
                  {p.estadoDecision && (
                    <span
                      className={`etiqueta ${p.estadoDecision === 'caida' ? 'etiqueta--vencido' : p.estadoDecision === 'provisoria' ? 'etiqueta--pendiente' : 'etiqueta--rendido'}`}
                    >
                      {ETIQUETA_DECISION[p.estadoDecision]}
                    </span>
                  )}
                </p>
                {p.estadoDecision === 'provisoria' && p.vencePlazoOposicion && (
                  <p className="aviso aviso--atencion" role="status">
                    Aprobada por la mayoría de los presentes. Los ausentes pueden oponerse hasta el{' '}
                    {momentoParaMostrar(p.vencePlazoOposicion)}; si no se oponen, queda firme.
                  </p>
                )}
                {p.conteo && <TablaConteo punto={p} conteo={p.conteo} />}

                {oponibles.has(p.id) && (
                  <form action={accionOponerme} className="fila-acciones">
                    <Ocultos vista={vista} />
                    <input type="hidden" name="punto" value={p.id} />
                    <input type="hidden" name="unidad" value={oponibles.get(p.id)!.unidadId} />
                    <button className="boton boton--peligro" type="submit">
                      Oponerme por la unidad {oponibles.get(p.id)!.designacion}
                    </button>
                  </form>
                )}

                {p.estadoDecision === 'provisoria' && ausentesSinCuenta(p.id).length > 0 && (
                  <form action={accionOposicionEnPapel} className="fila-de-filtros">
                    <Ocultos vista={vista} />
                    <input type="hidden" name="punto" value={p.id} />
                    <div className="campo">
                      <label htmlFor={`oposicion-${p.id}`}>Oposición recibida por escrito</label>
                      <select id={`oposicion-${p.id}`} name="ausente" required>
                        {ausentesSinCuenta(p.id).map((a) => (
                          <option
                            key={`${a.unidadId}-${a.personaId}`}
                            value={`${a.unidadId}|${a.personaId}`}
                          >
                            {a.designacion} — {a.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button className="boton boton--fantasma" type="submit">
                      Registrar oposición
                    </button>
                  </form>
                )}
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
