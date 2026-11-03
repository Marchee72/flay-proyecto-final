import { CircleCheck, Hand } from 'lucide-react'

import { coeficienteParaMostrar } from '@/compartido/formato'
import type { VistaAsamblea } from '@/aplicacion/asambleas/ver'

import { accionAcreditarme, accionVotar } from './acciones'
import { opcionesDe, Ocultos, TablaConteo, textoResultado } from './comunes'

/**
 * La sala en vivo (FR-023): lo que ve cualquier presente desde el teléfono.
 * Quórum, el punto en votación con sus opciones, el conteo y los votos por
 * unidad, y los botones para votar por las unidades que represento. Se
 * refresca sola cada 3 s con `EnVivo` (research R-01).
 */
export function Sala({ vista }: { vista: VistaAsamblea }) {
  const abierto = vista.puntos.find((p) => p.estado === 'abierto')
  const sinAcreditar = vista.yo.misUnidades.filter((u) => !u.acreditada)
  const sinVoto = new Set(vista.padron.filter((u) => u.sinVoto).map((u) => u.unidadId))
  const mias = vista.yo.misUnidades.filter((u) => u.laRepresentoYo)
  const cerrados = vista.puntos.filter((p) => p.estado === 'cerrado')

  return (
    <>
      <section className="tarjeta sala__quorum" aria-labelledby="quorum-titulo">
        <h2 id="quorum-titulo">Asistencia</h2>
        <p className="sala__cifra">
          {coeficienteParaMostrar(vista.quorum.coeficientePresente)} %
          <span className="apagado">
            {' '}
            de los coeficientes · {vista.quorum.unidadesPresentes} de {vista.quorum.unidadesTotales}{' '}
            unidades
          </span>
        </p>
        <p className="apagado">
          {vista.constituida
            ? `Constituida en ${vista.convocatoriaQueRige === 'segunda' ? 'segunda' : 'primera'} convocatoria.`
            : 'Acreditación en curso: la asamblea todavía no se constituyó.'}
          {vista.presidente && ` Preside ${vista.presidente.nombre}.`}
          {vista.secretario && ` Secretario/a: ${vista.secretario.nombre}.`}
        </p>
        {sinAcreditar.length > 0 && (
          <form action={accionAcreditarme}>
            <Ocultos vista={vista} />
            <button className="boton boton--primario boton--grande" type="submit">
              <Hand className="icono" aria-hidden="true" />
              Estoy presente ({sinAcreditar.map((u) => u.designacion).join(', ')})
            </button>
          </form>
        )}
        {vista.yo.misUnidades.some((u) => u.acreditada && !u.laRepresentoYo) && (
          <p className="aviso aviso--atencion" role="status">
            Alguna de tus unidades ya la acreditó otra persona: vota quien se acreditó primero.
          </p>
        )}
      </section>

      <section className="tarjeta sala__punto" aria-labelledby="punto-titulo">
        {abierto ? (
          <>
            <p className="etiqueta etiqueta--info">En votación</p>
            <h2 id="punto-titulo">
              {abierto.orden}. {abierto.titulo}
            </h2>
            {abierto.descripcion && <p>{abierto.descripcion}</p>}

            {mias.map((u) => {
              const yaVoto = vista.yo.votadas[abierto.id]?.includes(u.unidadId)
              const elegido = abierto.votos.find((v) => v.unidadId === u.unidadId)?.eleccion
              if (sinVoto.has(u.unidadId)) {
                return (
                  <p key={u.unidadId} className="aviso aviso--atencion" role="status">
                    La unidad {u.designacion} no vota por deuda de expensas.
                  </p>
                )
              }
              return yaVoto ? (
                <p key={u.unidadId} className="aviso aviso--exito" role="status">
                  <CircleCheck className="icono" aria-hidden="true" />
                  <span>
                    Unidad {u.designacion}: votaste «{elegido}». El voto no se modifica.
                  </span>
                </p>
              ) : (
                <form key={u.unidadId} action={accionVotar} className="votar">
                  <Ocultos vista={vista} />
                  <input type="hidden" name="punto" value={abierto.id} />
                  <input type="hidden" name="unidad" value={u.unidadId} />
                  <p className="votar__unidad">Tu voto por la unidad {u.designacion}</p>
                  <div className="votar__opciones">
                    {opcionesDe(abierto).map(({ clave, texto }) => (
                      <button
                        key={clave}
                        className="boton boton--grande votar__boton"
                        type="submit"
                        name={abierto.modalidad === 'binaria' ? 'sentido' : 'opcion'}
                        value={clave}
                        aria-label={`Votar ${texto} por la unidad ${u.designacion}`}
                      >
                        {texto}
                      </button>
                    ))}
                  </div>
                </form>
              )
            })}

            {abierto.conteo && <TablaConteo punto={abierto} conteo={abierto.conteo} />}

            <details className="sala__votos">
              <summary>Votos por unidad ({abierto.votos.length})</summary>
              <ul className="lista-simple">
                {abierto.votos.map((v) => (
                  <li key={v.unidadId}>
                    <span>{v.designacion}</span>
                    <span>
                      {v.eleccion}
                      {v.cargaManual && <span className="apagado"> (cargado)</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <>
            <h2 id="punto-titulo">Ningún punto en votación</h2>
            <p className="apagado">
              {vista.constituida
                ? 'Se está debatiendo. Cuando quien dirige abra el próximo punto, aparece acá.'
                : 'Primero se acredita la asistencia y se verifica el quórum.'}
            </p>
          </>
        )}
      </section>

      {cerrados.length > 0 && (
        <section className="tarjeta" aria-labelledby="tratados-titulo">
          <h2 id="tratados-titulo">Puntos tratados</h2>
          <ul className="lista-simple">
            {cerrados.map((p) => (
              <li key={p.id}>
                <span>
                  {p.orden}. {p.titulo}
                </span>
                <strong>{textoResultado(p)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
