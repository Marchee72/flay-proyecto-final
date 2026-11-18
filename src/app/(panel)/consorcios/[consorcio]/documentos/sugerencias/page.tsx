import type { Metadata } from 'next'

import { listarSugerencias } from '@/aplicacion/comunicacion/sugerencias'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'

import { AvisoDeError, conConsorcio } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'
import { IconoIA } from '../../../../icono-ia'
import { Sugerencias } from './sugerencias'

export const metadata: Metadata = { title: 'Sugerencias de configuración — Flay' }

/**
 * Lo que la IA leyo en toda la documentacion y difiere de la configuracion
 * (`RF-19`, RN-14): solo el administrador, agrupado por documento. Nada se
 * aplica sin su clic.
 */
export default async function SugerenciasPage({
  params,
}: {
  params: Promise<{ consorcio: string }>
}) {
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Sugerencias de configuración')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const sugerencias = await listarSugerencias(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })
    return (
      <>
        <Volver href={`/consorcios/${activo.id}/documentos`} />
        <div className="cabecera-pagina">
          <div>
            <h1>
              <IconoIA /> Sugerencias de configuración
            </h1>
            <p className="apagado">
              Lo que la IA leyó en la documentación y difiere de la configuración. Nada se aplica
              sin tu clic.
            </p>
          </div>
        </div>
        <Sugerencias consorcioId={activo.id} sugerencias={sugerencias} />
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
