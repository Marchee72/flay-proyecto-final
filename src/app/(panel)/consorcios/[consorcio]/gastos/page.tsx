import type { Clasificacion } from '@prisma/client'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Receipt, ScanSearch, Siren } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { conMayuscula, fechaParaMostrar, importeParaMostrar, plural } from '@/compartido/formato'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarGastos } from '@/aplicacion/gastos/listar-gastos'
import { listarPeriodos } from '@/aplicacion/periodos/periodos'
import { listarProveedores, listarRubros } from '@/aplicacion/proveedores/proveedores'

import { conConsorcio } from '../../../con-consorcio'
import { ModalGasto } from './modal-gasto'
import { EnlaceExportar } from '../../../exportar'
import { Filtros } from '../../../filtros'

import { Paginacion } from '../../../paginacion'

export const metadata: Metadata = { title: 'Gastos — Flay' }

/** La direccion puede traer cualquier cosa en `?clasificacion=`; solo pasan dos. */
function esClasificacion(valor: string | undefined): valor is Clasificacion {
  return valor === 'ordinario' || valor === 'extraordinario'
}

type Parametros = {
  periodo?: string
  rubro?: string
  clasificacion?: string
  pagina?: string
  /**
   * `?abrir=1` (desde el Resumen) llega con el modal de alta ya abierto. Es lo
   * unico que lo abre: `periodo` y `rubro` son del filtro, no del alta.
   */
  abrir?: string
}

/**
 * La pantalla del consorcista (`CU-05`, RF-10). Filtros arriba, importes
 * tabulares a la derecha, fila de totales, y la tabla desplazandose **dentro de
 * su contenedor**: en un telefono de 390 px la pagina no se mueve a lo ancho
 * (RNF-01, § 3.4 de la guia de estilos).
 */
