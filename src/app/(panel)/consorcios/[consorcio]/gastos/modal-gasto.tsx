'use client'

import { Plus } from 'lucide-react'

import { BotonModal } from '../../../modal'
import { FormularioGasto, type Opcion, type OpcionRubro } from './formulario'

/**
 * Alta de gasto en modal (guia §3.4, patron «Modal»). Reutiliza el formulario
 * y la Server Action existente: el exito redirige al detalle con `?nuevo=1`,
 * donde ya hay un `role="status"`. Sin precargado: el que viene de un servicio
 * automatico (RN-14) tiene su pantalla, la de la carga asistida.
 */
export function ModalGasto({
  consorcioId,
  mesActual,
  rubros,
  proveedores,
  abrir = false,
}: {
  consorcioId: string
  mesActual: string
  rubros: readonly OpcionRubro[]
  proveedores: readonly Opcion[]
  abrir?: boolean
}) {
  return (
    <BotonModal
      etiqueta={
        <>
          <Plus className="icono" aria-hidden="true" />
          Nuevo gasto
        </>
      }
      titulo="Nuevo gasto"
      abrirAlMontar={abrir}
    >
      <FormularioGasto
        consorcioId={consorcioId}
        mesActual={mesActual}
        rubros={rubros}
        proveedores={proveedores}
        precargado={{}}
      />
    </BotonModal>
  )
}
