'use client'

import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'

import { BotonModal } from '../modal'
import { FormularioPeriodo } from './formulario'

/**
 * Apertura de periodo en modal (guia §3.4, patron «Modal»). Reutiliza el
 * formulario y la Server Action existentes. Como abrir no redirige, el exito
 * cierra el dialogo y deja un `role="status"` que lo confirma.
 */
export function ModalPeriodo({
  consorcioId,
  anio,
  mes,
}: {
  consorcioId: string
  anio: number
  mes: number
}) {
  const [confirmado, setConfirmado] = useState('')

  return (
    <>
      <BotonModal etiqueta="Abrir un mes" titulo="Abrir un mes">
        {(cerrar) => (
          <FormularioPeriodo
            consorcioId={consorcioId}
            anio={anio}
            mes={mes}
            alExito={() => {
              setConfirmado('Período abierto. Ya admite gastos.')
              cerrar()
            }}
          />
        )}
      </BotonModal>
      {confirmado !== '' && (
        <p className="aviso aviso--atencion" role="status">
          <TriangleAlert className="icono" aria-hidden="true" />
          <span>{confirmado}</span>
        </p>
      )}
    </>
  )
}
