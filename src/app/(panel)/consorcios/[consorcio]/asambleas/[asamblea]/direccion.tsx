'use client'

import { unstable_rethrow } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Search } from 'lucide-react'

import { momentoParaMostrar } from '@/compartido/formato'
import type { UnidadVista, VistaAsamblea } from '@/aplicacion/asambleas/ver'
import { avisar } from '@/app/avisos'

import {
  accionAbrirPunto,
  accionAcreditar,
  accionAutoridades,
  accionCargarVoto,
  accionCerrarPunto,
  accionConstituir,
  accionFinalizar,
  accionTomarDireccion,
  type ResultadoSala,
} from './acciones'
import { opcionesDe, Ocultos } from './comunes'
import { BotonModal } from '../../../../modal'

export type CambioOptimistaSala =
  | { tipo: 'acreditarme' }
  | {
      tipo: 'acreditar'
      unidadId: string
      nombre: string
      representacion: 'propietario' | 'apoderado'
    }
  | {
      tipo: 'votar'
      puntoId: string
      unidadId: string
      clave: string
      eleccion: string
      cargaManual: boolean
    }
  | { tipo: 'abrir_punto'; puntoId: string }

function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function etiquetaUnidad(u: UnidadVista): string {
  const titulares = u.propietarios?.length ? ` — ${u.propietarios.join(', ')}` : ''
  return `${u.designacion}${titulares}${u.sinVoto ? ' (sin voto)' : ''}`
}

/**
 * Avisa cómo terminó una acción de la sala. Un corte de red o un error del
 * servidor llegan como promesa rechazada: sin atajarlos, Next tira la pantalla
 * entera en plena reunión. La redirección a ingresar sí tiene que seguir de largo.
 */
export async function notificarResultado(promesa: Promise<ResultadoSala>): Promise<boolean> {
  try {
    const res = await promesa
    if (res.ok) {
      avisar(res.mensaje, 'exito')
      return true
    }
    avisar(res.error, 'problema')
  } catch (error) {
    unstable_rethrow(error)
    avisar('No se pudo registrar: revisá la conexión e intentá de nuevo.', 'problema')
  }
  return false
}

