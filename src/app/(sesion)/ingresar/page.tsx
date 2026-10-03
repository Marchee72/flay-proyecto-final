import type { Metadata } from 'next'

import { FormularioIngreso } from '../formularios'

export const metadata: Metadata = { title: 'Ingresar — Flay' }

export default async function IngresarPage() {
  return (
    <div className="acceso__formulario">
      <h1>Ingresar</h1>
      <p className="apagado">Con el correo con el que te invitó la administración.</p>

      <FormularioIngreso />

      <p className="ayuda">
        ¿No tenés cuenta? La crea la administración de tu edificio y te llega una invitación por
        correo.
      </p>
    </div>
  )
}
