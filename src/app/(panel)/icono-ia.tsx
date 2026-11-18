import { Sparkles } from 'lucide-react'

/**
 * La marca de lo que propone o responde la IA: los destellos con el trazo en
 * degradado (`#ia-trazo`, definido una vez en el layout raiz). Un solo icono
 * para toda la aplicacion.
 */
export function IconoIA({ className = 'icono' }: { className?: string }) {
  return <Sparkles className={className} stroke="url(#ia-trazo)" aria-hidden="true" />
}
