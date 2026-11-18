import Link from 'next/link'
import { Sparkles } from 'lucide-react'

import { plural } from '@/compartido/formato'

import { IconoIA } from '../../../icono-ia'

const lista = new Intl.ListFormat('es', { type: 'conjunction' })

/**
 * Lo que la IA leyo en la documentacion y difiere de la configuracion (`RF-19`):
 * avisa y lleva a revisarlo. Sin pendientes no se dibuja. Nada se aplica sin el
 * clic de la pantalla de destino (RN-14).
 */
export function AvisoDeSugerencias({
  href,
  cantidad,
  documentos,
}: {
  href: string
  cantidad: number
  documentos: string[]
}) {
  if (cantidad === 0) return null
  return (
    <section className="aviso aviso--ia" aria-labelledby="titulo-aviso-sugerencias">
      <IconoIA />
      <div className="aviso--ia__texto">
        <p>
          <strong className="titulo-ia" id="titulo-aviso-sugerencias">
            La IA encontró {plural(cantidad, 'cambio de configuración', 'cambios de configuración')}
          </strong>
        </p>
        <p className="ayuda">
          en {lista.format(documentos.map((d) => `«${d}»`))}. Nada se aplica sin tu clic.
        </p>
      </div>
      <Link className="boton boton--ia-lleno" href={href}>
        <Sparkles className="icono" aria-hidden="true" />
        Revisar
      </Link>
    </section>
  )
}
