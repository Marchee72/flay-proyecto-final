import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { misAdministradoras } from '@/aplicacion/administradoras/mis-administradoras'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { FormularioConsorcio } from './formulario'

export const metadata: Metadata = { title: 'Nuevo consorcio — Flay' }

export default async function NuevoConsorcioPage() {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const administradoras = await misAdministradoras(HABILITACIONES, RELOJ, usuarioId)

  return (
    <>
      <h1>Nuevo consorcio</h1>

      {administradoras.length === 0 ? (
        <p className="vacio">
          No tenés ninguna administradora a tu alcance. El alta de consorcios la autoriza el
          administrador de la plataforma.
        </p>
      ) : (
        <div className="tarjeta">
          <FormularioConsorcio administradoras={administradoras} />
        </div>
      )}

      <p>
        <Link href="/consorcios">Volver a consorcios</Link>
      </p>
    </>
  )
}
