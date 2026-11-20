import type { Metadata } from 'next'
import Link from 'next/link'
import { Archive, MessageSquareWarning, Siren } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { fechaParaMostrar } from '@/compartido/formato'
import { ETIQUETAS_ESTADO } from '@/aplicacion/reclamos/estados'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarReclamos } from '@/aplicacion/reclamos/consultar'
import { unidadesParaReclamar, URGENCIAS } from '@/aplicacion/reclamos/registrar'

import { conConsorcio } from '../../../con-consorcio'
import { EstadoDeReclamo, UrgenciaDeReclamo } from './etiquetas'
import { ModalReclamo } from './modal-reclamo'
import { Filtros } from '../../../filtros'

export const metadata: Metadata = { title: 'Reclamos — Flay' }

/** Los que ya no esperan nada de nadie: van plegados, como los consorcios archivados. */
const CERRADOS = ['resuelto', 'cerrado', 'rechazado']

const sinAcentos = (texto: string) => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Bandeja de reclamos (`CU-07`, `CU-08`): cards a 390 px con los abiertos y un
 * buscador, los cerrados plegados abajo, alta en modal. Quien ve que lo decide
 * el caso de uso, no la pantalla.
 */
export default async function ReclamosPage({
  params,
  searchParams,
}: {
  params: Promise<{ consorcio: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const { consorcio: consorcioId } = await params
  const parametros = await searchParams
  const pantalla = await conConsorcio(consorcioId, 'Reclamos')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  const busqueda = sinAcentos((parametros.q ?? '').trim())

  try {
    const [todos, unidades] = await Promise.all([
      listarReclamos(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id, estado: null }),
      unidadesParaReclamar(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
    ])
    const coincide = (r: (typeof todos)[number]) =>
      !busqueda ||
      sinAcentos(
        [r.titulo, r.unidad, r.rubro, r.autor, r.responsable].filter(Boolean).join(' '),
      ).includes(busqueda)
    const reclamos = todos.filter((r) => !CERRADOS.includes(r.estado) && coincide(r))
    const cerrados = todos.filter((r) => CERRADOS.includes(r.estado) && coincide(r))

    return (
      <>
        <h1>Reclamos</h1>
        <p className="apagado">Pedidos de intervención, con su historial de estados.</p>

        {!activo.archivadoEn && (
          <div className="fila-acciones">
            <ModalReclamo consorcioId={activo.id} unidades={unidades} urgencias={URGENCIAS} />
          </div>
        )}

        <Filtros>
          <form className="fila-de-filtros buscador" role="search" aria-label="Buscar reclamo">
            <input type="hidden" name="consorcio" value={activo.id} />
            <div className="campo">
              <label htmlFor="q">Buscar por título, unidad o persona</label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={parametros.q ?? ''}
                autoComplete="off"
              />
            </div>
            <button className="boton boton--fantasma" type="submit">
              Buscar
            </button>
            {busqueda && (
              <Link className="boton boton--fantasma" href={`/consorcios/${activo.id}/reclamos`}>
                Limpiar
              </Link>
            )}
          </form>
        </Filtros>

        {reclamos.length === 0 ? (
          cerrados.length > 0 && !busqueda ? null : (
            <div className="vacio">
              <MessageSquareWarning aria-hidden="true" />
              <p>
                {busqueda
                  ? 'Ningún reclamo coincide con esa búsqueda.'
                  : todos.length > 0
                    ? 'No hay reclamos abiertos.'
                    : 'Sin reclamos todavía. El primero se registra con el botón de arriba.'}
              </p>
            </div>
          )
        ) : (
          <div className="rejilla">
            {reclamos.map((reclamo) => (
              <article className="tarjeta tarjeta-consorcio" key={reclamo.id}>
                <div>
                  <h2>
                    <Link href={`/consorcios/${activo.id}/reclamos/${reclamo.id}`}>
                      {reclamo.titulo}
                    </Link>
                  </h2>
                  <p className="apagado">
                    {reclamo.unidad ? `Unidad ${reclamo.unidad}` : 'Área común'}
                    {reclamo.rubro ? ` · ${reclamo.rubro}` : ''} ·{' '}
                    {fechaParaMostrar(reclamo.fechaApertura)}
                  </p>
                </div>
                <p className="fila-acciones">
                  <EstadoDeReclamo estado={reclamo.estado} />
                  <UrgenciaDeReclamo urgencia={reclamo.urgencia} />
                </p>
                <p className="ayuda">
                  {reclamo.propio ? 'Tuyo' : `De ${reclamo.autor}`}
                  {reclamo.responsable ? ` · atiende ${reclamo.responsable}` : ' · sin responsable'}
                </p>
              </article>
            ))}
          </div>
        )}

        {cerrados.length > 0 && (
          <details className="tarjeta archivados">
            <summary>
              Cerrados <span className="archivados__n">{cerrados.length}</span>
            </summary>
            <ul>
              {cerrados.map((reclamo) => (
                <li key={reclamo.id}>
                  <span className="archivados__icono" aria-hidden="true">
                    <Archive className="icono" aria-hidden="true" />
                  </span>
                  <span className="archivados__texto">
                    <strong>{reclamo.titulo}</strong>
                    <span className="apagado">
                      {reclamo.unidad ? `Unidad ${reclamo.unidad}` : 'Área común'} ·{' '}
                      {fechaParaMostrar(reclamo.fechaApertura)} · {ETIQUETAS_ESTADO[reclamo.estado]}
                    </span>
                  </span>
                  <div className="acciones">
                    <Link
                      className="boton boton--terciario"
                      href={`/consorcios/${activo.id}/reclamos/${reclamo.id}`}
                    >
                      Abrir
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </>
    )
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    return (
      <p className="aviso aviso--problema" role="alert">
        <Siren className="icono" aria-hidden="true" />
        <span>{error.mensajeParaUsuario}</span>
      </p>
    )
  }
}
