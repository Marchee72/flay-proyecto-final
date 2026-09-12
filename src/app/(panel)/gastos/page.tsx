import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Building2, ChevronLeft, ChevronRight, Receipt, Siren } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { importeParaMostrar } from '@/compartido/formato'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarGastos } from '@/aplicacion/gastos/listar-gastos'
import { listarPeriodos } from '@/aplicacion/periodos/periodos'
import { listarProveedores, listarRubros } from '@/aplicacion/proveedores/proveedores'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { AvisoConsorcioNoElegido } from '../selector-consorcio'
import { NOMBRE_GALLETA_CONSORCIO, resolverConsorcioActivo } from '../consorcio-activo'
import { EncabezadoDeConsorcio } from '../encabezado-consorcio'
import { ModalGasto } from './modal-gasto'

export const metadata: Metadata = { title: 'Gastos — Flay' }

type Parametros = {
  consorcio?: string
  periodo?: string
  rubro?: string
  pagina?: string
}

/**
 * La pantalla del consorcista (`CU-05`, RF-10). Filtros arriba, importes
 * tabulares a la derecha, fila de totales, y la tabla desplazandose **dentro de
 * su contenedor**: en un telefono de 390 px la pagina no se mueve a lo ancho
 * (RNF-01, § 3.4 de la guia de estilos).
 */
export default async function GastosPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)

  if (consorcios.length === 0) {
    return (
      <>
        <h1>Gastos</h1>
        <div className="vacio">
          <Building2 aria-hidden="true" />
          <p>Todavía no hay ningún consorcio al alcance.</p>
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
        <h1>Gastos</h1>
        <AvisoConsorcioNoElegido
          consorcios={consorcios}
          base="/gastos"
          parametros={parametros}
          pedidoDesconocido={pedidoDesconocido}
        />
      </>
    )
  }

  try {
    const [listado, periodos, rubros, proveedores] = await Promise.all([
      listarGastos(HABILITACIONES, RELOJ, {
        usuarioId,
        consorcioId: activo.id,
        periodoId: parametros.periodo || undefined,
        rubroId: parametros.rubro || undefined,
        pagina: Number(parametros.pagina ?? 1) || 1,
      }),
      listarPeriodos(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      listarRubros(),
      listarProveedores(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
    ])

    const abiertos = periodos.filter((periodo) => periodo.estado === 'abierto')
    const precargado = Object.fromEntries(
      (['rubro', 'proveedor', 'importe', 'fecha', 'descripcion', 'periodo'] as const)
        .filter((campo) => (parametros as Record<string, string | undefined>)[campo])
        .map((campo) => [
          campo,
          (parametros as Record<string, string | undefined>)[campo] as string,
        ]),
    )

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref="/consorcios"
          volverTexto="Volver a consorcios"
        />
        <h1>Gastos</h1>

        <p>
          <ModalGasto
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
          />{' '}
          <Link className="boton boton--fantasma" href={`/gastos/asistida?consorcio=${activo.id}`}>
            Cargar comprobante con asistencia
          </Link>
        </p>

        <form method="get" className="fila-de-filtros">
          {consorcios.length > 1 ? (
            <div className="campo">
              <label htmlFor="consorcio">Consorcio</label>
              <select id="consorcio" name="consorcio" defaultValue={activo.id}>
                {consorcios.map((consorcio) => (
                  <option key={consorcio.id} value={consorcio.id}>
                    {consorcio.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <input type="hidden" name="consorcio" value={activo.id} />
          )}

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

          <button className="boton boton--fantasma" type="submit">
            Filtrar
          </button>
        </form>

        {listado.cantidad === 0 ? (
          <div className="vacio">
            <Receipt aria-hidden="true" />
            <p>No hay gastos que coincidan con el filtro.</p>
            <p>
              <ModalGasto
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
            </p>
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
                  {listado.cantidad} gastos · página {listado.pagina} de {listado.paginas}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Rubro</th>
                    <th scope="col">Proveedor</th>
                    <th scope="col">Detalle</th>
                    <th scope="col" className="numero">
                      Importe
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {listado.gastos.map((gasto) => (
                    <tr key={gasto.id}>
                      <td>{formatearFecha(gasto.fecha)}</td>
                      <td>{gasto.rubro}</td>
                      <td>{gasto.proveedor ?? '—'}</td>
                      <td>
                        <Link href={`/gastos/${gasto.id}?consorcio=${activo.id}`}>
                          {gasto.descripcion || 'Ver detalle'}
                        </Link>
                        {gasto.comprobantes > 0 && (
                          <span className="ayuda"> · {gasto.comprobantes} comprobante(s)</span>
                        )}
                      </td>
                      <td className="numero cifra">{importeParaMostrar(gasto.importe)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Total del filtro</td>
                    <td className="numero cifra">{importeParaMostrar(listado.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <Paginado listado={listado} parametros={parametros} consorcioId={activo.id} />
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

function Paginado({
  listado,
  parametros,
  consorcioId,
}: {
  listado: { pagina: number; paginas: number }
  parametros: Parametros
  consorcioId: string
}) {
  if (listado.paginas <= 1) return null

  const direccion = (pagina: number) => {
    const busqueda = new URLSearchParams({ consorcio: consorcioId, pagina: String(pagina) })
    if (parametros.periodo) busqueda.set('periodo', parametros.periodo)
    if (parametros.rubro) busqueda.set('rubro', parametros.rubro)
    return `/gastos?${busqueda}`
  }

  const paginas = paginasAMostrar(listado.pagina, listado.paginas)

  return (
    <nav aria-label="Paginación de gastos">
      <ul className="paginacion">
        {listado.pagina > 1 && (
          <li>
            <Link href={direccion(listado.pagina - 1)}>
              <ChevronLeft className="icono" aria-hidden="true" />
              Anterior
            </Link>
          </li>
        )}
        {paginas.map((pagina) => (
          <li key={pagina}>
            {pagina === listado.pagina ? (
              <Link
                href={direccion(pagina)}
                aria-current="page"
                aria-label={`Página ${pagina}, página actual`}
              >
                {pagina}
              </Link>
            ) : (
              <Link href={direccion(pagina)} aria-label={`Ir a la página ${pagina}`}>
                {pagina}
              </Link>
            )}
          </li>
        ))}
        {listado.pagina < listado.paginas && (
          <li>
            <Link href={direccion(listado.pagina + 1)}>
              Siguiente
              <ChevronRight className="icono" aria-hidden="true" />
            </Link>
          </li>
        )}
      </ul>
    </nav>
  )
}

/**
 * `2026-09-05` → `05/09/2026`: solo reordena la cadena (§4, presentación).
 * La fecha no es dinero: se muestra sin `.cifra`.
 */
function formatearFecha(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${anio}`
}

/**
 * Ventana de hasta 5 páginas centrada en la actual (solo presentación): evita
 * una fila de 100 enlaces cuando el listado crece. Sin aritmética monetaria,
 * solo índices de página.
 */
function paginasAMostrar(actual: number, total: number): number[] {
  const inicio = Math.max(1, Math.min(actual - 2, total - 4))
  const fin = Math.min(total, inicio + 4)
  const paginas: number[] = []
  for (let pagina = inicio; pagina <= fin; pagina++) paginas.push(pagina)
  return paginas
}
