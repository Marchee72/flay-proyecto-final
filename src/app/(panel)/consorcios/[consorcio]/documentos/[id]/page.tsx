import type { Metadata } from 'next'

import { verDocumento } from '@/aplicacion/comunicacion/documentos'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'

import { AvisoDeError, conConsorcio, idONoEncontrado } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'
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
    return (
      <>
        <Volver href={`/consorcios/${activo.id}/documentos`} />
        <h1>{documento.titulo}</h1>
        <div className="fila-acciones">
          <a className="boton boton--fantasma" href={documento.descarga} download>
            Descargar
          </a>
          {roles.includes('administrador') && (
            <ModalEliminar consorcioId={activo.id} documentoId={id} />
          )}
        </div>
        {documento.tipoContenido === 'application/pdf' ? (
          <iframe className="visor" src={documento.vista} title={documento.titulo} />
        ) : (
          <p className="ayuda">Este formato se abre con la descarga.</p>
        )}
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
