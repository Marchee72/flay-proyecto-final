'use client'

import { useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * Disparador + dialogo reutilizable (guia §3.4, patron «Modal»).
 *
 * `<dialog>` nativo con `showModal()`: el Escape cierra solo, el foco queda
 * atrapado adentro mientras esta abierto y al cerrar vuelve al boton que lo
 * abrio. El clic en el fondo (fuera del cuadro) tambien cierra. Sin
 * librerias: solo presentacion, el formulario y la Server Action los pone
 * quien lo usa.
 */
export function BotonModal({
  etiqueta,
  titulo,
  variante = 'boton--primario',
  children,
}: {
  etiqueta: ReactNode
  titulo: string
  variante?: 'boton--primario' | 'boton--fantasma' | 'boton--peligro'
  children: ReactNode | ((cerrar: () => void) => ReactNode)
}) {
  const dialogo = useRef<HTMLDialogElement | null>(null)
  const disparador = useRef<HTMLButtonElement | null>(null)
  const tituloRef = useRef<HTMLHeadingElement | null>(null)
  const tituloId = useId()

  const abrir = () => {
    if (!dialogo.current || dialogo.current.open) return
    dialogo.current.showModal()
    tituloRef.current?.focus()
  }

  const cerrar = () => dialogo.current?.close()

  return (
    <>
      <button ref={disparador} type="button" className={`boton ${variante}`} onClick={abrir}>
        {etiqueta}
      </button>
      <dialog
        ref={dialogo}
        className="modal"
        aria-labelledby={tituloId}
        onClick={(evento) => {
          if (evento.target === dialogo.current) cerrar()
        }}
        onClose={() => disparador.current?.focus()}
      >
        <div className="modal__interior">
          <div className="modal__encabezado">
            <h2 ref={tituloRef} id={tituloId} tabIndex={-1} className="modal__titulo">
              {titulo}
            </h2>
            <button
              type="button"
              className="boton boton--fantasma"
              onClick={cerrar}
              aria-label="Cerrar diálogo"
            >
              <X className="icono" aria-hidden="true" />
              Cerrar
            </button>
          </div>
          {typeof children === 'function' ? children(cerrar) : children}
        </div>
      </dialog>
    </>
  )
}
