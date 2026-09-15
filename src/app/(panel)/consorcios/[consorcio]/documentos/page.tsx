import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, EyeOff, FileText } from 'lucide-react'

import { fechaParaMostrar } from '@/compartido/formato'
import {
  ETIQUETA_INDEXACION,
  listarDocumentos,
  TIPOS_DOCUMENTO,
} from '@/aplicacion/comunicacion/documentos'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'

import { AvisoDeError, conConsorcio } from '../../../con-consorcio'
import { ModalDocumento } from './modal-documento'

export const metadata: Metadata = { title: 'Documentación — Flay' }

const CLASE_INDEXACION: Record<string, string> = {
  pendiente: 'etiqueta--pendiente',
  procesando: 'etiqueta--propietario',
  indexado: 'etiqueta--rendido',
  error: 'etiqueta--vencido',
}

/**
 * Documentacion del consorcio (`RF-19`, `CU-15`): listado por tipo con el
 * estado de indexacion legible, carga con subida directa y marca de
 * visibilidad, descarga por enlace firmado.
 */
export default async function DocumentosPage({
  params,
  searchParams,
}: {
  params: Promise<{ consorcio: string }>
  searchParams: Promise<{ cargado?: string }>
}) {
  const parametros = await searchParams
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Documentación')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const [documentos, roles] = await Promise.all([
      listarDocumentos(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id),
    ])

    return (
      <>
        <h1>Documentación</h1>
        <p className="apagado">
          Reglamento, actas y contratos del consorcio.{' '}
          <Link href={`/consorcios/${activo.id}/documentos/consultar`}>
            Preguntarle a la documentación
          </Link>
          .
        </p>
        {parametros.cargado && (
          <p className="aviso aviso--exito" role="status">
            <BadgeCheck className="icono" aria-hidden="true" />
            <span>
              Documento cargado. Se indexa en segundo plano; cuando diga «listo» se puede consultar.
            </span>
          </p>
        )}
        {roles.includes('administrador') && (
          <div className="fila-acciones">
            <ModalDocumento consorcioId={activo.id} tipos={TIPOS_DOCUMENTO} />
          </div>
        )}
        {documentos.length === 0 ? (
          <div className="vacio">
            <FileText aria-hidden="true" />
            <p>Sin documentos todavía.</p>
          </div>
        ) : (
          <div className="tabla-desplazable" tabIndex={0} role="region" aria-label="Documentos">
            <table>
              <caption>
                Los que los consorcistas no ven llevan el ojo tachado junto al título.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Documento</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Indexación</th>
                  <th scope="col">
                    <span className="oculto">Descarga</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {documentos.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {d.titulo}
                      {!d.visibleConsorcistas && (
                        <>
                          {' '}
                          <EyeOff className="icono" aria-label="No visible para consorcistas" />
                        </>
                      )}
                    </td>
                    <td>{d.tipoEtiqueta}</td>
                    <td>{d.fechaDocumento ? fechaParaMostrar(d.fechaDocumento) : '—'}</td>
                    <td>
                      <span className={`etiqueta ${CLASE_INDEXACION[d.estadoIndexacion]}`}>
                        {ETIQUETA_INDEXACION[d.estadoIndexacion]}
                      </span>
                      {d.estadoIndexacion === 'error' && d.errorIndexacion && (
                        <p className="ayuda">{d.errorIndexacion}</p>
                      )}
                    </td>
                    <td>
                      <Link
                        className="boton boton--fantasma"
                        href={`/consorcios/${activo.id}/documentos/${d.id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
