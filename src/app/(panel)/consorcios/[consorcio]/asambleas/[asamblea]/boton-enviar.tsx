'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

/**
 * Para las acciones que no se pueden repetir y tardan: avisa que está trabajando
 * y frena el segundo envío. Sigue activo hasta que termina la navegación.
 */
export function BotonEnviar({
  texto,
  enviando,
  clase = 'boton boton--primario',
  deshabilitado = false,
  icono,
}: {
  texto: string
  enviando: string
  clase?: string
  deshabilitado?: boolean
  icono?: ReactNode
}) {
  const { pending } = useFormStatus()
  return (
    <button className={clase} type="submit" disabled={pending || deshabilitado}>
      {icono}
      {pending ? enviando : texto}
    </button>
  )
}
