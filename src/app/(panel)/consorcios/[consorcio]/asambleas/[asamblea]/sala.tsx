'use client'

import { useEffect, useOptimistic, useState, useTransition } from 'react'
import {
  CircleCheck,
  Hand,
  ListChecks,
  PanelRightClose,
  PanelRightOpen,
  UserCheck,
  Users,
} from 'lucide-react'

import { Decimal } from '@/compartido/dinero'
import { coeficienteParaMostrar, DECIMALES_COEFICIENTE } from '@/compartido/formato'
import type {
  ConteoVista,
  PuntoVista,
  UnidadVista,
  VistaAsamblea,
} from '@/aplicacion/asambleas/ver'

import { accionAcreditarme, accionVotar } from './acciones'
import { opcionesDe, Ocultos, TablaConteo, textoResultado } from './comunes'
import { Direccion, notificarResultado, type CambioOptimistaSala } from './direccion'

function recalcularQuorum(padron: UnidadVista[], unidadesTotales: number): VistaAsamblea['quorum'] {
  let coef = new Decimal(0)
  let unidadesPresentes = 0
  for (const u of padron) {
    if (u.presente) {
      coef = coef.plus(new Decimal(u.coeficiente))
      unidadesPresentes += 1
    }
  }
  return {
    coeficientePresente: coef.toFixed(DECIMALES_COEFICIENTE),
    unidadesPresentes,
    unidadesTotales,
  }
}

function recalcularConteo(
  punto: PuntoVista,
  votos: PuntoVista['votos'],
  padron: UnidadVista[],
): ConteoVista {
  const coefPorUnidad = new Map(padron.map((u) => [u.unidadId, new Decimal(u.coeficiente)]))
  let basePresentesUnidades = 0
  let basePresentesCoef = new Decimal(0)
  let baseTotalUnidades = 0
  let baseTotalCoef = new Decimal(0)

  for (const u of padron) {
    if (u.sinVoto) continue
    const c = new Decimal(u.coeficiente)
    baseTotalUnidades += 1
    baseTotalCoef = baseTotalCoef.plus(c)
    if (u.presente) {
      basePresentesUnidades += 1
      basePresentesCoef = basePresentesCoef.plus(c)
    }
  }

  const porOpcion: ConteoVista['porOpcion'] = {}
  for (const { clave } of opcionesDe(punto)) {
    let unidades = 0
    let coef = new Decimal(0)
    for (const v of votos) {
      if (v.clave === clave) {
        unidades += 1
        coef = coef.plus(coefPorUnidad.get(v.unidadId) ?? new Decimal(0))
      }
    }
    porOpcion[clave] = {
      unidades,
      coeficiente: coef.toFixed(DECIMALES_COEFICIENTE),
    }
  }

  return {
    porOpcion,
    basePresentes: {
      unidades: basePresentesUnidades,
      coeficiente: basePresentesCoef.toFixed(DECIMALES_COEFICIENTE),
    },
    baseTotal: {
      unidades: baseTotalUnidades,
      coeficiente: baseTotalCoef.toFixed(DECIMALES_COEFICIENTE),
    },
  }
}

