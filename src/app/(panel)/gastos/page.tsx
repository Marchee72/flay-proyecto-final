import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarGastos } from '@/aplicacion/gastos/listar-gastos'
import { listarPeriodos } from '@/aplicacion/periodos/periodos'
import { listarRubros } from '@/aplicacion/proveedores/proveedores'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

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
  const activo = consorcios.find((c) => c.id === parametros.consorcio) ?? consorcios[0]

  if (!activo) {
    return (
      <>
        <h1>Gastos</h1>
        <p className="vacio">Todavía no tenés ningún consorcio a tu alcance.</p>
      </>
    )
  }

  try {
    const [listado, periodos, rubros] = await Promise.all([
      listarGastos(HABILITACIONES, RELOJ, {
        usuarioId,
        consorcioId: activo.id,
        periodoId: parametros.periodo || undefined,
        rubroId: parametros.rubro || undefined,
        pagina: Number(parametros.pagina ?? 1) || 1,
      }),
      listarPeriodos(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      listarRubros(),
    ])

    return (
      <>
        <h1>Gastos</h1>
        <p className="apagado">De {activo.nombre}.</p>

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
          <p className="vacio">No hay gastos que coincidan con el filtro.</p>
        ) : (
          <>
            <div className="tabla-desplazable">
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
                      <td className="cifra">{gasto.fecha}</td>
                      <td>{gasto.rubro}</td>
                      <td>{gasto.proveedor ?? '—'}</td>
                      <td>
                        <Link href={`/gastos/${gasto.id}?consorcio=${activo.id}`}>
                          {gasto.descripcion || 'Ver gasto'}
                        </Link>
                        {gasto.comprobantes > 0 && (
                          <span className="ayuda"> · {gasto.comprobantes} comprobante(s)</span>
                        )}
                      </td>
                      <td className="numero cifra">{gasto.importe}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Total del filtro</td>
                    <td className="numero cifra">{listado.total}</td>
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
        {error.mensajeParaUsuario}
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

  return (
    <nav className="fila-de-filtros" aria-label="Paginado">
      {listado.pagina > 1 && (
        <Link className="boton boton--fantasma" href={direccion(listado.pagina - 1)}>
          Anterior
        </Link>
      )}
      {listado.pagina < listado.paginas && (
        <Link className="boton boton--fantasma" href={direccion(listado.pagina + 1)}>
          Siguiente
        </Link>
      )}
    </nav>
  )
}
