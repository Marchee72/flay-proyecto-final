import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

/**
 * Volver a la pantalla madre dentro del mismo consorcio. El nombre del
 * consorcio ya no va aca: lo dibuja el armazon de `consorcios/[consorcio]`
 * arriba del lateral, una sola vez.
 */
export function Volver({ href, texto = 'Volver' }: { href: string; texto?: string }) {
  return (
    <p className="volver">
      <Link className="boton boton--fantasma" href={href}>
        <ArrowLeft className="icono" aria-hidden="true" />
        {texto}
      </Link>
    </p>
  )
}
