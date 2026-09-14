import type { Metadata } from 'next'
import { Siren, Truck } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarProveedores, listarRubros } from '@/aplicacion/proveedores/proveedores'

import { FormularioProveedor } from './formulario'
import { conConsorcio } from '../../../con-consorcio'

export const metadata: Metadata = { title: 'Proveedores — Flay' }

export default async function ProveedoresPage({
  params,
}: {
  params: Promise<{ consorcio: string }>
}) {
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Proveedores')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  try {
    const [proveedores, rubros, roles] = await Promise.all([
      listarProveedores(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      listarRubros(),
      rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id),
    ])

    return (
      <>
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
