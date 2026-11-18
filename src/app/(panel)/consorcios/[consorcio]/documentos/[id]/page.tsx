import type { Metadata } from 'next'

import { analisisDeConfiguracion, verDocumento } from '@/aplicacion/comunicacion/documentos'
import { listarSugerencias } from '@/aplicacion/comunicacion/sugerencias'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'

import { accionBuscarConfiguracion } from '../../../../comunicacion/acciones'
import { AvisoDeError, conConsorcio, idONoEncontrado } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'
import { EnVivo } from '../../../../en-vivo'
import { IconoIA } from '../../../../icono-ia'
import { AvisoDeSugerencias } from '../aviso-sugerencias'
import { ModalEliminar } from './modal-eliminar'

export const metadata: Metadata = { title: 'Documento — Flay' }

/** Lectura de un documento por enlace firmado (`CU-15`). Otro consorcio o no visible: «no encontrado». */
export default async function DocumentoPage({
  params,
}: {
  params: Promise<{ consorcio: string; id: string }>
}) {
  const { consorcio: consorcioId, id: crudo } = await params
  const id = idONoEncontrado(crudo)
  const pantalla = await conConsorcio(consorcioId, 'Documento')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const [documento, roles] = await Promise.all([
      verDocumento(ALMACEN, HABILITACIONES, RELOJ, {
        usuarioId,
        consorcioId: activo.id,
        documentoId: id,
      }),
      rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id),
    ])
    const administra = roles.includes('administrador')
    const quien = { usuarioId, consorcioId: activo.id, documentoId: id }
    // Solo el administrador, y solo reglamentos, actas y contratos (RF-19, RN-14).
    const analisis = administra ? await analisisDeConfiguracion(HABILITACIONES, RELOJ, quien) : null
    const pendientes = analisis
      ? (await listarSugerencias(HABILITACIONES, RELOJ, quien)).filter(
          (s) => s.estado === 'pendiente',
        )
      : []
    return (
      <>
        {/* Cada refresco drena la cola: es lo que trae las sugerencias (decision 21). */}
        {analisis?.analizando && <EnVivo />}
        <Volver href={`/consorcios/${activo.id}/documentos`} />
        <h1>{documento.titulo}</h1>
        <div className="fila-acciones">
          <a className="boton boton--fantasma" href={documento.descarga} download>
            Descargar
          </a>
          {analisis?.indexado && (
            <form action={accionBuscarConfiguracion}>
              <input type="hidden" name="consorcio" value={activo.id} />
              <input type="hidden" name="documento" value={id} />
              <button className="boton boton--ia" type="submit" disabled={analisis.analizando}>
                <IconoIA />
                Buscar configuración
              </button>
            </form>
          )}
          {administra && <ModalEliminar consorcioId={activo.id} documentoId={id} />}
        </div>
        {documento.tipoContenido === 'application/pdf' ? (
          <iframe className="visor" src={documento.vista} title={documento.titulo} />
        ) : (
          <p className="ayuda">Este formato se abre con la descarga.</p>
        )}
        {analisis?.analizando ? (
          <p className="aviso aviso--ia" role="status">
            <IconoIA />
            <span>Estamos leyendo el documento: las sugerencias aparecen en un momento.</span>
          </p>
        ) : (
          <AvisoDeSugerencias
            href={`/consorcios/${activo.id}/documentos/sugerencias#documento-${id}`}
            cantidad={pendientes.length}
            documentos={[documento.titulo]}
          />
        )}
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
