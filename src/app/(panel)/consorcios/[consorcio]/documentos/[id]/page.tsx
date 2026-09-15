import type { Metadata } from 'next'

import { verDocumento } from '@/aplicacion/comunicacion/documentos'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'

import { AvisoDeError, conConsorcio, idONoEncontrado } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'

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
    const documento = await verDocumento(ALMACEN, HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
      documentoId: id,
    })
    return (
      <>
        <Volver href={`/consorcios/${activo.id}/documentos`} texto="Volver a documentación" />
        <h1>{documento.titulo}</h1>
        <p>
          <a className="boton boton--fantasma" href={documento.direccion} download>
            Descargar
          </a>
        </p>
        {documento.tipoContenido === 'application/pdf' ? (
          <iframe className="visor" src={documento.direccion} title={documento.titulo} />
        ) : (
          <p className="ayuda">Este formato se abre con la descarga.</p>
        )}
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
