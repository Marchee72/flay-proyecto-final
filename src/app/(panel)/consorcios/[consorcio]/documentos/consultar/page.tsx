import type { Metadata } from 'next'

import { conConsorcio } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'
import { FormularioDeConsulta } from './formulario'

export const metadata: Metadata = { title: 'Consultar la documentación — Flay' }

/** Consulta en lenguaje natural sobre la documentacion del consorcio (`RF-20`, `CU-10`). */
export default async function ConsultarPage({
  params,
}: {
  params: Promise<{ consorcio: string }>
}) {
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Consultar la documentación')
  if ('salida' in pantalla) return pantalla.salida
  const { activo } = pantalla

  return (
    <>
      <Volver href={`/consorcios/${activo.id}/documentos`} />
      <h1>Preguntarle a la documentación</h1>
      <p className="apagado">
        Reglamento, actas y contratos del consorcio. Toda respuesta cita el documento y el
        fragmento; sin fuente, no hay respuesta.
      </p>
      <FormularioDeConsulta consorcioId={activo.id} />
    </>
  )
}
