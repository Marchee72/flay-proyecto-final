import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarPeriodos } from '@/aplicacion/periodos/periodos'
import { listarProveedores, listarRubros } from '@/aplicacion/proveedores/proveedores'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { FormularioGasto } from './formulario'

export const metadata: Metadata = { title: 'Nuevo gasto — Flay' }

/**
 * Alta de gasto. Los parametros de la direccion **precargan** el formulario y
 * quedan marcados como tales (FR-020): es la costura por la que `RF-06` se
 * enchufa en `004-servicios` sin rediseñar la pantalla.
 */
export default async function NuevoGastoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)
  const activo = consorcios.find((c) => c.id === parametros.consorcio) ?? consorcios[0]

  if (!activo) redirect('/consorcios')

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
          <h1>Nuevo gasto</h1>
          <p className="vacio">
            No hay ningún período abierto en {activo.nombre}. Abrí el mes en{' '}
            <Link href={`/periodos?consorcio=${activo.id}`}>Períodos</Link> y volvé.
          </p>
        </>
      )
    }

    return (
      <>
        <h1>Nuevo gasto</h1>
        <p className="apagado">En {activo.nombre}.</p>

        {Object.keys(precargado).length > 0 && (
          <p className="aviso aviso--atencion" role="status">
            Hay campos precargados. Revisalos: el gasto se crea recién cuando lo confirmás.
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

        <p>
          <Link href={`/gastos?consorcio=${activo.id}`}>Volver a gastos</Link>
        </p>
      </>
    )
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    return (
      <p className="aviso aviso--problema" role="alert">
        {error.mensajeParaUsuario}
      </p>
    )
  }
}
