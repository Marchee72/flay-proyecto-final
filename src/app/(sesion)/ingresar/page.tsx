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
    <div>
      <span className="marca">FLAY</span>

      <div className="tarjeta">
        <h1>Ingresar</h1>

        {listo && (
          <p className="aviso aviso--atencion" role="status">
            <BadgeCheck className="icono" aria-hidden="true" />
            <span>La contraseña quedó guardada. Ya se puede entrar.</span>
          </p>
        )}

        <FormularioIngreso />
      </div>
    </div>
  )
}
