import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Siren } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { verConsorcio } from '@/aplicacion/consorcios/ver-consorcio'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { MEDIOS_DE_PAGO } from '@/aplicacion/pagos/registrar'

import { FormularioPago } from './formulario'
import { conConsorcio } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'

export const metadata: Metadata = { title: 'Nuevo pago — Flay' }

export default async function NuevoPagoPage({
  params,
}: {
  params: Promise<{ consorcio: string }>
}) {
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Nuevo pago')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  const roles = await rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id)
  if (!roles.includes('administrador')) redirect(`/consorcios/${activo.id}/pagos`)

  try {
    const consorcio = await verConsorcio(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })

    return (
      <>
        <Volver href={`/consorcios/${activo.id}/pagos`} texto="Volver a pagos" />
        <h1>Nuevo pago</h1>

        <div className="tarjeta">
          <FormularioPago
            consorcioId={activo.id}
            unidades={consorcio.unidades}
            medios={MEDIOS_DE_PAGO}
            hoy={RELOJ.hoy().toISOString().slice(0, 10)}
          />
        </div>
      </>
    )
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    return (
      <p className="aviso aviso--problema" role="alert">
        <Siren className="icono" aria-hidden="true" />
        <span>{error.mensajeParaUsuario}</span>
      </p>
    )
  }
}
