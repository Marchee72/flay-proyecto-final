import type { Metadata } from 'next'
import Link from 'next/link'
import { Gavel, Plus, Settings } from 'lucide-react'

import { momentoParaMostrar } from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarAsambleas } from '@/aplicacion/asambleas/ver'

import { AvisoDeError, conConsorcio } from '../../../con-consorcio'
import { EtiquetaEstado } from './etiqueta-estado'

export const metadata: Metadata = { title: 'Asambleas — Flay' }

/** Asambleas del consorcio (RF-29): la próxima arriba; alta para consejo y administración. */
export default async function AsambleasPage({
  params,
}: {
  params: Promise<{ consorcio: string }>
}) {
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Asambleas')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const { asambleas, puedeCrear, esAdministrador } = await listarAsambleas(
      HABILITACIONES,
      RELOJ,
      {
        usuarioId,
        consorcioId: activo.id,
      },
    )
    const base = `/consorcios/${activo.id}/asambleas`

    return (
      <>
        <div className="cabecera-pagina">
          <div>
            <h1>Asambleas</h1>
            <p className="apagado">
              Convocatorias, votaciones en vivo y actas firmadas del consorcio.
            </p>
          </div>
          {(puedeCrear || esAdministrador) && (
            <div className="cabecera-pagina__acciones">
              {esAdministrador && (
                <Link className="boton boton--fantasma" href={`${base}/configuracion`}>
                  <Settings className="icono" aria-hidden="true" />
                  Reglas
                </Link>
              )}
              {puedeCrear && (
                <Link className="boton boton--primario" href={`${base}/nueva`}>
                  <Plus className="icono" aria-hidden="true" />
                  Nueva asamblea
                </Link>
              )}
            </div>
          )}
        </div>

        {asambleas.length === 0 ? (
          <div className="vacio">
            <Gavel aria-hidden="true" />
            <p>Todavía no hay asambleas en este consorcio.</p>
          </div>
        ) : (
          <ul className="lista-asambleas">
            {asambleas.map((a) => (
              <li key={a.id}>
                <Link className="tarjeta tarjeta-asamblea" href={`${base}/${a.id}`}>
                  <span className="tarjeta-asamblea__titulo">{a.titulo}</span>
                  <EtiquetaEstado estado={a.estado} />
                  <span className="apagado">
                    {a.tipo === 'ordinaria' ? 'Ordinaria' : 'Extraordinaria'} ·{' '}
                    {momentoParaMostrar(a.fechaHora)} · {a.lugar}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