function aplicarCambioOptimista(actual: VistaAsamblea, cambio: CambioOptimistaSala): VistaAsamblea {
  if (cambio.tipo === 'acreditarme') {
    const misSinAcreditar = new Map(
      actual.yo.misUnidades.filter((m) => !m.acreditada).map((m) => [m.unidadId, m]),
    )
    if (misSinAcreditar.size === 0) return actual
    const nuevoPadron = actual.padron.map((u) => {
      const m = misSinAcreditar.get(u.unidadId)
      if (!m) return u
      return {
        ...u,
        presente: true,
        representacion: m.como,
        representanteId: actual.yo.usuarioId,
        representante: u.propietarios?.[0] ?? u.representante ?? 'Presente',
      }
    })
    return {
      ...actual,
      padron: nuevoPadron,
      quorum: recalcularQuorum(nuevoPadron, actual.quorum.unidadesTotales),
      yo: {
        ...actual.yo,
        misUnidades: actual.yo.misUnidades.map((m) =>
          misSinAcreditar.has(m.unidadId) ? { ...m, acreditada: true, laRepresentoYo: true } : m,
        ),
      },
    }
  }

  if (cambio.tipo === 'acreditar') {
    const nuevoPadron = actual.padron.map((u) => {
      if (u.unidadId !== cambio.unidadId) return u
      return {
        ...u,
        presente: true,
        representante: cambio.nombre,
        representacion: cambio.representacion,
      }
    })
    return {
      ...actual,
      padron: nuevoPadron,
      quorum: recalcularQuorum(nuevoPadron, actual.quorum.unidadesTotales),
    }
  }

  if (cambio.tipo === 'votar') {
    const designacion = actual.padron.find((u) => u.unidadId === cambio.unidadId)?.designacion ?? ''
    const nuevosPuntos = actual.puntos.map((p) => {
      if (p.id !== cambio.puntoId) return p
      const existe = p.votos.some((v) => v.unidadId === cambio.unidadId)
      const nuevoVoto = {
        unidadId: cambio.unidadId,
        designacion,
        clave: cambio.clave,
        eleccion: cambio.eleccion,
        cargaManual: cambio.cargaManual,
      }
      const nuevosVotos = existe
        ? p.votos.map((v) => (v.unidadId === cambio.unidadId ? nuevoVoto : v))
        : [...p.votos, nuevoVoto]
      return {
        ...p,
        votos: nuevosVotos,
        conteo: recalcularConteo(p, nuevosVotos, actual.padron),
      }
    })
    const votadasPunto = actual.yo.votadas[cambio.puntoId] ?? []
    const nuevasVotadas = votadasPunto.includes(cambio.unidadId)
      ? votadasPunto
      : [...votadasPunto, cambio.unidadId]
    return {
      ...actual,
      puntos: nuevosPuntos,
      yo: {
        ...actual.yo,
        votadas: {
          ...actual.yo.votadas,
          [cambio.puntoId]: nuevasVotadas,
        },
      },
    }
  }

  if (cambio.tipo === 'abrir_punto') {
    return {
      ...actual,
      puntos: actual.puntos.map((p) =>
        p.id === cambio.puntoId
          ? {
              ...p,
              estado: 'abierto',
              conteo: recalcularConteo(p, p.votos, actual.padron),
            }
          : p,
      ),
    }
  }

  return actual
}

/**
 * La sala en vivo (FR-023): dividida en dos pantallas según la fase (Paso 1:
 * Acreditación y constitución → Paso 2: Orden del día y votación), con un panel
 * lateral plegable de asistentes. Se refresca sola cada 3 s con `EnVivo`
 * (research R-01) y aplica cambios optimistas instantáneos al acreditar o votar.
 */
