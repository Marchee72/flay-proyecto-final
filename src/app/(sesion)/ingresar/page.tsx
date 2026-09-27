import type { Metadata } from 'next'
import { BadgeCheck } from 'lucide-react'

import { FormularioIngreso } from '../formularios'

export const metadata: Metadata = { title: 'Ingresar — Flay' }

export default async function IngresarPage({
  searchParams,
}: {
  searchParams: Promise<{ listo?: string }>
}) {
  const { listo } = await searchParams

  return (
    <div className="acceso__formulario">
      <h1>Ingresar</h1>
      <p className="apagado">Con el correo con el que te invitó la administración.</p>

      {listo && (
        <p className="aviso aviso--exito" role="status">
          <BadgeCheck className="icono" aria-hidden="true" />
          <span>La contraseña quedó guardada. Ya se puede entrar.</span>
        </p>
      )}

      <FormularioIngreso />

      <p className="ayuda">
        ¿No tenés cuenta? La crea la administración de tu edificio y te llega una invitación por
        correo.
      </p>
    </div>
  )
}
