'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowRight, Bot, LoaderCircle, Send, X } from 'lucide-react'

import { avisar } from '../../avisos'
import type { EnlaceDeDatos, EventoAsistente } from '@/aplicacion/asistente/conversar'
import { accionConfirmar, accionDescartar } from './acciones'
import { destinoDe, tituloDe } from './enlaces'

/**
 * El asistente conversacional (RF-27). Un lanzador flotante abre el panel de
 * chat. Mientras trabaja dice en que paso va y escribe la respuesta a medida que
 * llega; al final ofrece pastillas que, al tocarlas, mandan ese texto como un
 * mensaje mas (no ejecutan nada). Las lecturas muestran los datos reales que
 * trae el caso de uso; las escrituras aparecen como una tarjeta con «Confirmar» y
 * «Descartar», y nada se ejecuta sin ese clic (Principio IV).
 *
 * El alcance se elige adentro: un consorcio o todos. En «todos» el servidor solo
 * ofrece consultas y el aviso a la cartera.
 */

type Cita = { documentoId: string; documento: string; pagina: number | null; numero: number }
type Sugerencia = Extract<EventoAsistente, { t: 'sugerencias' }>['sugerencias'][number]
type Consorcio = { id: string; nombre: string; direccion: string }

type Linea =
  | { de: 'usuario'; texto: string }
  | { de: 'asistente'; texto: string; citas?: Cita[]; enlaces?: EnlaceDeDatos[] }
  | {
      de: 'propuesta'
      propuestaId: string
      consorcioId: string
      resumen: string
      resuelta: boolean
    }
  | { de: 'estado'; texto: string }
  | { de: 'nota'; texto: string }

const CARTERA = 'cartera'

const enMinuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

