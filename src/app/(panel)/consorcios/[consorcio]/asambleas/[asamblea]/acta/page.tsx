import type { Metadata } from 'next'
import { Download, ShieldCheck, ShieldAlert } from 'lucide-react'

import { momentoParaMostrar } from '@/compartido/formato'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { enlaceDelActa, verificarHuella } from '@/aplicacion/asambleas/acta'
import { verAsamblea } from '@/aplicacion/asambleas/ver'

import { AvisoDeError, conConsorcio, idONoEncontrado } from '../../../../../con-consorcio'
import { Volver } from '../../../../../encabezado-consorcio'
import { EnVivo } from '../../../../../en-vivo'
import { BotonModal } from '../../../../../modal'
import {
  accionEnviarAFirmar,
  accionFirmantes,
  accionFirmar,
  accionPedirBorrador,
  accionReemplazarFirmante,
  accionResumen,
} from '../acciones'
import { BotonEnviar } from '../boton-enviar'
import { Ocultos, TablaConteo, textoResultado } from '../comunes'

export const metadata: Metadata = { title: 'Acta de asamblea — Flay' }

const ROL = { presidente: 'Presidente', secretario: 'Secretario/a', propietario: 'Propietario/a' }

const ETAPAS = [
  { estado: 'en_redaccion', texto: 'Redacción' },
  { estado: 'a_firmar', texto: 'A firmar' },
  { estado: 'firmada', texto: 'Firmada' },
] as const

/**
 * El acta (RF-32): se redacta después de la reunión, sobre el borrador que
 * propone la IA con los resultados y las notas; lo que una persona guarda es lo
 * que cuenta (RN-14). Se envía a firmar con su huella y la firman presidente,
 * secretario y dos propietarios presentes con su contraseña (firma electrónica,
 * Ley 25.506 art. 5).
 */
