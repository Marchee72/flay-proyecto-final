import type { Metadata } from 'next'
import { BadgeCheck, DoorOpen } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarEspacios } from '@/aplicacion/reservas/espacios'

import { AvisoDeError, conConsorcio } from '../con-consorcio'
import { EncabezadoDeConsorcio } from '../encabezado-consorcio'
import { accionBajaEspacio } from '../reservas/acciones'
import { ModalEspacio } from './modal-espacio'

export const metadata: Metadata = { title: 'Espacios comunes — Flay' }

/** ABM de espacios comunes y sus reglas (`RF-15`, `FR-009`). Solo el administrador; la baja es logica. */
export default async function EspaciosPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string; guardado?: string; baja?: string; error?: string }>
}) {
  const parametros = await searchParams
  const pantalla = await conConsorcio(parametros, '/espacios', 'Espacios comunes')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const espacios = await listarEspacios(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
      incluirInactivos: true,
    })

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref={`/reservas?consorcio=${activo.id}`}
          volverTexto="Volver a reservas"
        />
        <h1>Espacios comunes</h1>
        <p className="apagado">
          Las reglas del reglamento interno, en datos: lo que el sistema aplica al reservar.
        </p>

        {(parametros.guardado || parametros.baja) && (
          <p className="aviso aviso--atencion" role="status">
            <BadgeCheck className="icono" aria-hidden="true" />
            <span>
              {parametros.baja
                ? 'Espacio dado de baja; las reservas futuras quedaron canceladas y avisadas.'
                : 'Espacio guardado.'}
            </span>
          </p>
        )}
        {parametros.error && (
          <AvisoDeError error={new ErrorDeAplicacion(parametros.error, 'RF-15')} />
        )}

        <div className="fila-acciones">
          <ModalEspacio consorcioId={activo.id} />
        </div>

        {espacios.length === 0 ? (
          <div className="vacio">
            <DoorOpen aria-hidden="true" />
            <p>Sin espacios todavía. El SUM y el quincho son los habituales.</p>
          </div>
        ) : (
          <div className="rejilla">
            {espacios.map((e) => (
              <article className="tarjeta" key={e.id} aria-label={e.nombre}>
                <h2>{e.nombre}</h2>
                {!e.activo && <p className="etiqueta etiqueta--vencido">Dado de baja</p>}
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
                {e.activo && (
                  <div className="fila-acciones">
                    <ModalEspacio consorcioId={activo.id} espacio={e} />
                    <form action={accionBajaEspacio}>
                      <input type="hidden" name="consorcio" value={activo.id} />
                      <input type="hidden" name="espacio" value={e.id} />
                      <button className="boton boton--peligro" type="submit">
                        Dar de baja
                      </button>
                    </form>
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
