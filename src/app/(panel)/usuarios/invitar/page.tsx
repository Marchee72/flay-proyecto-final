import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { ROLES_ASIGNABLES } from '@/aplicacion/identidad/roles'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { FormularioInvitar } from './formulario'

export const metadata: Metadata = { title: 'Invitar persona — Flay' }

export default async function InvitarPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const { consorcio } = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)
  const activo = consorcios.find((candidato) => candidato.id === consorcio) ?? consorcios[0]

  // Sin consorcio alcanzable no hay a que invitar; el permiso lo vuelve a
  // verificar el caso de uso al enviar (FR-002).
  if (!activo) redirect('/usuarios')

  return (
    <>
      <h1>Invitar persona</h1>
      <p className="apagado">Al consorcio {activo.nombre}.</p>

      <div className="tarjeta">
        <FormularioInvitar
          consorcioId={activo.id}
          roles={ROLES_ASIGNABLES}
          hoy={RELOJ.hoy().toISOString().slice(0, 10)}
        />
      </div>

      <p>
        <Link href={`/usuarios?consorcio=${activo.id}`}>Volver a usuarios</Link>
      </p>
    </>
  )
}
