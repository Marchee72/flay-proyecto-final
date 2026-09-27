import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, EyeOff, FileText, MessageCircleQuestion } from 'lucide-react'

import { fechaParaMostrar } from '@/compartido/formato'
import {
  ETIQUETA_INDEXACION,
  listarDocumentos,
  TIPOS_DOCUMENTO,
} from '@/aplicacion/comunicacion/documentos'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'

import { accionReindexar } from '../../../comunicacion/acciones'
import { AvisoDeError, conConsorcio } from '../../../con-consorcio'
import { EnVivo } from '../../../en-vivo'
import { ModalDocumento } from './modal-documento'
import { TablaDesplazable } from '../../../tabla-desplazable'

export const metadata: Metadata = { title: 'Documentación — Flay' }

const CLASE_INDEXACION: Record<string, string> = {
  pendiente: 'etiqueta--pendiente',
  procesando: 'etiqueta--propietario',
  indexado: 'etiqueta--rendido',
  error: 'etiqueta--vencido',
}

/**
 * Documentacion del consorcio (`RF-19`, `CU-15`): listado por tipo, carga con
 * subida directa y marca de visibilidad, descarga por enlace firmado. Si ya
 * esta procesado para las consultas solo le importa al administrador: es el
 * unico que ve esa columna, y el que puede reintentar.
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
    const administra = roles.includes('administrador')
    const enProceso = documentos.some(
      (d) => d.estadoIndexacion === 'pendiente' || d.estadoIndexacion === 'procesando',
    )

    return (
      <>
        {/* Cada refresco drena la cola: es lo que hace avanzar el proceso (decision 21). */}
        {enProceso && <EnVivo />}
        <div className="cabecera-pagina">
          <div>
            <h1>Documentación</h1>
            <p className="apagado">Reglamento, actas y contratos del consorcio.</p>
          </div>
          <div className="cabecera-pagina__acciones">
            <Link
              className="boton boton--fantasma"
              href={`/consorcios/${activo.id}/documentos/consultar`}
            >
              <MessageCircleQuestion className="icono" aria-hidden="true" />
              Preguntarle a la documentación
            </Link>
            {administra && <ModalDocumento consorcioId={activo.id} tipos={TIPOS_DOCUMENTO} />}
          </div>
        </div>
        {parametros.cargado && (
          <p className="aviso aviso--exito" role="status">
            <BadgeCheck className="icono" aria-hidden="true" />
            <span>
              Documento cargado. Se procesa en segundo plano; cuando diga «Procesado» ya entra en
              las consultas.
            </span>
          </p>
        )}
        {documentos.length === 0 ? (
          <div className="vacio">
            <FileText aria-hidden="true" />
            <p>Sin documentos todavía.</p>
          </div>
        ) : (
          <TablaDesplazable tabIndex={0} role="region" aria-label="Documentos">
            <table>
              <caption>
                Los que los consorcistas no ven llevan el ojo tachado junto al título.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Documento</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Fecha</th>
                  {administra && <th scope="col">Consultas</th>}
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
                    {administra && d.estadoIndexacion && (
                      <td>
                        <span className={`etiqueta ${CLASE_INDEXACION[d.estadoIndexacion]}`}>
                          {ETIQUETA_INDEXACION[d.estadoIndexacion]}
                        </span>
                        {d.estadoIndexacion === 'error' && d.errorIndexacion && (
                          <p className="ayuda">{d.errorIndexacion}</p>
                        )}
                        {d.estadoIndexacion !== 'indexado' && (
                          <form action={accionReindexar}>
                            <input type="hidden" name="consorcio" value={activo.id} />
                            <input type="hidden" name="documento" value={d.id} />
                            <button type="submit" className="boton boton--terciario">
                              Reintentar
                            </button>
                          </form>
                        )}
                      </td>
                    )}
                    <td>
                      <Link
                        className="boton boton--terciario"
                        href={`/consorcios/${activo.id}/documentos/${d.id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaDesplazable>
        )}
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
