import type { Metadata } from 'next'

import { RELOJ } from '@/aplicacion/dependencias'
import { ROLES_ASIGNABLES } from '@/aplicacion/identidad/roles'

import { FormularioInvitar } from './formulario'
import { conConsorcio } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'

export const metadata: Metadata = { title: 'Invitar persona — Flay' }

export default async function InvitarPage({ params }: { params: Promise<{ consorcio: string }> }) {
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Invitar persona')
  if ('salida' in pantalla) return pantalla.salida
  const { activo } = pantalla
  return (
    <>
      <Volver href={`/consorcios/${activo.id}/usuarios`} texto="Volver a usuarios" />
      <h1>Invitar persona</h1>

      <div className="tarjeta">
        <FormularioInvitar
          consorcioId={activo.id}
          roles={ROLES_ASIGNABLES}
          hoy={RELOJ.hoy().toISOString().slice(0, 10)}
        />
      </div>
    </>
  )
}