function FormularioAcreditar({
  vista,
  ausentes,
  alCambiarOptimista,
}: {
  vista: VistaAsamblea
  ausentes: UnidadVista[]
  alCambiarOptimista?: (cambio: CambioOptimistaSala) => void
}) {
  const [, iniciarTransicion] = useTransition()
  const [busqueda, setBusqueda] = useState('')
  const [unidadSeleccionadaId, setUnidadSeleccionadaId] = useState(ausentes[0]?.unidadId ?? '')
  const [representacion, setRepresentacion] = useState<'propietario' | 'apoderado'>('propietario')
  const [nombre, setNombre] = useState(() => ausentes[0]?.propietarios?.[0] ?? '')

  const termino = normalizarBusqueda(busqueda)
  const filtradas = termino
    ? ausentes.filter((u) => {
        const textoUnidad = normalizarBusqueda(
          `${u.designacion} ${(u.propietarios ?? []).join(' ')}`,
        )
        return textoUnidad.includes(termino)
      })
    : ausentes

  const unidadActiva =
    filtradas.find((u) => u.unidadId === unidadSeleccionadaId) ?? filtradas[0] ?? null

  // La unidad activa también cambia sola: si otra persona se acredita en vivo,
  // sale de la lista. El nombre sigue a la unidad, para no acreditar a la que
  // queda con el titular de la que se fue.
  const idActiva = unidadActiva?.unidadId
  const titularActivo = unidadActiva?.propietarios?.[0] ?? ''
  useEffect(() => {
    if (representacion === 'propietario') setNombre(titularActivo)
  }, [idActiva, titularActivo, representacion])

  return (
    <form
      action={(datos) => {
        const unidadId = String(datos.get('unidad') ?? '')
        const nombreValor = String(datos.get('nombre') ?? '').trim()
        const repr =
          String(datos.get('representacion') ?? '') === 'apoderado' ? 'apoderado' : 'propietario'
        const resto = filtradas.filter((u) => u.unidadId !== unidadId)
        const siguiente = resto[0] ?? ausentes.find((u) => u.unidadId !== unidadId) ?? null
        if (siguiente) setUnidadSeleccionadaId(siguiente.unidadId)
        iniciarTransicion(async () => {
          alCambiarOptimista?.({
            tipo: 'acreditar',
            unidadId,
            nombre: nombreValor,
            representacion: repr,
          })
          await notificarResultado(accionAcreditar(datos))
        })
      }}
      className="fila-de-filtros direccion__form-acreditar"
    >
      <Ocultos vista={vista} />
      <div className="campo direccion__campo-buscar">
        <label htmlFor="acreditar-buscar">Buscar unidad o persona</label>
        <div className="direccion__input-icono">
          <Search className="icono" aria-hidden="true" />
          <input
            id="acreditar-buscar"
            type="search"
            value={busqueda}
            onChange={(e) => {
              const nuevoValor = e.target.value
              setBusqueda(nuevoValor)
              const t = normalizarBusqueda(nuevoValor)
              const coincidencias = t
                ? ausentes.filter((u) =>
                    normalizarBusqueda(
                      `${u.designacion} ${(u.propietarios ?? []).join(' ')}`,
                    ).includes(t),
                  )
                : ausentes
              if (coincidencias.length > 0) {
                const sigue = coincidencias.some((u) => u.unidadId === unidadSeleccionadaId)
                if (!sigue) setUnidadSeleccionadaId(coincidencias[0].unidadId)
              }
            }}
            placeholder="Ej.: 1A o nombre y apellido…"
            autoComplete="off"
          />
        </div>
      </div>
      <div className="campo direccion__campo-unidad">
        <label htmlFor="acreditar-unidad">
          Acreditar unidad ({filtradas.length}
          {termino ? ` de ${ausentes.length}` : ''})
        </label>
        <select
          id="acreditar-unidad"
          name="unidad"
          required
          value={unidadActiva?.unidadId ?? ''}
          onChange={(e) => setUnidadSeleccionadaId(e.target.value)}
        >
          {filtradas.length === 0 ? (
            <option value="" disabled>
              Sin coincidencias para «{busqueda}»
            </option>
          ) : (
            filtradas.map((u) => (
              <option key={u.unidadId} value={u.unidadId}>
                {etiquetaUnidad(u)}
              </option>
            ))
          )}
        </select>
      </div>
      <div className="campo direccion__campo-presente">
        <label htmlFor="acreditar-nombre">Presente</label>
        <input
          id="acreditar-nombre"
          name="nombre"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre y apellido"
        />
      </div>
      <div className="campo direccion__campo-como">
        <label htmlFor="acreditar-como">Como</label>
        <select
          id="acreditar-como"
          name="representacion"
          value={representacion}
          onChange={(e) => {
            const nuevoModo = e.target.value as 'propietario' | 'apoderado'
            setRepresentacion(nuevoModo)
            if (nuevoModo === 'apoderado') setNombre('')
          }}
        >
          <option value="propietario">Propietario</option>
          <option value="apoderado">Apoderado</option>
        </select>
      </div>
      <button className="boton boton--fantasma" type="submit" disabled={!unidadActiva}>
        Acreditar
      </button>
    </form>
  )
}

/**
 * El panel de quien dirige (FR-015 a FR-021). Acreditar a quien no puede
 * solo, designar autoridades, constituir, abrir y cerrar los puntos en orden,
 * cargar el voto de quien no tiene teléfono y finalizar.
 */
