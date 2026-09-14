import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, Siren, Sparkles } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { momentoParaMostrar } from '@/compartido/formato'
import { ETIQUETAS_ESTADO } from '@/aplicacion/reclamos/estados'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarProveedores, listarRubros } from '@/aplicacion/proveedores/proveedores'
import { posiblesResponsables } from '@/aplicacion/reclamos/asignar'
import { verReclamo } from '@/aplicacion/reclamos/consultar'

import { conConsorcio } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'
import { EstadoDeReclamo, UrgenciaDeReclamo } from '../etiquetas'
import { AccionesDeReclamo } from './acciones-de-reclamo'
import { SugerenciaDeTriage } from './sugerencia'

export const metadata: Metadata = { title: 'Reclamo — Flay' }

/** Detalle con historial completo, acciones por rol y la sugerencia del triage aparte (`CU-08`, `CU-14`). */
export default async function ReclamoPage({
  params,
  searchParams,
}: {
  params: Promise<{ consorcio: string; id: string }>
  searchParams: Promise<{ registrado?: string }>
}) {
  const { consorcio: consorcioId, id } = await params
  const parametros = await searchParams
  const pantalla = await conConsorcio(consorcioId, 'Reclamo')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  try {
    const reclamo = await verReclamo(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
      reclamoId: id,
    })
    const [responsables, proveedores, rubros] = reclamo.puedeAdministrar
      ? await Promise.all([
          posiblesResponsables(activo.id),
          listarProveedores(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
          listarRubros(),
        ])
      : [[], [], []]

    return (
      <>
        <Volver href={`/consorcios/${activo.id}/reclamos`} texto="Volver a reclamos" />
        <h1>{reclamo.titulo}</h1>
        <p className="fila-acciones">
          <EstadoDeReclamo estado={reclamo.estado} />
          <UrgenciaDeReclamo urgencia={reclamo.urgencia} />
        </p>

        {parametros.registrado && (
          <p className="aviso aviso--atencion" role="status">
            <BadgeCheck className="icono" aria-hidden="true" />
            <span>Reclamo registrado. La administración lo va a asignar.</span>
          </p>
        )}

        <section className="tarjeta">
          <p>{reclamo.descripcion}</p>
          <dl className="definiciones">
            <dt>Dónde</dt>
            <dd>{reclamo.unidad ? `Unidad ${reclamo.unidad}` : 'Área común'}</dd>
            <dt>Lo hizo</dt>
            <dd>{reclamo.autor}</dd>
            <dt>Lo atiende</dt>
            <dd>{reclamo.responsable ?? 'Sin responsable todavía'}</dd>
            <dt>Rubro</dt>
            <dd>{reclamo.rubro ?? '—'}</dd>
            <dt>Proveedor</dt>
            <dd>{reclamo.proveedor?.nombre ?? '—'}</dd>
            {reclamo.gastoId && (
              <>
                <dt>Gasto</dt>
                <dd>
                  <Link href={`/consorcios/${activo.id}/gastos/${reclamo.gastoId}`}>
                    Ver el gasto vinculado
                  </Link>
                </dd>
              </>
            )}
          </dl>
        </section>

        <AccionesDeReclamo
          consorcioId={activo.id}
          reclamoId={reclamo.id}
          estado={reclamo.estado}
          responsableId={reclamo.responsableId}
          rubroId={reclamo.rubroId}
          proveedorId={reclamo.proveedorId}
          puedeAdministrar={reclamo.puedeAdministrar}
          esAutor={reclamo.propio}
          responsables={responsables}
          proveedores={proveedores}
          rubros={rubros}
        />

        {reclamo.puedeAdministrar && reclamo.sugerencia && (
          <section className="tarjeta" aria-labelledby="sugerencia">
            <h2 id="sugerencia">
              <Sparkles className="icono" aria-hidden="true" /> Sugerencia automática
            </h2>
            <SugerenciaDeTriage
              consorcioId={activo.id}
              reclamoId={reclamo.id}
              sugerencia={reclamo.sugerencia}
            />
          </section>
        )}

        <section className="tarjeta" aria-labelledby="historial">
          <h2 id="historial">Historial</h2>
          <ol className="historial">
            {reclamo.historial.map((asiento, i) => (
              <li key={i}>
                <strong>
                  {asiento.estadoAnterior
                    ? `${ETIQUETAS_ESTADO[asiento.estadoAnterior]} → ${ETIQUETAS_ESTADO[asiento.estadoNuevo]}`
                    : 'Registrado'}
                </strong>{' '}
                <span className="apagado">
                  · {asiento.usuario} · {momentoParaMostrar(asiento.ocurridoEn)}
                </span>
                {asiento.comentario && <p>{asiento.comentario}</p>}
              </li>
            ))}
          </ol>
        </section>
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
