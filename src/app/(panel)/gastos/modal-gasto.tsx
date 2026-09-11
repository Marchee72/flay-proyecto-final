'use client'

import Link from 'next/link'
import { Plus, TriangleAlert } from 'lucide-react'

import { BotonModal } from '../modal'
import { FormularioGasto, type Opcion } from './nuevo/formulario'

/**
 * Alta de gasto en modal (guia §3.4, patron «Modal»). Reutiliza el formulario
 * con su precargado RN-14 visible y la Server Action existente: el exito
 * redirige al detalle con `?nuevo=1`, donde ya hay un `role="status"`.
 */
export function ModalGasto({
  consorcioId,
  periodos,
  rubros,
  proveedores,
  precargado,
}: {
  consorcioId: string
  periodos: readonly Opcion[]
  rubros: readonly Opcion[]
  proveedores: readonly Opcion[]
  precargado: Readonly<Record<string, string>>
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
    >
      {periodos.length === 0 ? (
        <p className="aviso aviso--atencion" role="status">
          <TriangleAlert className="icono" aria-hidden="true" />
          <span>
            No hay ningún período abierto. Abrir el mes en{' '}
            <Link href={`/periodos?consorcio=${consorcioId}`}>Períodos</Link> y volver.
          </span>
        </p>
      ) : (
        <>
          {Object.keys(precargado).length > 0 && (
            <p className="aviso aviso--atencion" role="status">
              <TriangleAlert className="icono" aria-hidden="true" />
              <span>
                Hay campos precargados. Revisar antes de confirmar: el gasto se crea recién al
                confirmar.
              </span>
            </p>
          )}
          <FormularioGasto
            consorcioId={consorcioId}
            periodos={periodos}
            rubros={rubros}
            proveedores={proveedores}
            precargado={precargado}
          />
        </>
      )}
    </BotonModal>
  )
}
