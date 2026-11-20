import type { Metadata } from 'next'
import Link from 'next/link'
import { EyeOff, FileText } from 'lucide-react'

import { fechaEnArParaMostrar, fechaParaMostrar, plural } from '@/compartido/formato'
import {
  ETIQUETA_INDEXACION,
  listarDocumentos,
  listarDocumentosArchivados,
  TIPOS_DOCUMENTO,
} from '@/aplicacion/comunicacion/documentos'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'

import { accionReindexar, accionRestaurarDocumento } from '../../../comunicacion/acciones'
import { AvisoDeError, conConsorcio } from '../../../con-consorcio'
import { EnVivo } from '../../../en-vivo'
import { IconoIA } from '../../../icono-ia'
import { AvisoDeSugerencias } from './aviso-sugerencias'
import { ModalDocumento } from './modal-documento'
import { ModalEliminar } from './[id]/modal-eliminar'
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
}: {
  params: Promise<{ consorcio: string }>
}) {
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
    const archivados =
      administra && !activo.archivadoEn
        ? await listarDocumentosArchivados(HABILITACIONES, RELOJ, {
            usuarioId,
            consorcioId: activo.id,
          })
        : []
    const conSugerencias = documentos.filter((d) => !!d.sugerenciasPendientes)
    // El estado de indexacion solo lo ve el administrador; para el resto, basta con que haya documentos.
    const consultable = documentos.some((d) => (d.estadoIndexacion ?? 'indexado') === 'indexado')
    const enProceso = documentos.some(
      (d) => d.estadoIndexacion === 'pendiente' || d.estadoIndexacion === 'procesando',
    )

    // Celdas de la tabla de documentos, compartidas por las columnas que las usan.
    const celdaTitulo = (d: (typeof documentos)[number]) => (
      <>
        <span>{d.titulo}</span>
        {!d.visibleConsorcistas && (
          <EyeOff className="icono" aria-label="No visible para consorcistas" />
        )}
      </>
    )
    const celdaEstados = (d: (typeof documentos)[number]) => (
      <div className="estados">
        <span className={`etiqueta ${CLASE_INDEXACION[d.estadoIndexacion!]}`}>
          {ETIQUETA_INDEXACION[d.estadoIndexacion!]}
        </span>
        {!!d.sugerenciasPendientes && (
          <Link
            className="etiqueta etiqueta--ia"
            href={`/consorcios/${activo.id}/documentos/sugerencias#documento-${d.id}`}
          >
            <IconoIA />
            {plural(d.sugerenciasPendientes, 'sugerencia', 'sugerencias')}
          </Link>
        )}
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
      </div>
    )
    const celdaAcciones = (d: (typeof documentos)[number]) => (
      <div className="acciones">
        <Link
          className="boton boton--terciario"
          href={`/consorcios/${activo.id}/documentos/${d.id}`}
        >
          Abrir
        </Link>
        {administra && !activo.archivadoEn && (
          <ModalEliminar consorcioId={activo.id} documentoId={d.id} titulo={d.titulo} />
        )}
      </div>
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
            {consultable && (
              <Link
                className="boton boton--ia"
                href={`/consorcios/${activo.id}/documentos/consultar`}
              >
                <IconoIA />
                Preguntarle a la documentación
              </Link>
            )}
            {administra && !activo.archivadoEn && (
              <ModalDocumento consorcioId={activo.id} tipos={TIPOS_DOCUMENTO} />
            )}
          </div>
        </div>
        {administra && (
          <AvisoDeSugerencias
            href={`/consorcios/${activo.id}/documentos/sugerencias`}
            cantidad={conSugerencias.reduce((n, d) => n + (d.sugerenciasPendientes ?? 0), 0)}
            documentos={conSugerencias.map((d) => d.titulo)}
          />
        )}
        {documentos.length === 0 ? (
          <div className="vacio">
            <FileText aria-hidden="true" />
            <p>Sin documentos todavía.</p>
          </div>
        ) : (
          <TablaDesplazable tabIndex={0} role="region" aria-label="Documentos">
            <table className="documentos">
              <caption>
                Los que los consorcistas no ven llevan el ojo tachado junto al título.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Documento</th>
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
                      <div className="doc">
                        <span className="titulo-fila">{celdaTitulo(d)}</span>
                        <small>{d.tipoEtiqueta}</small>
                      </div>
                    </td>
                    <td className="fecha">
                      {d.fechaDocumento ? fechaParaMostrar(d.fechaDocumento) : '—'}
                    </td>
                    {administra && d.estadoIndexacion && <td>{celdaEstados(d)}</td>}
                    <td>{celdaAcciones(d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaDesplazable>
        )}
        {archivados.length > 0 && (
          <details className="tarjeta">
            <summary>Eliminados ({archivados.length})</summary>
            <ul>
              {archivados.map((a) => (
                <li key={a.id}>
                  <strong>{a.titulo}</strong>{' '}
                  <span className="apagado">
                    archivado el {fechaEnArParaMostrar(a.archivadoEn)}
                  </span>
                  <div className="acciones">
                    <Link
                      className="boton boton--terciario"
                      href={`/consorcios/${activo.id}/documentos/${a.id}`}
                    >
                      Abrir
                    </Link>
                    <form action={accionRestaurarDocumento}>
                      <input type="hidden" name="consorcio" value={activo.id} />
                      <input type="hidden" name="documento" value={a.id} />
                      <button className="boton boton--fantasma" type="submit">
                        Restaurar
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
