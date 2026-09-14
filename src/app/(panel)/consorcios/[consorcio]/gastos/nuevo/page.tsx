import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarDays, Siren, TriangleAlert } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarPeriodos } from '@/aplicacion/periodos/periodos'
import { listarProveedores, listarRubros } from '@/aplicacion/proveedores/proveedores'

import { FormularioGasto } from './formulario'
import { conConsorcio } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'

export const metadata: Metadata = { title: 'Nuevo gasto — Flay' }

/**
 * Alta de gasto. Los parametros de la direccion **precargan** el formulario y
 * quedan marcados como tales (FR-020): es la costura por la que `RF-06` se
 * enchufa en `004-servicios` sin rediseñar la pantalla.
 */
export default async function NuevoGastoPage({
  params,
  searchParams,
}: {
  params: Promise<{ consorcio: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { consorcio: consorcioId } = await params
  const parametros = await searchParams
  const pantalla = await conConsorcio(consorcioId, 'Nuevo gasto')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  const precargado = Object.fromEntries(
    (['rubro', 'proveedor', 'importe', 'fecha', 'descripcion', 'periodo'] as const)
      .filter((campo) => parametros[campo])
      .map((campo) => [campo, parametros[campo] as string]),
  )

  try {
    const [periodos, rubros, proveedores] = await Promise.all([
      listarPeriodos(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      listarRubros(),
      listarProveedores(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
    ])

    const abiertos = periodos.filter((periodo) => periodo.estado === 'abierto')

    if (abiertos.length === 0) {
      return (
        <>
          <Volver href={`/consorcios/${activo.id}/gastos`} texto="Volver a gastos" />
          <h1>Nuevo gasto</h1>
          <div className="vacio">
            <CalendarDays aria-hidden="true" />
            <p>
              No hay ningún período abierto en {activo.nombre}. Abrir el mes en{' '}
              <Link href={`/consorcios/${activo.id}/periodos`}>Períodos</Link> y volver.
            </p>
          </div>
        </>
      )
    }

    return (
      <>
        <Volver href={`/consorcios/${activo.id}/gastos`} texto="Volver a gastos" />
        <h1>Nuevo gasto</h1>

        {Object.keys(precargado).length > 0 && (
          <p className="aviso aviso--atencion" role="status">
            <TriangleAlert className="icono" aria-hidden="true" />
            <span>
              Hay campos precargados. Revisar antes de confirmar: el gasto se crea recién al
              confirmar.
            </span>
          </p>
        )}

        <div className="tarjeta">
          <FormularioGasto
            consorcioId={activo.id}
            periodos={abiertos.map((periodo) => ({
              id: periodo.id,
              etiqueta: `${String(periodo.mes).padStart(2, '0')}/${periodo.anio}`,
            }))}
            rubros={rubros.map((rubro) => ({ id: rubro.id, etiqueta: rubro.nombre }))}
            proveedores={proveedores.map((proveedor) => ({
              id: proveedor.id,
              etiqueta: proveedor.razonSocial,
            }))}
            precargado={precargado}
          />
        </div>
      </>
    )
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    return (
      <p className="aviso aviso--problema" role="alert">
        <Siren className="icono" aria-hidden="true" />
        <span>{error.mensajeParaUsuario}</span>
      </p>
    )
  }
}
