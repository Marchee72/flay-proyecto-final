import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { BadgeCheck, Siren, Sparkles } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { momentoParaMostrar } from '@/compartido/formato'
import { ETIQUETAS_ESTADO } from '@/aplicacion/reclamos/estados'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { listarProveedores, listarRubros } from '@/aplicacion/proveedores/proveedores'
import { posiblesResponsables } from '@/aplicacion/reclamos/asignar'
import { verReclamo } from '@/aplicacion/reclamos/consultar'

import { NOMBRE_GALLETA_CONSORCIO, resolverConsorcioActivo } from '../../consorcio-activo'
import { EncabezadoDeConsorcio } from '../../encabezado-consorcio'
import { AvisoConsorcioNoElegido } from '../../selector-consorcio'
import { EstadoDeReclamo, UrgenciaDeReclamo } from '../etiquetas'
import { AccionesDeReclamo } from './acciones-de-reclamo'
import { SugerenciaDeTriage } from './sugerencia'

export const metadata: Metadata = { title: 'Reclamo — Flay' }

/** Detalle con historial completo, acciones por rol y la sugerencia del triage aparte (`CU-08`, `CU-14`). */
export default async function ReclamoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ consorcio?: string; registrado?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const { id } = await params
  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)
  const galletas = await cookies()
  const { activo, pedidoDesconocido } = resolverConsorcioActivo(
    parametros,
    consorcios,
    galletas.get(NOMBRE_GALLETA_CONSORCIO)?.value,
  )

  if (!activo) {
    return (
      <>
        <h1>Reclamo</h1>
        <AvisoConsorcioNoElegido
          consorcios={consorcios}
          base={`/reclamos/${id}`}
          parametros={parametros}
          pedidoDesconocido={pedidoDesconocido}
        />
      </>
    )
  }

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
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref={`/reclamos?consorcio=${activo.id}`}
          volverTexto="Volver a reclamos"
        />
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
                  <Link href={`/gastos/${reclamo.gastoId}?consorcio=${activo.id}`}>
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
