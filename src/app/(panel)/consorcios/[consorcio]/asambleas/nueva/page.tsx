import type { Metadata } from 'next'

import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'

import { AvisoDeError, conConsorcio } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'
import { FormularioAsamblea } from '../formulario-asamblea'

export const metadata: Metadata = { title: 'Nueva asamblea — Flay' }

export default async function NuevaAsambleaPage({
  params,
}: {
  params: Promise<{ consorcio: string }>
}) {
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Nueva asamblea')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const roles = await rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id)
    if (!roles.some((r) => r === 'administrador' || r === 'consejo')) {
      return (
        <>
          <h1>Nueva asamblea</h1>
          <p className="aviso aviso--atencion" role="status">
            Convocan el consejo o la administración del consorcio.
          </p>
        </>
      )
    }
    return (
      <>
        <Volver href={`/consorcios/${activo.id}/asambleas`} />
        <h1>Nueva asamblea</h1>
        <p className="apagado">
          Se guarda como borrador. La convocatoria sale cuando la confirmás, con la anticipación que
          pide el reglamento.
        </p>
        <FormularioAsamblea consorcioId={activo.id} esConsejo={roles.includes('consejo')} />
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
