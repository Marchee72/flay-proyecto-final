import type { Metadata } from 'next'
import Link from 'next/link'

import { FormularioRecuperar } from './formulario'

export const metadata: Metadata = { title: 'Recuperar contraseña — Flay' }

/** Pedido propio del enlace para cambiar la clave (RF-03, C5). */
export default function RecuperarPage() {
  return (
    <div className="acceso__formulario">
      <h1>Recuperar contraseña</h1>
      <p className="apagado">Te mandamos un enlace al correo para que elijas una nueva.</p>

      <FormularioRecuperar />

      <p>
        <Link href="/ingresar">Volver a ingresar</Link>
      </p>
    </div>
  )
}