export function Direccion({
  vista,
  paso,
  alCambiarOptimista,
}: {
  vista: VistaAsamblea
  paso?: 'acreditacion' | 'votacion'
  alCambiarOptimista?: (cambio: CambioOptimistaSala) => void
}) {
  const [, iniciarTransicion] = useTransition()

  if (!vista.yo.puedeDirigir) return null
  if (!vista.yo.dirige) {
    return (
      <section className="tarjeta" aria-labelledby="direccion-titulo">
        <h2 id="direccion-titulo">Dirección</h2>
        <p className="apagado">
          Dirige {vista.dirige?.nombre ?? 'nadie todavía'}. Si se desconectó, podés tomar la
          dirección: los votos ya emitidos no se pierden.
        </p>
        <form
          action={(datos) => {
            iniciarTransicion(async () => {
              await notificarResultado(accionTomarDireccion(datos))
            })
          }}
        >
          <Ocultos vista={vista} />
          <button className="boton boton--fantasma" type="submit">
            Tomar la dirección
          </button>
        </form>
      </section>
    )
  }

  const pasoActivo = paso ?? (vista.constituida ? 'votacion' : 'acreditacion')
  const ausentes = vista.padron.filter((u) => !u.presente)
  // Una persona que representa varias unidades se elige una sola vez.
  const conUsuario = [
    ...new Map(
      vista.padron
        .filter((u) => u.presente && u.representanteId)
        .map((u) => [u.representanteId!, u]),
    ).values(),
  ]
  const abierto = vista.puntos.find((p) => p.estado === 'abierto')
  const siguiente = vista.puntos.find((p) => p.estado === 'pendiente')
  const presentesConVoto = vista.padron.filter((u) => u.presente && !u.sinVoto)
  // Un voto que la unidad emitió por sí misma no se carga encima (FR-022).
  const votosPropios = new Set(
    abierto?.votos.filter((v) => !v.cargaManual).map((v) => v.unidadId) ?? [],
  )
  const cargables = presentesConVoto.filter((u) => !votosPropios.has(u.unidadId))
  const faltanVotar = presentesConVoto.length - (abierto?.votos.length ?? 0)
  const sinAutoridades = !vista.presidente || !vista.secretario

  if (pasoActivo === 'acreditacion') {
    return (
      <section className="tarjeta direccion" aria-labelledby="direccion-titulo">
        <h2 id="direccion-titulo">
          {vista.constituida ? 'Acreditar llegada tardía' : 'Paso 1 · Acreditación y constitución'}
        </h2>

        {ausentes.length > 0 ? (
          <FormularioAcreditar
            vista={vista}
            ausentes={ausentes}
            alCambiarOptimista={alCambiarOptimista}
          />
        ) : (
          <p className="apagado">Todas las unidades del padrón ya están acreditadas.</p>
        )}

        {!vista.constituida && (
          <>
            <form
              action={(datos) => {
                iniciarTransicion(async () => {
                  await notificarResultado(accionAutoridades(datos))
                })
              }}
              className="fila-de-filtros"
            >
              <Ocultos vista={vista} />
              {(['presidente', 'secretario'] as const).map((cargo) => (
                <div key={cargo} className="campo">
                  <label htmlFor={`autoridad-${cargo}`}>
                    {cargo === 'presidente' ? 'Presidente' : 'Secretario/a'}
                  </label>
                  <select
                    id={`autoridad-${cargo}`}
                    name={cargo}
                    required
                    defaultValue={vista[cargo]?.id ?? ''}
                  >
                    <option value="" disabled>
                      {conUsuario.length === 0
                        ? 'Acreditá unidades primero'
                        : 'Elegí entre los presentes'}
                    </option>
                    {conUsuario.map((u) => {
                      const titular = u.propietarios?.[0]
                      const etiqueta =
                        titular && titular !== u.representante
                          ? `${u.designacion} — ${u.representante} (${titular})`
                          : `${u.designacion} — ${u.representante}`
                      return (
                        <option key={`${cargo}-${u.representanteId}`} value={u.representanteId!}>
                          {etiqueta}
                        </option>
                      )
                    })}
                  </select>
                </div>
              ))}
              <button
                className="boton boton--fantasma"
                type="submit"
                disabled={conUsuario.length < 2}
              >
                Designar
              </button>
            </form>
            {conUsuario.length < 2 && (
              <p className="ayuda">
                Acreditá al menos 2 personas distintas con usuario en Flay para designar presidente
                y secretario/a (actualmente hay {conUsuario.length}).
              </p>
            )}
            <form
              action={(datos) => {
                iniciarTransicion(async () => {
                  await notificarResultado(accionConstituir(datos))
                })
              }}
            >
              <Ocultos vista={vista} />
              <p className="ayuda">
                {sinAutoridades && 'Primero designá presidente y secretario/a. '}
                En primera convocatoria hace falta más del 50 % de los coeficientes. Desde las{' '}
                {momentoParaMostrar(vista.segundaConvocatoria).slice(-5)} se constituye en segunda,
                con los presentes.
              </p>
              <button className="boton boton--primario" type="submit" disabled={sinAutoridades}>
                Verificar quórum y constituir
              </button>
            </form>
          </>
        )}
      </section>
    )
  }

  return (
    <section className="tarjeta direccion" aria-labelledby="direccion-titulo">
      <h2 id="direccion-titulo">Paso 2 · Dirección del orden del día</h2>

      {vista.constituida && abierto && (
        <>
          {cargables.length > 0 && (
            <form
              action={(datos) => {
                const unidadId = String(datos.get('unidad') ?? '')
                const campoEleccion = abierto.modalidad === 'binaria' ? 'sentido' : 'opcion'
                const clave = String(datos.get(campoEleccion) ?? '')
                const texto = opcionesDe(abierto).find((o) => o.clave === clave)?.texto ?? clave
                iniciarTransicion(async () => {
                  alCambiarOptimista?.({
                    tipo: 'votar',
                    puntoId: abierto.id,
                    unidadId,
                    clave,
                    eleccion: texto,
                    cargaManual: true,
                  })
                  await notificarResultado(accionCargarVoto(datos))
                })
              }}
              className="fila-de-filtros"
            >
              <Ocultos vista={vista} />
              <input type="hidden" name="punto" value={abierto.id} />
              <div className="campo">
                <label htmlFor="manual-unidad">Cargar voto de</label>
                <select id="manual-unidad" name="unidad" required>
                  {cargables.map((u) => {
                    const cargado = abierto.votos.find((v) => v.unidadId === u.unidadId)
                    return (
                      <option key={u.unidadId} value={u.unidadId}>
                        {u.designacion} — {u.representante}
                        {cargado ? ` (cargado: ${cargado.eleccion})` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="manual-eleccion">Voto</label>
                <select
                  id="manual-eleccion"
                  name={abierto.modalidad === 'binaria' ? 'sentido' : 'opcion'}
                  required
                >
                  {opcionesDe(abierto).map(({ clave, texto }) => (
                    <option key={clave} value={clave}>
                      {texto}
                    </option>
                  ))}
                </select>
              </div>
              <button className="boton boton--fantasma" type="submit">
                Cargar voto
              </button>
            </form>
          )}
          <BotonModal
            etiqueta={`Cerrar el punto ${abierto.orden} y contar`}
            titulo={`Cerrar el punto ${abierto.orden}`}
          >
            {(cerrar) => (
              <form
                action={(datos) => {
                  cerrar()
                  iniciarTransicion(async () => {
                    await notificarResultado(accionCerrarPunto(datos))
                  })
                }}
              >
                <Ocultos vista={vista} />
                <input type="hidden" name="punto" value={abierto.id} />
                <p>
                  Votaron {abierto.votos.length} de {presentesConVoto.length}{' '}
                  {presentesConVoto.length === 1 ? 'unidad presente' : 'unidades presentes'} con
                  voto.
                </p>
                {faltanVotar > 0 && (
                  <p className="aviso aviso--atencion" role="status">
                    {faltanVotar === 1
                      ? 'Falta una unidad por votar: si cerrás ahora, ya no puede hacerlo.'
                      : `Faltan ${faltanVotar} unidades por votar: si cerrás ahora, ya no pueden hacerlo.`}
                  </p>
                )}
                <p className="ayuda">El resultado queda fijo: un punto cerrado no se reabre.</p>
                <div className="fila-acciones">
                  <button className="boton boton--primario" type="submit">
                    Confirmar cierre
                  </button>
                </div>
              </form>
            )}
          </BotonModal>
        </>
      )}

      {vista.constituida && !abierto && siguiente && (
        <form
          action={(datos) => {
            iniciarTransicion(async () => {
              alCambiarOptimista?.({ tipo: 'abrir_punto', puntoId: siguiente.id })
              await notificarResultado(accionAbrirPunto(datos))
            })
          }}
        >
          <Ocultos vista={vista} />
          <input type="hidden" name="punto" value={siguiente.id} />
          <button className="boton boton--primario" type="submit">
            Abrir el punto {siguiente.orden}: {siguiente.titulo}
          </button>
        </form>
      )}

      {vista.constituida && !abierto && !siguiente && (
        <>
          <p className="apagado">
            Se trató todo el orden del día. Al finalizar, la asistencia y los votos quedan fijos.
          </p>
          <BotonModal etiqueta="Finalizar la asamblea" titulo="Finalizar la asamblea">
            <form action={accionFinalizar}>
              <Ocultos vista={vista} />
              <p className="ayuda">
                La asistencia, los votos y los resultados quedan fijos y empieza la redacción del
                acta. No se puede deshacer.
              </p>
              <div className="fila-acciones">
                <button className="boton boton--primario" type="submit">
                  Confirmar finalización
                </button>
              </div>
            </form>
          </BotonModal>
        </>
      )}
    </section>
  )
}
