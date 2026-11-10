import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2 } from 'lucide-react'

import { misAdministradoras } from '@/aplicacion/administradoras/mis-administradoras'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { irAIngresar } from '@/app/ir-a-ingresar'

import { Marco } from '../../marco'
import { FormularioConsorcio } from './formulario'

export const metadata: Metadata = { title: 'Nuevo consorcio — Flay' }

export default async function NuevoConsorcioPage() {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()

  const administradoras = await misAdministradoras(HABILITACIONES, RELOJ, usuarioId)

  return (
    <Marco>
      <h1>Nuevo consorcio</h1>

      {administradoras.length === 0 ? (
        <div className="vacio">
          <Building2 aria-hidden="true" />
          <p>
            Sin administradora al alcance. El alta de consorcios la autoriza el administrador de la
            plataforma.
          </p>
        </div>
      ) : (
        <div className="tarjeta">
          <FormularioConsorcio administradoras={administradoras} />
        </div>
      )}

      <p>
        <Link href="/consorcios">Volver a consorcios</Link>
      </p>
    </Marco>
  )
}
