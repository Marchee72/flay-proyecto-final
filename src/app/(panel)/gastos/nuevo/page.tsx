import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Building2, CalendarDays, Siren, TriangleAlert } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarPeriodos } from '@/aplicacion/periodos/periodos'
import { listarProveedores, listarRubros } from '@/aplicacion/proveedores/proveedores'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { FormularioGasto } from './formulario'
import { EncabezadoDeConsorcio } from '../../encabezado-consorcio'
import { AvisoConsorcioNoElegido } from '../../selector-consorcio'
import { NOMBRE_GALLETA_CONSORCIO, resolverConsorcioActivo } from '../../consorcio-activo'

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

  if (consorcios.length === 0) {
    return (
      <>
        <h1>Nuevo gasto</h1>
        <div className="vacio">
          <Building2 aria-hidden="true" />
          <p>
            Todavía no hay ningún consorcio al alcance. El paso siguiente es pedir acceso a la
            administración.
          </p>
        </div>
      </>
    )
  }

  const galletas = await cookies()
  const { activo, pedidoDesconocido } = resolverConsorcioActivo(
    parametros,
    consorcios,
    galletas.get(NOMBRE_GALLETA_CONSORCIO)?.value,
  )

  if (!activo) {
    return (
      <>
        <h1>Nuevo gasto</h1>
        <AvisoConsorcioNoElegido
          consorcios={consorcios}
          base="/gastos/nuevo"
          parametros={parametros}
          pedidoDesconocido={pedidoDesconocido}
        />
      </>
    )
  }

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
          <EncabezadoDeConsorcio
            nombre={activo.nombre}
            volverHref={`/gastos?consorcio=${activo.id}`}
            volverTexto="Volver a gastos"
          />
          <h1>Nuevo gasto</h1>
          <div className="vacio">
            <CalendarDays aria-hidden="true" />
            <p>
              No hay ningún período abierto en {activo.nombre}. Abrir el mes en{' '}
              <Link href={`/periodos?consorcio=${activo.id}`}>Períodos</Link> y volver.
            </p>
          </div>
        </>
      )
    }

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref={`/gastos?consorcio=${activo.id}`}
          volverTexto="Volver a gastos"
        />
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
