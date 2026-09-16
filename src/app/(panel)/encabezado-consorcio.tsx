import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

/**
 * Volver a la pantalla madre dentro del mismo consorcio. El nombre del
 * consorcio ya no va aca: lo dibuja el armazon de `consorcios/[consorcio]`
 * arriba del lateral, una sola vez. Solo el verbo: a donde vuelve lo dice
 * la flecha y el lateral, no hace falta repetirlo.
 */
export function Volver({ href }: { href: string }) {
  return (
    <p className="volver">
      <Link className="boton boton--fantasma" href={href}>
        <ArrowLeft className="icono" aria-hidden="true" />
        Volver
      </Link>
    </p>
  )
}
