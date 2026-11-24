import type { Metadata } from 'next'
import { House, Siren } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { fechaParaMostrar } from '@/compartido/formato'
import { verOcupantes, type InquilinoDeUnidad } from '@/aplicacion/consorcios/inquilinos'
import { TIPOS_DE_UNIDAD_ASIGNABLES } from '@/aplicacion/consorcios/tipos-de-unidad'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'

import { conConsorcio } from '../../../con-consorcio'
import { CeldaInquilino } from '../ocupantes/celda-inquilino'

export const metadata: Metadata = { title: 'Mis unidades — Flay' }

/**
 * Las unidades donde la cuenta es propietaria vigente, con la gestion de sus
 * inquilinos (RF-03, FR-008b), y debajo las que alquila.
 */
export default async function MisUnidadesPage({
  params,
}: {
  params: Promise<{ consorcio: string }>
}) {
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Mis unidades')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const vista = await verOcupantes(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })
    const gestiona = vista.gestiona && !activo.archivadoEn
    const hoy = RELOJ.hoy().toISOString().slice(0, 10)

    return (
      <>
        <h1>Mis unidades</h1>
        <p className="apagado">Las unidades a nombre de esta cuenta y sus inquilinos.</p>

        {vista.unidades.length === 0 && vista.alquilo.length === 0 ? (
          <div className="vacio">
            <House aria-hidden="true" />
            <p>No hay unidades a nombre de esta cuenta en este consorcio.</p>
          </div>
        ) : (
          <>
            {vista.unidades.length > 0 && (
              <div className="unidades-fichas">
                {vista.unidades.map((unidad) => {
                  const actual = inquilinoActual(unidad.inquilinos, hoy)
                  return (
                    <article key={unidad.unidadId} className="unidad-ficha">
                      <div className="unidad-ficha__cuerpo">
                        <span className="unidad-ficha__tipo">{etiquetaDeTipo(unidad.tipo)}</span>
                        <h2 className="unidad-ficha__numero">
                          <span className="oculto">Unidad </span>
                          {unidad.designacion}
                        </h2>
                        <span
                          className="unidad-ficha__estado"
                          data-estado={actual ? 'alquilada' : 'libre'}
                        >
                          {actual ? 'Alquilada' : 'Sin inquilino'}
                        </span>
                      </div>
                      {(gestiona || unidad.inquilinos.length > 0) && (
                        <div className="unidad-ficha__pie">
                          <CeldaInquilino
                            consorcioId={activo.id}
                            unidad={unidad}
                            gestiona={gestiona}
                            volver="mis-unidades"
                            hoy={hoy}
                          />
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}

            {vista.alquilo.map((item) => (
              <p key={`${item.designacion}-${item.desde}`} className="apagado">
                {item.hasta
                  ? `Unidad ${item.designacion} en alquiler desde ${fechaParaMostrar(item.desde)} hasta ${fechaParaMostrar(item.hasta)}.`
                  : `Unidad ${item.designacion} en alquiler desde ${fechaParaMostrar(item.desde)} sin fecha de fin.`}
              </p>
            ))}
          </>
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

const etiquetaDeTipo = (tipo: string) =>
  TIPOS_DE_UNIDAD_ASIGNABLES.find((candidato) => candidato.valor === tipo)?.etiqueta ?? tipo

const inquilinoActual = (inquilinos: InquilinoDeUnidad[], hoy: string) =>
  inquilinos.find((i) => i.desde <= hoy && (!i.hasta || i.hasta >= hoy))
