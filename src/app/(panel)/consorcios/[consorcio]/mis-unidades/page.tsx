import type { Metadata } from 'next'
import { House, Siren } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { fechaParaMostrar, plural } from '@/compartido/formato'
import { verOcupantes } from '@/aplicacion/consorcios/inquilinos'
import { TIPOS_DE_UNIDAD_ASIGNABLES } from '@/aplicacion/consorcios/tipos-de-unidad'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'

import { conConsorcio } from '../../../con-consorcio'
import { TablaDesplazable } from '../../../tabla-desplazable'
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
              <TablaDesplazable>
                <table>
                  <caption className="ayuda">
                    {plural(vista.unidades.length, 'unidad', 'unidades')}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Unidad</th>
                      <th scope="col">Tipo</th>
                      <th scope="col">Inquilino</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vista.unidades.map((unidad) => (
                      <tr key={unidad.unidadId}>
                        <td>{unidad.designacion}</td>
                        <td>{etiquetaDeTipo(unidad.tipo)}</td>
                        <td>
                          <CeldaInquilino
                            consorcioId={activo.id}
                            unidad={unidad}
                            gestiona={gestiona}
                            volver="mis-unidades"
                            hoy={hoy}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TablaDesplazable>
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
