import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { misConsorcios, rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarProveedores, listarRubros } from '@/aplicacion/proveedores/proveedores'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { FormularioProveedor } from './formulario'

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
  const activo = consorcios.find((c) => c.id === parametros.consorcio) ?? consorcios[0]

  if (!activo) redirect('/consorcios')

  try {
    const [proveedores, rubros, roles] = await Promise.all([
      listarProveedores(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      listarRubros(),
      rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id),
    ])

    return (
      <>
        <h1>Proveedores</h1>
        <p className="apagado">De {activo.nombre}.</p>

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
          <p className="vacio">Todavía no hay proveedores cargados.</p>
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
                    <td className="cifra">{proveedor.cuit}</td>
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
        {error.mensajeParaUsuario}
      </p>
    )
  }
}