export function Sala({ vista: vistaServidor }: { vista: VistaAsamblea }) {
  const [vista, aplicarOptimista] = useOptimistic(vistaServidor, aplicarCambioOptimista)
  const [, iniciarTransicion] = useTransition()
  const [pasoManual, setPasoManual] = useState<'acreditacion' | 'votacion' | null>(null)
  const [panelAbierto, setPanelAbierto] = useState(true)
  const [filtroAsistentes, setFiltroAsistentes] = useState<'presentes' | 'ausentes' | 'todos'>(
    'presentes',
  )

  useEffect(() => {
    if (vista.constituida) {
      setPasoManual(null)
    }
  }, [vista.constituida])

  const paso: 'acreditacion' | 'votacion' =
    pasoManual ?? (vista.constituida ? 'votacion' : 'acreditacion')

  const abierto = vista.puntos.find((p) => p.estado === 'abierto')
  const sinAcreditar = vista.yo.misUnidades.filter((u) => !u.acreditada)
  const sinVoto = new Set(vista.padron.filter((u) => u.sinVoto).map((u) => u.unidadId))
  const mias = vista.yo.misUnidades.filter((u) => u.laRepresentoYo)
  const cerrados = vista.puntos.filter((p) => p.estado === 'cerrado')

  const presentes = vista.padron.filter((u) => u.presente)
  const ausentes = vista.padron.filter((u) => !u.presente)
  const listaPanel =
    filtroAsistentes === 'presentes'
      ? presentes
      : filtroAsistentes === 'ausentes'
        ? ausentes
        : vista.padron

  const emitirVoto = (punto: PuntoVista, unidadId: string, clave: string, texto: string) => {
    const datos = new FormData()
    datos.set('consorcio', vista.consorcioId)
    datos.set('asamblea', vista.id)
    datos.set('punto', punto.id)
    datos.set('unidad', unidadId)
    datos.set(punto.modalidad === 'binaria' ? 'sentido' : 'opcion', clave)

    iniciarTransicion(async () => {
      aplicarOptimista({
        tipo: 'votar',
        puntoId: punto.id,
        unidadId,
        clave,
        eleccion: texto,
        cargaManual: false,
      })
      await notificarResultado(accionVotar(datos))
    })
  }

  return (
    <>
      <section className="sala__quorum" aria-labelledby="quorum-titulo">
        <div className="sala__quorum-info">
          <h2 id="quorum-titulo">Asistencia</h2>
          <p className="sala__cifra">
            {coeficienteParaMostrar(vista.quorum.coeficientePresente)} %
            <span className="apagado">
              {' '}
              de los coeficientes · {vista.quorum.unidadesPresentes} de{' '}
              {vista.quorum.unidadesTotales} unidades
            </span>
          </p>
          <p className="apagado">
            {vista.constituida
              ? `Constituida en ${vista.convocatoriaQueRige === 'segunda' ? 'segunda' : 'primera'} convocatoria.`
              : 'Acreditación en curso: la asamblea todavía no se constituyó.'}
            {vista.presidente && ` Preside ${vista.presidente.nombre}.`}
            {vista.secretario && ` Secretario/a: ${vista.secretario.nombre}.`}
          </p>
        </div>

        <div className="sala__quorum-controles">
          {sinAcreditar.length > 0 && (
            <form
              action={(datos) => {
                iniciarTransicion(async () => {
                  aplicarOptimista({ tipo: 'acreditarme' })
                  await notificarResultado(accionAcreditarme(datos))
                })
              }}
            >
              <Ocultos vista={vista} />
              <button className="boton boton--primario" type="submit">
                <Hand className="icono" aria-hidden="true" />
                Estoy presente ({sinAcreditar.map((u) => u.designacion).join(', ')})
              </button>
            </form>
          )}

          {vista.yo.puedeDirigir && (
            <div className="sala__pasos" role="group" aria-label="Etapas de la sesión">
              <button
                type="button"
                aria-pressed={paso === 'acreditacion'}
                className={`sala__paso${paso === 'acreditacion' ? ' sala__paso--activo' : ''}`}
                onClick={() => setPasoManual('acreditacion')}
              >
                <UserCheck className="icono" aria-hidden="true" />
                1. Acreditación
              </button>
              <button
                type="button"
                aria-pressed={paso === 'votacion'}
                className={`sala__paso${paso === 'votacion' ? ' sala__paso--activo' : ''}`}
                onClick={() => setPasoManual('votacion')}
              >
                <ListChecks className="icono" aria-hidden="true" />
                2. Orden del día
              </button>
            </div>
          )}

          <button
            type="button"
            className="boton boton--fantasma sala__boton-panel"
            aria-expanded={panelAbierto}
            onClick={() => setPanelAbierto((v) => !v)}
          >
            {panelAbierto ? (
              <PanelRightClose className="icono" aria-hidden="true" />
            ) : (
              <PanelRightOpen className="icono" aria-hidden="true" />
            )}
            Asistentes ({presentes.length})
          </button>
        </div>

        {vista.yo.misUnidades.some((u) => u.acreditada && !u.laRepresentoYo) && (
          <p className="aviso aviso--atencion" role="status">
            Alguna de tus unidades ya la acreditó otra persona: vota quien se acreditó primero.
          </p>
        )}
      </section>

      <div className={`sala__cuerpo${panelAbierto ? ' sala__cuerpo--con-panel' : ''}`}>
        <div className="sala__principal">
          {paso === 'acreditacion' ? (
            <>
              <Direccion vista={vista} paso="acreditacion" alCambiarOptimista={aplicarOptimista} />
              {!vista.yo.puedeDirigir && (
                <section className="tarjeta" aria-labelledby="espera-titulo">
                  <h2 id="espera-titulo">Acreditación en curso</h2>
                  <p className="apagado">
                    Se está acreditando la asistencia y verificando el quórum. Apenas se constituya
                    la asamblea, se habilitarán acá los puntos del orden del día.
                  </p>
                </section>
              )}
            </>
          ) : (
            <>
              <Direccion vista={vista} paso="votacion" alCambiarOptimista={aplicarOptimista} />

              <section className="tarjeta sala__punto" aria-labelledby="punto-titulo">
                {abierto ? (
                  <>
                    <p className="etiqueta etiqueta--info">En votación</p>
                    <h2 id="punto-titulo">
                      {abierto.orden}. {abierto.titulo}
                    </h2>
                    {abierto.descripcion && <p>{abierto.descripcion}</p>}

                    {mias.map((u) => {
                      const votoActual = abierto.votos.find((v) => v.unidadId === u.unidadId)
                      if (sinVoto.has(u.unidadId)) {
                        return (
                          <p key={u.unidadId} className="aviso aviso--atencion" role="status">
                            La unidad {u.designacion} no vota por deuda de expensas.
                          </p>
                        )
                      }
                      return (
                        <div key={u.unidadId} className="votar">
                          <p className="votar__unidad">Tu voto por la unidad {u.designacion}</p>
                          <div className="votar__opciones">
                            {opcionesDe(abierto).map(({ clave, texto }) => {
                              const esElegido = votoActual?.clave === clave
                              return (
                                <button
                                  key={clave}
                                  className={`boton boton--grande votar__boton${esElegido ? ' votar__boton--elegido' : ''}`}
                                  type="button"
                                  aria-pressed={esElegido}
                                  aria-label={`Votar ${texto} por la unidad ${u.designacion}`}
                                  onClick={() => emitirVoto(abierto, u.unidadId, clave, texto)}
                                >
                                  {esElegido && (
                                    <CircleCheck className="icono" aria-hidden="true" />
                                  )}
                                  {texto}
                                </button>
                              )
                            })}
                          </div>
                          {votoActual && (
                            <p className="ayuda">
                              Podés cambiar tu voto hasta que se cierre el punto.
                            </p>
                          )}
                        </div>
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
          )}
        </div>

        {panelAbierto && (
          <aside className="tarjeta sala__asistentes" aria-label="Lista de asistentes">
            <div className="sala__asistentes-cabeza">
              <h3>
                <Users className="icono" aria-hidden="true" />
                Asistentes ({presentes.length} / {vista.padron.length})
              </h3>
              <button
                type="button"
                className="boton boton--icono boton--terciario"
                aria-label="Plegar panel de asistentes"
                title="Plegar panel"
                onClick={() => setPanelAbierto(false)}
              >
                <PanelRightClose className="icono" aria-hidden="true" />
              </button>
            </div>

            <div className="sala__asistentes-filtros" role="group" aria-label="Filtrar unidades">
              <button
                type="button"
                aria-pressed={filtroAsistentes === 'presentes'}
                className={`sala__filtro-tab${filtroAsistentes === 'presentes' ? ' sala__filtro-tab--activo' : ''}`}
                onClick={() => setFiltroAsistentes('presentes')}
              >
                Presentes ({presentes.length})
              </button>
              <button
                type="button"
                aria-pressed={filtroAsistentes === 'ausentes'}
                className={`sala__filtro-tab${filtroAsistentes === 'ausentes' ? ' sala__filtro-tab--activo' : ''}`}
                onClick={() => setFiltroAsistentes('ausentes')}
              >
                Ausentes ({ausentes.length})
              </button>
              <button
                type="button"
                aria-pressed={filtroAsistentes === 'todos'}
                className={`sala__filtro-tab${filtroAsistentes === 'todos' ? ' sala__filtro-tab--activo' : ''}`}
                onClick={() => setFiltroAsistentes('todos')}
              >
                Todos ({vista.padron.length})
              </button>
            </div>

            {listaPanel.length === 0 ? (
              <p className="apagado sala__asistentes-vacio">
                {filtroAsistentes === 'presentes'
                  ? 'Todavía no hay unidades acreditadas.'
                  : 'Todas las unidades están presentes.'}
              </p>
            ) : (
              <ul className="sala__asistentes-lista">
                {listaPanel.map((u) => {
                  const nombrePersona = u.presente
                    ? u.representante
                    : (u.propietarios?.join(', ') ?? 'Sin titular')
                  return (
                    <li key={u.unidadId} className="sala__asistente-item">
                      <span className="sala__asistente-unidad">{u.designacion}</span>
                      <div className="sala__asistente-detalle">
                        <strong>{nombrePersona}</strong>
                        <span className="apagado">
                          {u.presente
                            ? u.representacion === 'apoderado'
                              ? 'Apoderado'
                              : 'Propietario'
                            : 'Ausente'}{' '}
                          · {coeficienteParaMostrar(u.coeficiente)} %
                          {u.sinVoto ? ' · Sin voto' : ''}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </aside>
        )}
      </div>
    </>
  )
}