export function Asistente({
  consorcios,
  anclaId,
  enCartera,
}: {
  consorcios: Consorcio[]
  /** El consorcio de la ruta, o el ultimo usado: desde donde se abre la conversacion. */
  anclaId: string
  /** Fuera de un consorcio (lista, bandeja) se arranca mirando todos. */
  enCartera: boolean
}) {
  const inicial = enCartera && consorcios.length > 1 ? CARTERA : anclaId
  const [abierto, setAbierto] = useState(false)
  const [alcance, setAlcance] = useState(inicial)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [texto, setTexto] = useState('')
  const [enVivo, setEnVivo] = useState(false)
  const [paso, setPaso] = useState('')
  const [parcial, setParcial] = useState('')
  const [fragmentos, setFragmentos] = useState(0)
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [anuncio, setAnuncio] = useState('')
  const [pendiente, empezar] = useTransition()
  const conversacionId = useRef<string | null>(null)
  const turno = useRef(0)
  const hilo = useRef<HTMLDivElement>(null)

  // Navegar a otro consorcio cambia el alcance por defecto: arranca un hilo nuevo.
  useEffect(() => {
    setAlcance(inicial)
    conversacionId.current = null
    turno.current++
    setEnVivo(false)
    setParcial('')
    setLineas([])
    setSugerencias([])
  }, [inicial])

  useEffect(() => {
    if (hilo.current) hilo.current.scrollTop = hilo.current.scrollHeight
  }, [lineas, parcial, paso, sugerencias, abierto])

  const cartera = alcance === CARTERA
  // El ancla de una conversacion de cartera es el consorcio desde el que se abrio.
  const consorcioId = cartera ? anclaId : alcance
  const elegido = consorcios.find((c) => c.id === alcance)

  const cambiarAlcance = (nuevo: string) => {
    setAlcance(nuevo)
    conversacionId.current = null
    turno.current++
    setEnVivo(false)
    setParcial('')
    setSugerencias([])
    const nombre =
      nuevo === CARTERA
        ? 'todos tus consorcios'
        : (consorcios.find((c) => c.id === nuevo)?.nombre ?? '')
    setLineas([{ de: 'nota', texto: `Ahora hablamos de ${nombre}.` }])
  }

  const enviar = async (pregunta: string) => {
    pregunta = pregunta.trim()
    if (!pregunta || enVivo || pendiente) return
    const mio = ++turno.current
    setTexto('')
    setSugerencias([])
    setLineas((l) => [...l, { de: 'usuario', texto: pregunta }])
    setEnVivo(true)
    setPaso('Pensando…')
    setAnuncio('Pensando…')
    setParcial('')
    setFragmentos(0)
    let acumulado = ''

    const terminar = (linea: Linea, anunciado: string) => {
      setLineas((l) => [...l, linea])
      setParcial('')
      setPaso('')
      setEnVivo(false)
      // El lector escucha la respuesta una sola vez, ya completa.
      setAnuncio(anunciado)
    }

    const alRecibir = (e: EventoAsistente) => {
      if (turno.current !== mio) return
      if (e.t === 'pensando') {
        setPaso('Pensando…')
      } else if (e.t === 'herramienta') {
        const p = `Consultando ${enMinuscula(tituloDe(e.nombre) ?? 'los datos')}…`
        setPaso(p)
        setAnuncio(p)
      } else if (e.t === 'texto') {
        acumulado += e.fragmento
        setParcial(acumulado)
        setFragmentos((n) => n + 1)
      } else if (e.t === 'descartar') {
        acumulado = ''
        setParcial('')
      } else if (e.t === 'sugerencias') {
        setSugerencias(e.sugerencias)
      } else if (e.t === 'error') {
        terminar({ de: 'estado', texto: e.mensaje }, e.mensaje)
      } else if (e.t === 'fin') {
        const r = e.respuesta
        conversacionId.current = r.conversacionId
        if (r.modo === 'degradado') {
          terminar({ de: 'estado', texto: r.motivo }, r.motivo)
        } else if (r.modo === 'propuesta') {
          terminar(
            {
              de: 'propuesta',
              propuestaId: r.propuestaId,
              consorcioId,
              resumen: r.resumen,
              resuelta: false,
            },
            r.resumen,
          )
        } else {
          terminar(
            {
              de: 'asistente',
              texto: r.texto,
              citas: r.citas as Cita[] | undefined,
              enlaces: r.enlaces,
            },
            r.texto,
          )
        }
      }
    }

    try {
      const res = await fetch('/api/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consorcioId,
          conversacionId: conversacionId.current,
          texto: pregunta,
          cartera,
        }),
      })
      if (!res.ok || !res.body) {
        const mensaje =
          res.status === 401 ? 'Tu sesión expiró. Volvé a entrar.' : 'No pude responder ahora.'
        terminar({ de: 'estado', texto: mensaje }, mensaje)
        return
      }
      const lector = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let resto = ''
      for (;;) {
        const { done, value } = await lector.read()
        if (done) break
        resto += value
        const partes = resto.split('\n')
        resto = partes.pop() ?? ''
        for (const parte of partes) if (parte) alRecibir(JSON.parse(parte) as EventoAsistente)
      }
    } catch {
      if (turno.current === mio) {
        terminar(
          { de: 'estado', texto: 'Se cortó la conexión. Probá de nuevo.' },
          'Se cortó la conexión.',
        )
      }
    }
    if (turno.current === mio) setEnVivo(false)
  }

  const marcar = (propuestaId: string) =>
    setLineas((l) =>
      l.map((x) =>
        x.de === 'propuesta' && x.propuestaId === propuestaId ? { ...x, resuelta: true } : x,
      ),
    )

  const confirmar = (propuestaId: string, consorcio: string) =>
    empezar(async () => {
      const r = await accionConfirmar(consorcio, propuestaId)
      marcar(propuestaId)
      if (r.ok) avisar(r.texto, 'exito')
      else avisar(r.mensaje, 'problema')
    })

  const descartar = (propuestaId: string, consorcio: string) =>
    empezar(async () => {
      await accionDescartar(consorcio, propuestaId)
      marcar(propuestaId)
    })

  if (consorcios.length === 0) return null

  return (
    <>
      <button
        type="button"
        className="asistente__lanzador"
        aria-expanded={abierto}
        aria-label={abierto ? 'Cerrar asistente' : 'Abrir asistente'}
        onClick={() => setAbierto((v) => !v)}
      >
        {abierto ? (
          <X className="icono" aria-hidden="true" />
        ) : (
          <Bot className="icono" aria-hidden="true" />
        )}
      </button>

      {/* Siempre montada y fuera del dialogo: una region viva que aparece junto con su texto no
          se anuncia, y adentro duplicaria el texto de cada respuesta. Sin `role="status"` a
          proposito: el aviso de degradacion ya lo tiene y un segundo lo volveria ambiguo. */}
      <p className="oculto" aria-live="polite" aria-atomic="true">
        {anuncio}
      </p>

      {abierto && (
        <section className="asistente" role="dialog" aria-label="Asistente">
          <header className="asistente__cabeza">
            <Bot className="icono" aria-hidden="true" />
            <strong>Asistente</strong>
            {consorcios.length > 1 && (
              <select
                className="asistente__alcance"
                aria-label="Alcance del asistente"
                value={alcance}
                disabled={enVivo}
                onChange={(e) => cambiarAlcance(e.target.value)}
              >
                {consorcios.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
                <option value={CARTERA}>Todos los consorcios</option>
              </select>
            )}
          </header>
          <p className="ayuda asistente__contexto">
            {cartera
              ? `En contexto: ${consorcios.map((c) => c.nombre).join(', ')}. Solo consultas y avisos a todos.`
              : `En contexto: ${elegido?.nombre ?? ''}${elegido?.direccion ? ` · ${elegido.direccion}` : ''}`}
          </p>

          {/* El hilo no es una region viva: un texto que crece token a token se releeria entero.
              El lector oye el paso en curso y, al terminar, la respuesta completa una vez. */}
          <div className="asistente__hilo" aria-busy={enVivo} ref={hilo}>
            {lineas.length === 0 && (
              <p className="ayuda">
                Preguntame por tus expensas, reservas, reclamos o el reglamento. Para reservar o
                reclamar, te muestro una tarjeta para que confirmes.
              </p>
            )}
            {lineas.map((linea, i) => {
              if (linea.de === 'usuario')
                return (
                  <p key={i} className="asistente__msg asistente__msg--usuario">
                    {linea.texto}
                  </p>
                )
              if (linea.de === 'nota')
                return (
                  <p key={i} className="ayuda">
                    {linea.texto}
                  </p>
                )
              if (linea.de === 'estado')
                return (
                  <p key={i} className="aviso aviso--atencion" role="status">
                    {linea.texto}
                  </p>
                )
              if (linea.de === 'propuesta')
                return (
                  <div key={i} className="tarjeta asistente__msg">
                    <p>{linea.resumen}</p>
                    {!linea.resuelta ? (
                      <div className="fila-acciones">
                        <button
                          type="button"
                          className="boton boton--primario"
                          disabled={pendiente}
                          onClick={() => confirmar(linea.propuestaId, linea.consorcioId)}
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          className="boton boton--fantasma"
                          disabled={pendiente}
                          onClick={() => descartar(linea.propuestaId, linea.consorcioId)}
                        >
                          Descartar
                        </button>
                      </div>
                    ) : (
                      <p className="ayuda">Resuelta.</p>
                    )}
                  </div>
                )
              // asistente
              const deCitas =
                linea.enlaces?.find((e) => e.herramienta === 'consultar_reglamentos')
                  ?.consorcioId ?? consorcioId
              return (
                <div key={i} className="asistente__msg">
                  {linea.texto && <p style={{ whiteSpace: 'pre-line' }}>{linea.texto}</p>}
                  <div className="asistente__enlaces">
                    {linea.enlaces?.map((e, j) => {
                      const d = destinoDe(e)
                      // El mismo paso en varios consorcios: el nombre distingue los botones.
                      const repetido =
                        linea.enlaces!.filter((x) => x.herramienta === e.herramienta).length > 1
                      const nombre = repetido
                        ? consorcios.find((c) => c.id === e.consorcioId)?.nombre
                        : null
                      return d ? (
                        <Link key={j} href={d.href} className="asistente__ir">
                          Ver en {d.titulo}
                          {nombre ? ` · ${nombre}` : ''}
                          <ArrowRight className="icono" aria-hidden="true" />
                        </Link>
                      ) : null
                    })}
                  </div>
                  {linea.citas && linea.citas.length > 0 && (
                    <ul className="asistente__fuentes">
                      {linea.citas.map((c) => (
                        <li key={`${c.documentoId}-${c.numero}`}>
                          <Link href={`/consorcios/${deCitas}/documentos/${c.documentoId}`}>
                            {c.documento}
                          </Link>
                          {c.pagina ? `, página ${c.pagina}` : ''} · fragmento {c.numero}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}

            {enVivo && parcial && (
              <p
                className="asistente__msg asistente__parcial"
                style={{ whiteSpace: 'pre-line' }}
                aria-hidden="true"
                data-fragmentos={fragmentos}
              >
                {parcial}
              </p>
            )}
            {enVivo && (
              <p className="ayuda asistente__paso">
                <LoaderCircle className="icono icono--girando" aria-hidden="true" /> {paso}
              </p>
            )}

            {!enVivo && sugerencias.length > 0 && (
              <div className="asistente__sugerencias">
                {sugerencias.map((s) => (
                  <button
                    key={s.pedido}
                    type="button"
                    className="asistente__ir asistente__ir--boton"
                    onClick={() => void enviar(s.pedido)}
                  >
                    {s.etiqueta}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            className="asistente__barra"
            onSubmit={(e) => {
              e.preventDefault()
              void enviar(texto)
            }}
          >
            <input
              className="asistente__entrada"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribí tu consulta…"
              aria-label="Tu consulta"
              disabled={enVivo || pendiente}
            />
            <button
              className="panel__icono"
              type="submit"
              disabled={enVivo || pendiente || !texto.trim()}
              aria-label="Enviar"
            >
              <Send className="icono" aria-hidden="true" />
            </button>
          </form>
        </section>
      )}
    </>
  )
}
