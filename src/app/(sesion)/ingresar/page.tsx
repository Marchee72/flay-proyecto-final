import type { Metadata } from 'next'
import Link from 'next/link'

import { destinoSeguro } from '@/compartido/destinos'

import { FormularioIngreso } from '../formularios'

export const metadata: Metadata = { title: 'Ingresar — Flay' }

/** `?desde=` lo pone `irAIngresar`: se vuelve a la pantalla que se pidio sin sesion. */
export default async function IngresarPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string }>
}) {
  const { desde } = await searchParams
  return (
    <div className="acceso__formulario">
      <h1>Ingresar</h1>
      <p className="apagado">Con el correo con el que te invitó la administración.</p>

      <FormularioIngreso destino={destinoSeguro(desde, '/')} />

      <p className="ayuda">
        Después de cinco intentos fallidos el ingreso se pausa quince minutos.
      </p>
      <p>
        <Link href="/recuperar">¿Olvidaste tu contraseña?</Link>
      </p>

      <p className="ayuda">
        ¿No tenés cuenta? La crea la administración de tu edificio y te llega una invitación por
        correo.
      </p>
    </div>
  )
}
