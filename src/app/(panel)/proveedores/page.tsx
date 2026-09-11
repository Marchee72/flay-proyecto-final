import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Building2, Siren, Truck } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { misConsorcios, rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarProveedores, listarRubros } from '@/aplicacion/proveedores/proveedores'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { FormularioProveedor } from './formulario'
import { EncabezadoDeConsorcio } from '../encabezado-consorcio'
import { AvisoConsorcioNoElegido } from '../selector-consorcio'
import { NOMBRE_GALLETA_CONSORCIO, resolverConsorcioActivo } from '../consorcio-activo'

export const metadata: Metadata = { title: 'Proveedores — Flay' }

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)

  if (consorcios.length === 0) {
    return (
      <>
        <h1>Proveedores</h1>
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
        <h1>Proveedores</h1>
        <AvisoConsorcioNoElegido
          consorcios={consorcios}
          base="/proveedores"
          parametros={parametros}
          pedidoDesconocido={pedidoDesconocido}
        />
      </>
    )
  }

  try {
    const [proveedores, rubros, roles] = await Promise.all([
      listarProveedores(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      listarRubros(),
      rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id),
    ])

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref="/consorcios"
          volverTexto="Volver a consorcios"
        />
        <h1>Proveedores</h1>

        {roles.includes('administrador') && (
          <div className="tarjeta">
            <h2>Nuevo proveedor</h2>
            <FormularioProveedor
              consorcioId={activo.id}
              rubros={rubros.map((rubro) => ({ id: rubro.id, etiqueta: rubro.nombre }))}
            />
          </div>
        )}

        {proveedores.length === 0 ? (
          <div className="vacio">
            <Truck aria-hidden="true" />
            <p>Todavía no hay proveedores cargados.</p>
          </div>
        ) : (
          <div className="tabla-desplazable">
            <table>
              <caption className="ayuda">Proveedores del consorcio</caption>
              <thead>
                <tr>
                  <th scope="col">Razón social</th>
                  <th scope="col">CUIT</th>
                  <th scope="col">Rubro habitual</th>
                </tr>
              </thead>
              <tbody>
                {proveedores.map((proveedor) => (
                  <tr key={proveedor.id}>
                    <td>{proveedor.razonSocial}</td>
                    <td>{proveedor.cuit}</td>
                    <td>{proveedor.rubroHabitual ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
