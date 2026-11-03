import type { Metadata } from 'next'

import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verConfiguracion } from '@/aplicacion/asambleas/configuracion'

import { AvisoDeError, conConsorcio } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'
import { FormularioConfiguracion } from './formulario-configuracion'

export const metadata: Metadata = { title: 'Reglas de asamblea — Flay' }

export default async function ConfiguracionAsambleasPage({
  params,
}: {
  params: Promise<{ consorcio: string }>
}) {
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Reglas de asamblea')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const valores = await verConfiguracion(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })
    return (
      <>
        <Volver href={`/consorcios/${activo.id}/asambleas`} />
        <h1>Reglas de asamblea</h1>
        <p className="apagado">
          Valen para las próximas convocatorias: una asamblea ya convocada conserva las suyas.
        </p>
        <FormularioConfiguracion consorcioId={activo.id} valores={valores} />
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