export default async function ActaPage({
  params,
}: {
  params: Promise<{ consorcio: string; asamblea: string }>
}) {
  const { consorcio: consorcioId, asamblea } = await params
  const asambleaId = idONoEncontrado(asamblea)
  const pantalla = await conConsorcio(consorcioId, 'Acta')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  const datos = { usuarioId, consorcioId: activo.id, asambleaId }
  const volver = `/consorcios/${activo.id}/asambleas/${asambleaId}`

  try {
    const vista = await verAsamblea(HABILITACIONES, RELOJ, datos)
    const acta = vista.acta
    if (!acta) {
      return (
        <>
          <Volver href={volver} />
          <h1>Acta</h1>
          <p className="aviso aviso--atencion" role="status">
            El acta nace al finalizar la asamblea.
          </p>
        </>
      )
    }
    const enRedaccion = acta.estado === 'en_redaccion'
    const puedeRedactar =
      enRedaccion && (vista.yo.esSecretario || vista.dirige?.id === vista.yo.usuarioId)
    const dirigio = vista.dirige?.id === vista.yo.usuarioId
    const [enlace, integridad] = await Promise.all([
      acta.hashContenido ? enlaceDelActa(HABILITACIONES, RELOJ, ALMACEN, datos) : null,
      acta.hashContenido
        ? verificarHuella(HABILITACIONES, RELOJ, ALMACEN, datos).catch(() => null)
        : null,
    ])

    const propietariosPresentes = [
      ...new Map(
        vista.padron
          .filter(
            (u) =>
              u.presente &&
              u.representacion === 'propietario' &&
              u.representanteId &&
              u.representanteId !== vista.presidente?.id &&
              u.representanteId !== vista.secretario?.id,
          )
          .map((u) => [u.representanteId!, u]),
      ).values(),
    ]
    const designados = new Set(
      acta.firmantes.filter((f) => f.rol === 'propietario').map((f) => f.usuarioId),
    )
    const presentesConUsuario = [
      ...new Map(
        vista.padron
          .filter((u) => u.presente && u.representanteId)
          .map((u) => [u.representanteId!, u]),
      ).values(),
    ].filter((u) => !acta.firmantes.some((f) => f.usuarioId === u.representanteId))

    const faltanResumenes = vista.puntos.filter((p) => !p.resumen).length
    const faltaParaEnviar = [
      acta.firmantes.length !== 4 && 'designar a los dos propietarios que firman',
      faltanResumenes === 1 && 'guardar el resumen revisado de un punto',
      faltanResumenes > 1 && `guardar los resúmenes revisados de ${faltanResumenes} puntos`,
    ].filter(Boolean)

    const etapa = ETAPAS.findIndex((e) => e.estado === acta.estado)
    const redactando = puedeRedactar && acta.borradorPendiente
    const sinBorrador =
      puedeRedactar &&
      !acta.borradorPendiente &&
      faltanResumenes > 0 &&
      !vista.puntos.some((p) => p.borradorResumen)

    const puntos = vista.puntos.map((p) => (
      <div key={p.id} className="acta__punto">
        <h3>
          {p.orden}. {p.titulo}
        </h3>
        {p.resultado && (
          <p className="acta__resultado">
            <strong>{textoResultado(p)}</strong>
          </p>
        )}
        {p.conteo && <TablaConteo punto={p} conteo={p.conteo} />}
        {p.notas && <p className="ayuda acta__notas">Notas de la reunión: {p.notas}</p>}
        {puedeRedactar ? (
          <>
            <input type="hidden" name="punto" value={p.id} />
            <div className="campo campo--ancho">
              <label htmlFor={`resumen-${p.id}`}>Resumen de lo debatido</label>
              {!p.resumen && p.borradorResumen && (
                <p className="etiqueta etiqueta--pendiente">Borrador de IA, revisalo</p>
              )}
              {/* La clave cambia al llegar el borrador: `defaultValue` solo vale al montar. */}
              <textarea
                key={p.borradorResumen ? 'con-borrador' : 'sin-borrador'}
                id={`resumen-${p.id}`}
                name={`resumen-${p.id}`}
                rows={6}
                readOnly={redactando}
                defaultValue={p.resumen ?? p.borradorResumen ?? ''}
              />
            </div>
          </>
        ) : (
          <p>{p.resumen || <span className="apagado">Sin resumen todavía.</span>}</p>
        )}
      </div>
    ))

    return (
      <>
        <Volver href={volver} />
        <div className="cabecera-pagina">
          <div>
            <h1>Acta — {vista.titulo}</h1>
            <p className="apagado">
              {enRedaccion
                ? 'En redacción: se completan los resúmenes y se eligen los firmantes.'
                : acta.estado === 'a_firmar'
                  ? 'A firmar: el texto ya no cambia. Firman en los 10 días siguientes.'
                  : 'Firmada. Está en la documentación del consorcio.'}
            </p>
          </div>
          {enlace && (
            <div className="cabecera-pagina__acciones">
              <a className="boton boton--fantasma" href={enlace}>
                <Download className="icono" aria-hidden="true" />
                Descargar PDF
              </a>
            </div>
          )}
        </div>

        <ol className="acta__estados" aria-label="Etapas del acta">
          {ETAPAS.map((e, i) => (
            <li
              key={e.estado}
              className={i < etapa ? 'acta__estado--hecho' : undefined}
              aria-current={i === etapa ? 'step' : undefined}
            >
              {e.texto}
            </li>
          ))}
        </ol>

        <div className="acta__cuerpo">
          <section className="tarjeta" aria-labelledby="resumenes-titulo">
            <h2 id="resumenes-titulo">Lo tratado</h2>
            {redactando && (
              <>
                <EnVivo />
                <p className="aviso" role="status">
                  La IA está redactando el borrador con los resultados y las notas de la reunión.
                  Suele tardar unos segundos.
                </p>
              </>
            )}
            {sinBorrador && (
              <form action={accionPedirBorrador} className="aviso aviso--atencion">
                <Ocultos vista={vista} />
                <p role="status">
                  No hay borrador de la IA. Podés pedirlo de nuevo o escribir los resúmenes a mano.
                </p>
                <button className="boton boton--fantasma" type="submit">
                  Generar borrador
                </button>
              </form>
            )}
            {puedeRedactar ? (
              <form action={accionResumen}>
                <Ocultos vista={vista} />
                {puntos}
                <div className="fila-acciones acta__guardar">
                  <button className="boton boton--primario" type="submit" disabled={redactando}>
                    Guardar resúmenes
                  </button>
                </div>
              </form>
            ) : (
              puntos
            )}
          </section>

          <section className="tarjeta acta__panel" aria-labelledby="firmas-titulo">
            <h2 id="firmas-titulo">Firmas</h2>
            {acta.firmantes.length > 0 && (
              <ul className="lista-simple">
                {acta.firmantes.map((f) => (
                  <li key={f.id}>
                    <span>
                      {ROL[f.rol]}: {f.nombre}
                      {f.reemplazo && <span className="apagado"> (reemplazo)</span>}
                    </span>
                    <span>
                      {f.firmadoEn ? (
                        <span className="etiqueta etiqueta--rendido">
                          Firmó {momentoParaMostrar(f.firmadoEn)}
                        </span>
                      ) : (
                        <span className="etiqueta etiqueta--pendiente">Pendiente</span>
                      )}
                    </span>
                    {acta.estado === 'a_firmar' &&
                      dirigio &&
                      !f.firmadoEn &&
                      presentesConUsuario.length > 0 && (
                        <form action={accionReemplazarFirmante} className="fila-de-filtros">
                          <Ocultos vista={vista} />
                          <input type="hidden" name="firmante" value={f.id} />
                          <label className="oculto" htmlFor={`reemplazo-${f.id}`}>
                            Reemplazar a {f.nombre} por
                          </label>
                          <select id={`reemplazo-${f.id}`} name="nuevo">
                            {presentesConUsuario.map((u) => (
                              <option key={u.representanteId} value={u.representanteId!}>
                                {u.representante}
                              </option>
                            ))}
                          </select>
                          <button className="boton boton--fantasma" type="submit">
                            Reemplazar
                          </button>
                        </form>
                      )}
                  </li>
                ))}
              </ul>
            )}

            {enRedaccion && dirigio && propietariosPresentes.length < 2 && (
              <p className="aviso aviso--atencion" role="status">
                Hacen falta dos propietarios presentes con usuario en Flay, además del presidente y
                del secretario/a, y hay {propietariosPresentes.length}.
              </p>
            )}

            {enRedaccion && dirigio && propietariosPresentes.length > 0 && (
              <form action={accionFirmantes}>
                <Ocultos vista={vista} />
                <fieldset className="campo">
                  <legend>
                    Firman el presidente ({vista.presidente?.nombre}), el secretario/a (
                    {vista.secretario?.nombre}) y dos propietarios presentes:
                  </legend>
                  {propietariosPresentes.map((u) => (
                    <label key={u.representanteId}>
                      <input
                        type="checkbox"
                        name="propietario"
                        value={u.representanteId!}
                        defaultChecked={designados.has(u.representanteId!)}
                      />{' '}
                      {u.representante} ({u.designacion})
                    </label>
                  ))}
                </fieldset>
                <button className="boton boton--fantasma" type="submit">
                  Guardar firmantes
                </button>
              </form>
            )}

            {enRedaccion && dirigio && (
              <div className="fila-acciones">
                {faltaParaEnviar.length > 0 ? (
                  <p className="ayuda">
                    Para enviar a firmar falta: {faltaParaEnviar.join(' y ')}.
                  </p>
                ) : (
                  <BotonModal etiqueta="Enviar a firmar" titulo="Enviar el acta a firmar">
                    <form action={accionEnviarAFirmar}>
                      <Ocultos vista={vista} />
                      <p className="ayuda">
                        Después de esto, el texto del acta no cambia y los firmantes tienen 10 días
                        para firmar.
                      </p>
                      <div className="fila-acciones">
                        <BotonEnviar texto="Confirmar envío" enviando="Enviando…" />
                      </div>
                    </form>
                  </BotonModal>
                )}
              </div>
            )}

            {vista.yo.esFirmantePendiente && (
              <form action={accionFirmar} className="fila-de-filtros">
                <Ocultos vista={vista} />
                <div className="campo">
                  <label htmlFor="contrasena">Confirmá tu contraseña para firmar</label>
                  <input
                    id="contrasena"
                    name="contrasena"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <button className="boton boton--primario" type="submit">
                  Firmar el acta
                </button>
              </form>
            )}

            {acta.hashContenido && (
              <p className="huella">
                {integridad?.contenido === false || integridad?.final === false ? (
                  <ShieldAlert className="icono" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="icono" aria-hidden="true" />
                )}
                <span>
                  Huella SHA-256 del contenido: <code>{acta.hashContenido}</code>.{' '}
                  {integridad === null
                    ? 'No se pudo verificar ahora.'
                    : integridad.contenido === false || integridad.final === false
                      ? 'Alterada: el archivo guardado no coincide con lo que se firmó.'
                      : 'Íntegra: el archivo guardado coincide con lo que se firmó.'}
                </span>
              </p>
            )}
          </section>
        </div>
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