export default async function GastosPage({
  params,
  searchParams,
}: {
  params: Promise<{ consorcio: string }>
  searchParams: Promise<Parametros>
}) {
  const { consorcio: consorcioId } = await params
  const parametros = await searchParams
  const pantalla = await conConsorcio(consorcioId, 'Gastos')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  try {
    const [listado, periodos, rubros, proveedores, roles] = await Promise.all([
      listarGastos(HABILITACIONES, RELOJ, {
        usuarioId,
        consorcioId: activo.id,
        periodoId: parametros.periodo || undefined,
        rubroId: parametros.rubro || undefined,
        clasificacion: esClasificacion(parametros.clasificacion)
          ? parametros.clasificacion
          : undefined,
        pagina: Number(parametros.pagina ?? 1) || 1,
      }),
      listarPeriodos(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      listarRubros(),
      listarProveedores(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id),
    ])

    const administra = roles.includes('administrador')
    const mesActual = RELOJ.hoy().toISOString().slice(0, 7)

    return (
      <>
        <h1>Gastos</h1>
        <p className="apagado">Lo que el consorcio pagó, por período y rubro.</p>

        {/* Solo se dibuja lo que el rol puede disparar (RNF-03): registrar y la
            carga asistida son del administrador. */}
        <div className="fila-acciones">
          {administra && (
            <>
              <ModalGasto
                consorcioId={activo.id}
                mesActual={mesActual}
                rubros={rubros.map((rubro) => ({
                  id: rubro.id,
                  etiqueta: rubro.nombre,
                  clasificacion: rubro.clasificacion,
                }))}
                proveedores={proveedores.map((proveedor) => ({
                  id: proveedor.id,
                  etiqueta: proveedor.razonSocial,
                }))}
                abrir={parametros.abrir === '1'}
              />
              <Link
                className="boton boton--fantasma"
                href={`/consorcios/${activo.id}/gastos/asistida`}
              >
                <ScanSearch className="icono" aria-hidden="true" />
                Carga asistida
              </Link>
            </>
          )}
          {roles.some((r) => r === 'administrador' || r === 'consejo') && (
            <EnlaceExportar consorcioId={activo.id} tabla="gastos" />
          )}
        </div>

        <Filtros>
          <form method="get" className="fila-de-filtros">
            <div className="campo">
              <label htmlFor="periodo">Período</label>
              <select id="periodo" name="periodo" defaultValue={parametros.periodo ?? ''}>
                <option value="">Todos</option>
                {periodos.map((periodo) => (
                  <option key={periodo.id} value={periodo.id}>
                    {String(periodo.mes).padStart(2, '0')}/{periodo.anio}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label htmlFor="rubro">Rubro</label>
              <select id="rubro" name="rubro" defaultValue={parametros.rubro ?? ''}>
                <option value="">Todos</option>
                {rubros.map((rubro) => (
                  <option key={rubro.id} value={rubro.id}>
                    {rubro.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label htmlFor="clasificacion">Clasificación</label>
              <select
                id="clasificacion"
                name="clasificacion"
                defaultValue={parametros.clasificacion ?? ''}
              >
                <option value="">Todas</option>
                <option value="ordinario">Ordinario</option>
                <option value="extraordinario">Extraordinario</option>
              </select>
            </div>

            <button className="boton boton--fantasma" type="submit">
              Filtrar
            </button>
          </form>
        </Filtros>

        {listado.cantidad === 0 ? (
          <div className="vacio">
            <Receipt aria-hidden="true" />
            <p>No hay gastos que coincidan con el filtro.</p>
            {administra && (
              <div className="fila-acciones">
                <ModalGasto
                  consorcioId={activo.id}
                  mesActual={mesActual}
                  rubros={rubros.map((rubro) => ({
                    id: rubro.id,
                    etiqueta: rubro.nombre,
                    clasificacion: rubro.clasificacion,
                  }))}
                  proveedores={proveedores.map((proveedor) => ({
                    id: proveedor.id,
                    etiqueta: proveedor.razonSocial,
                  }))}
                />
              </div>
            )}
          </div>
        ) : (
          <>
            <div
              className="tabla-desplazable"
              tabIndex={0}
              role="region"
              aria-label="Gastos del filtro"
            >
              <table>
                <caption className="ayuda">
                  {plural(listado.cantidad, 'gasto', 'gastos')} · página {listado.pagina} de{' '}
                  {listado.paginas}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Rubro</th>
                    <th scope="col">Proveedor</th>
                    <th scope="col">Detalle</th>
                    <th scope="col">Clasificación</th>
                    <th scope="col" className="numero">
                      Importe
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {listado.gastos.map((gasto) => (
                    <tr key={gasto.id}>
                      <td>{fechaParaMostrar(gasto.fecha)}</td>
                      <td>{gasto.rubro}</td>
                      <td>{gasto.proveedor ?? '—'}</td>
                      <td className="principal">
                        <Link href={`/consorcios/${activo.id}/gastos/${gasto.id}`}>
                          {gasto.descripcion || 'Ver detalle'}
                        </Link>
                        {gasto.comprobantes > 0 && (
                          <span className="ayuda"> · {gasto.comprobantes} comprobante(s)</span>
                        )}
                      </td>
                      <td>{conMayuscula(gasto.clasificacion)}</td>
                      <td className="numero cifra">{importeParaMostrar(gasto.importe)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {/* Los dos subtotales son los que la liquidacion prorratea por
                      separado (regla RN-04); se muestran salvo que el filtro ya
                      acote a una sola clasificacion. */}
                  {!parametros.clasificacion && (
                    <>
                      <tr>
                        <td colSpan={5}>Ordinario</td>
                        <td className="numero cifra">
                          {importeParaMostrar(listado.porClasificacion.ordinario)}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={5}>Extraordinario</td>
                        <td className="numero cifra">
                          {importeParaMostrar(listado.porClasificacion.extraordinario)}
                        </td>
                      </tr>
                    </>
                  )}
                  <tr>
                    <td colSpan={5}>Total del filtro</td>
                    <td className="numero cifra">{importeParaMostrar(listado.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <Paginacion
              pagina={listado.pagina}
              paginas={listado.paginas}
              urlParaPagina={(pagina) => {
                const busqueda = new URLSearchParams()
                if (parametros.periodo) busqueda.set('periodo', parametros.periodo)
                if (parametros.rubro) busqueda.set('rubro', parametros.rubro)
                if (parametros.clasificacion)
                  busqueda.set('clasificacion', parametros.clasificacion)
                if (pagina > 1) busqueda.set('pagina', String(pagina))
                const qs = busqueda.toString()
                return `/consorcios/${activo.id}/gastos${qs ? `?${qs}` : ''}`
              }}
              etiquetaAria="Paginación de gastos"
            />
          </>
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
