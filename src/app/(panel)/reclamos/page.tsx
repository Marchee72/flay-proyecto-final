import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Building2, MessageSquareWarning, Siren } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { fechaParaMostrar } from '@/compartido/formato'
import {
  ESTADOS_RECLAMO,
  ETIQUETAS_ESTADO,
  type EstadoReclamo,
} from '@/aplicacion/reclamos/estados'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { listarReclamos } from '@/aplicacion/reclamos/consultar'
import { unidadesParaReclamar, URGENCIAS } from '@/aplicacion/reclamos/registrar'

import { NOMBRE_GALLETA_CONSORCIO, resolverConsorcioActivo } from '../consorcio-activo'
import { EncabezadoDeConsorcio } from '../encabezado-consorcio'
import { AvisoConsorcioNoElegido } from '../selector-consorcio'
import { EstadoDeReclamo, UrgenciaDeReclamo } from './etiquetas'
import { ModalReclamo } from './modal-reclamo'

export const metadata: Metadata = { title: 'Reclamos — Flay' }

/**
 * Bandeja de reclamos (`CU-07`, `CU-08`): cards a 390 px, filtro por estado,
 * alta en modal. Quien ve que lo decide el caso de uso, no la pantalla.
 */
export default async function ReclamosPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string; estado?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)

  if (consorcios.length === 0) {
    return (
      <>
        <h1>Reclamos</h1>
        <div className="vacio">
          <Building2 aria-hidden="true" />
          <p>Todavía no hay ningún consorcio al alcance.</p>
        </div>
      </>
    )
  }

  const galletas = await cookies()
  const { activo, pedidoDesconocido } = resolverConsorcioActivo(
    parametros,
    consorcios,
    galletas.get(NOMBRE_GALLETA_CONSORCIO)?.value,
  )

  if (!activo) {
    return (
      <>
        <h1>Reclamos</h1>
        <AvisoConsorcioNoElegido
          consorcios={consorcios}
          base="/reclamos"
          parametros={parametros}
          pedidoDesconocido={pedidoDesconocido}
        />
      </>
    )
  }

  const estado = (ESTADOS_RECLAMO as readonly string[]).includes(parametros.estado ?? '')
    ? (parametros.estado as EstadoReclamo)
    : null

  try {
    const [reclamos, unidades] = await Promise.all([
      listarReclamos(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id, estado }),
      unidadesParaReclamar(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
    ])

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref="/consorcios"
          volverTexto="Volver a consorcios"
        />
        <h1>Reclamos</h1>
        <p className="apagado">Pedidos de intervención, con su historial de estados.</p>

        <div className="fila-acciones">
          <ModalReclamo consorcioId={activo.id} unidades={unidades} urgencias={URGENCIAS} />
        </div>

        <form className="fila-de-filtros" role="search" aria-label="Filtrar reclamos">
          <input type="hidden" name="consorcio" value={activo.id} />
          <div className="campo">
            <label htmlFor="estado">Estado</label>
            <select id="estado" name="estado" defaultValue={estado ?? ''}>
              <option value="">Todos</option>
              {ESTADOS_RECLAMO.map((valor) => (
                <option key={valor} value={valor}>
                  {ETIQUETAS_ESTADO[valor]}
                </option>
              ))}
            </select>
          </div>
          <button className="boton boton--fantasma" type="submit">
            Filtrar
          </button>
        </form>

        {reclamos.length === 0 ? (
          <div className="vacio">
            <MessageSquareWarning aria-hidden="true" />
            <p>
              {estado
                ? `No hay reclamos en estado ${ETIQUETAS_ESTADO[estado].toLowerCase()}.`
                : 'Sin reclamos todavía. El primero se registra con el botón de arriba.'}
            </p>
          </div>
        ) : (
          <div className="rejilla">
            {reclamos.map((reclamo) => (
              <article className="tarjeta tarjeta-consorcio" key={reclamo.id}>
                <div>
                  <h2>
                    <Link href={`/reclamos/${reclamo.id}?consorcio=${activo.id}`}>
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
