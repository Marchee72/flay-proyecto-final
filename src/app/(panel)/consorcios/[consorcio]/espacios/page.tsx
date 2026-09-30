import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarRange, DoorOpen } from 'lucide-react'

import { fechaEnArParaMostrar } from '@/compartido/formato'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarEspacios } from '@/aplicacion/reservas/espacios'

import { AvisoDeError, conConsorcio } from '../../../con-consorcio'
import { Emergente } from '../../../emergente'
import { accionHabilitarEspacio } from '../reservas/acciones'
import { ModalDeshabilitar } from './modal-deshabilitar'
import { ModalEspacio } from './modal-espacio'

export const metadata: Metadata = { title: 'Espacios comunes — Flay' }

/** Espacios comunes y sus reglas (`RF-15`, `FR-009`). Los ve todo el consorcio; el ABM es del administrador y la baja es logica. */
export default async function EspaciosPage({
  params,
  searchParams,
}: {
  params: Promise<{ consorcio: string }>
  searchParams: Promise<{
    guardado?: string
    deshabilitado?: string
    habilitado?: string
    error?: string
  }>
}) {
  const parametros = await searchParams
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Espacios comunes')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const [espacios, roles] = await Promise.all([
      listarEspacios(HABILITACIONES, RELOJ, {
        usuarioId,
        consorcioId: activo.id,
        incluirInactivos: true,
      }),
      rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id),
    ])
    // Solo se dibuja lo que el rol puede disparar (RNF-03).
    const administra = roles.includes('administrador')

    return (
      <>
        <h1>Espacios comunes</h1>
        <p className="apagado">
          Las reglas del reglamento interno, en datos: lo que el sistema aplica al reservar.
        </p>

        {(parametros.guardado || parametros.deshabilitado || parametros.habilitado) && (
          <Emergente tono="verde">
            {parametros.deshabilitado
              ? 'Espacio deshabilitado; las reservas afectadas quedaron canceladas y avisadas.'
              : parametros.habilitado
                ? 'Espacio habilitado; ya se puede reservar.'
                : 'Espacio guardado.'}
          </Emergente>
        )}
        {parametros.error && <Emergente tono="rojo">{parametros.error}</Emergente>}

        {administra && (
          <div className="fila-acciones">
            <ModalEspacio consorcioId={activo.id} />
            <Link
              className="boton boton--fantasma"
              href={`/consorcios/${activo.id}/reservas/historial`}
            >
              <CalendarRange className="icono" aria-hidden="true" />
              Calendario de uso
            </Link>
          </div>
        )}

        {espacios.length === 0 ? (
          <div className="vacio">
            <DoorOpen aria-hidden="true" />
            <p>Sin espacios todavía. El SUM y el quincho son los habituales.</p>
          </div>
        ) : (
          <div className="rejilla">
            {espacios.map((e) => (
              <article
                className={e.activo ? 'tarjeta' : 'tarjeta tarjeta--inactiva'}
                key={e.id}
                aria-label={e.nombre}
              >
                <h2>{e.nombre}</h2>
                {!e.activo && (
                  <p className="etiqueta etiqueta--vencido">
                    Deshabilitado
                    {e.suspension && ` — ${e.suspension.motivo}`}
                    {e.suspension?.hasta && ` (hasta ${fechaEnArParaMostrar(e.suspension.hasta)})`}
                  </p>
                )}
                <dl className="definiciones">
                  <dt>Capacidad</dt>
                  <dd>{e.capacidadMaxima ?? 'Sin tope'}</dd>
                  <dt>Anticipación</dt>
                  <dd>
                    {e.anticipacionMinimaHoras} h a {e.anticipacionMaximaDias} días
                  </dd>
                  <dt>Duración máxima</dt>
                  <dd>{e.duracionMaximaHoras} h</dd>
                  <dt>Por mes y unidad</dt>
                  <dd>{e.reservasMaxMesUnidad}</dd>
                </dl>
                {administra && (
                  <div className="fila-acciones">
                    <ModalEspacio consorcioId={activo.id} espacio={e} />
                    {e.activo ? (
                      <ModalDeshabilitar consorcioId={activo.id} espacio={e} />
                    ) : (
                      <form action={accionHabilitarEspacio}>
                        <input type="hidden" name="consorcio" value={activo.id} />
                        <input type="hidden" name="espacio" value={e.id} />
                        <button className="boton boton--exito" type="submit">
                          <DoorOpen className="icono" aria-hidden="true" />
                          Habilitar
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
