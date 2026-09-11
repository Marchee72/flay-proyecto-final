import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { ROLES_ASIGNABLES } from '@/aplicacion/identidad/roles'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { FormularioInvitar } from './formulario'
import { EncabezadoDeConsorcio } from '../../encabezado-consorcio'
import { AvisoConsorcioNoElegido } from '../../selector-consorcio'
import { NOMBRE_GALLETA_CONSORCIO, resolverConsorcioActivo } from '../../consorcio-activo'

export const metadata: Metadata = { title: 'Invitar persona — Flay' }

export default async function InvitarPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)

  // Sin consorcio alcanzable no hay a que invitar; el permiso lo vuelve a
  // verificar el caso de uso al enviar (FR-002).
  if (consorcios.length === 0) redirect('/usuarios')

  const galletas = await cookies()
  const { activo, pedidoDesconocido } = resolverConsorcioActivo(
    parametros,
    consorcios,
    galletas.get(NOMBRE_GALLETA_CONSORCIO)?.value,
  )

  if (!activo) {
    return (
      <>
        <h1>Invitar persona</h1>
        <AvisoConsorcioNoElegido
          consorcios={consorcios}
          base="/usuarios/invitar"
          parametros={parametros}
          pedidoDesconocido={pedidoDesconocido}
        />
      </>
    )
  }

  return (
    <>
      <EncabezadoDeConsorcio
        nombre={activo.nombre}
        volverHref={`/usuarios?consorcio=${activo.id}`}
        volverTexto="Volver a usuarios"
      />
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
