import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { misConsorcios, rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { verConsorcio } from '@/aplicacion/consorcios/ver-consorcio'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { MEDIOS_DE_PAGO } from '@/aplicacion/pagos/registrar'

import { FormularioPago } from './formulario'

export const metadata: Metadata = { title: 'Nuevo pago — Flay' }

export default async function NuevoPagoPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)
  const activo = consorcios.find((c) => c.id === parametros.consorcio) ?? consorcios[0]
  if (!activo) redirect('/consorcios')

  const roles = await rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id)
  if (!roles.includes('administrador')) redirect(`/pagos?consorcio=${activo.id}`)

  try {
    const consorcio = await verConsorcio(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })

    return (
      <>
        <h1>Nuevo pago</h1>
        <p className="apagado">En {activo.nombre}.</p>

        <div className="tarjeta">
          <FormularioPago
            consorcioId={activo.id}
            unidades={consorcio.unidades}
            medios={MEDIOS_DE_PAGO}
            hoy={RELOJ.hoy().toISOString().slice(0, 10)}
          />
        </div>

        <p>
          <Link href={`/pagos?consorcio=${activo.id}`}>Volver a pagos</Link>
        </p>
      </>
    )
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    return (
      <p className="aviso aviso--problema" role="alert">
        {error.mensajeParaUsuario}
      </p>
    )
  }
}
