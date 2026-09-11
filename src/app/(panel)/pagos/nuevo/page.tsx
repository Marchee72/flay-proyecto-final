import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Building2, Siren } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { misConsorcios, rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { verConsorcio } from '@/aplicacion/consorcios/ver-consorcio'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { MEDIOS_DE_PAGO } from '@/aplicacion/pagos/registrar'

import { FormularioPago } from './formulario'
import { EncabezadoDeConsorcio } from '../../encabezado-consorcio'
import { AvisoConsorcioNoElegido } from '../../selector-consorcio'
import { NOMBRE_GALLETA_CONSORCIO, resolverConsorcioActivo } from '../../consorcio-activo'

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

  if (consorcios.length === 0) {
    return (
      <>
        <h1>Nuevo pago</h1>
        <div className="vacio">
          <Building2 aria-hidden="true" />
          <p>
            Todavía no hay ningún consorcio al alcance. El paso siguiente es pedir acceso a la
            administración.
          </p>
        </div>
      </>
    )
  }

  const galletas = await cookies()
  const { activo, pedidoDesconocido } = resolverConsorcioActivo(
    parametros,
    consorcios,
    galletas.get(NOMBRE_GALLETA_CONSORCIO)?.value,
  )

  if (!activo) {
    return (
      <>
        <h1>Nuevo pago</h1>
        <AvisoConsorcioNoElegido
          consorcios={consorcios}
          base="/pagos/nuevo"
          parametros={parametros}
          pedidoDesconocido={pedidoDesconocido}
        />
      </>
    )
  }

  const roles = await rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id)
  if (!roles.includes('administrador')) redirect(`/pagos?consorcio=${activo.id}`)

  try {
    const consorcio = await verConsorcio(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref={`/pagos?consorcio=${activo.id}`}
          volverTexto="Volver a pagos"
        />
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
