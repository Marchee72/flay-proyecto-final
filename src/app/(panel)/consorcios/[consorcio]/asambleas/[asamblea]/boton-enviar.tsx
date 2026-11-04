'use client'

import { useFormStatus } from 'react-dom'

/**
 * Para las acciones que no se pueden repetir y tardan: avisa que está trabajando
 * y frena el segundo envío. Sigue activo hasta que termina la navegación.
 */
export function BotonEnviar({ texto, enviando }: { texto: string; enviando: string }) {
  const { pending } = useFormStatus()
  return (
    <button className="boton boton--primario" type="submit" disabled={pending}>
      {pending ? enviando : texto}
    </button>
  )
}
