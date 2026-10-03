import type { Metadata } from 'next'
import Link from 'next/link'
import { Siren, Wallet } from 'lucide-react'

import { Decimal, importe } from '@/compartido/dinero'
import { ErrorDeAplicacion } from '@/compartido/errores'
import { fechaParaMostrar, importeParaMostrar, plural } from '@/compartido/formato'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { misExpensas } from '@/aplicacion/liquidacion/ver-expensa'
import { verEstadoDeCuenta } from '@/aplicacion/pagos/estado-de-cuenta'
import { MEDIOS_DE_PAGO } from '@/aplicacion/pagos/registrar'
import { divisionDe, pisoDe } from '@/aplicacion/consorcios/unidades'

import { conConsorcio } from '../../../con-consorcio'
import { EnlaceExportar } from '../../../exportar'
import { Filtros } from '../../../filtros'
import { Paginacion } from '../../../paginacion'
import { ModalPago } from './modal-pago'

export const metadata: Metadata = { title: 'Pagos — Flay' }

const POR_PAGINA = 10

type Parametros = {
  registrado?: string
  unidad?: string
  abrir?: string
  piso?: string
  division?: string
  pagina?: string
}

/**
 * Estado de cuenta por unidad (`FR-028`, `CU-04`): liquidaciones, pagos
 * imputados y saldo. El consorcista ve sus unidades; el administrador, todas,
 * y ademas registra pagos.
 */
export default async function PagosPage({
  params,
  searchParams,
}: {
  params: Promise<{ consorcio: string }>
  searchParams: Promise<Parametros>
}) {
  const { consorcio: consorcioId } = await params
  const parametros = await searchParams
  const pantalla = await conConsorcio(consorcioId, 'Pagos')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  try {
    const [roles, unidades] = await Promise.all([
      rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id),
      misExpensas(ALMACEN, HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
    ])

    const cuentas = await Promise.all(
      unidades.map((unidad) =>
        verEstadoDeCuenta(HABILITACIONES, RELOJ, {
          usuarioId,
          consorcioId: activo.id,
          unidadId: unidad.unidadId,
        }),
      ),
    )

    const pisosDisponibles = Array.from(
      new Set(cuentas.map((c) => pisoDe(c.designacion)).filter((p): p is string => p !== null)),
    ).sort((a, b) => {
      if (a === 'PB') return -1
      if (b === 'PB') return 1
      const numA = parseInt(a, 10)
      const numB = parseInt(b, 10)
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB
      return a.localeCompare(b)
    })

    const divisionesDisponibles = Array.from(
      new Set(cuentas.map((c) => divisionDe(c.designacion)).filter((d): d is string => d !== null)),
    ).sort((a, b) => a.localeCompare(b))

    const cuentasFiltradas = cuentas.filter((c) => {
      if (parametros.piso && pisoDe(c.designacion) !== parametros.piso) return false
      if (parametros.division && divisionDe(c.designacion) !== parametros.division) return false
      return true
    })

    const totalSaldo = cuentasFiltradas
      .reduce((acc, c) => acc.plus(importe(c.saldo)), new Decimal(0))
      .toFixed(2)

    const totalAFavor = cuentasFiltradas
      .reduce((acc, c) => acc.plus(importe(c.saldoAFavor)), new Decimal(0))
      .toFixed(2)

    const paginas = Math.max(1, Math.ceil(cuentasFiltradas.length / POR_PAGINA))
    const paginaSolicitada = Number(parametros.pagina ?? 1) || 1
    const paginaActual = Math.min(Math.max(1, paginaSolicitada), paginas)
    const cuentasEnPagina = cuentasFiltradas.slice(
      (paginaActual - 1) * POR_PAGINA,
      paginaActual * POR_PAGINA,
    )

    const urlParaPagina = (p: number) => {
      const query = new URLSearchParams()
      if (parametros.piso) query.set('piso', parametros.piso)
      if (parametros.division) query.set('division', parametros.division)
      if (parametros.unidad) query.set('unidad', parametros.unidad)
      if (p > 1) query.set('pagina', String(p))
      const qs = query.toString()
      return `/consorcios/${activo.id}/pagos${qs ? `?${qs}` : ''}`
    }

    const enlaceUnidad = (uId: string) => {
      const query = new URLSearchParams()
      if (parametros.piso) query.set('piso', parametros.piso)
      if (parametros.division) query.set('division', parametros.division)
      if (paginaActual > 1) query.set('pagina', String(paginaActual))
      query.set('unidad', uId)
      return `/consorcios/${activo.id}/pagos?${query.toString()}#movimientos`
    }

    // Una tabla con el saldo de cada unidad; el detalle de movimientos, de a
    // una (`?unidad=`). Con una sola unidad —el consorcista— se abre sola.
    const elegida =
      cuentas.find((cuenta) => cuenta.unidadId === parametros.unidad) ??
      (cuentas.length === 1 ? cuentas[0] : undefined)

    return (
      <>
        <h1>Pagos</h1>
        <p className="apagado">Estado de cuenta por unidad.</p>
        <div className="fila-acciones">
          {roles.includes('administrador') && (
            <ModalPago
              consorcioId={activo.id}
              unidades={cuentas.map((cuenta) => ({
                id: cuenta.unidadId,
                designacion: cuenta.designacion,
              }))}
              medios={MEDIOS_DE_PAGO}
              hoy={RELOJ.hoy().toISOString().slice(0, 10)}
              abrir={parametros.abrir === '1'}
            />
          )}
          {roles.some((r) => r === 'administrador' || r === 'consejo') && (
            <EnlaceExportar consorcioId={activo.id} tabla="pagos" />
          )}
        </div>

        {cuentas.length === 0 ? (
          <div className="vacio">
            <Wallet aria-hidden="true" />
            <p>Sin movimientos todavía. Cuando se emita la primera liquidación, aparece acá.</p>
          </div>
        ) : (
          <>
            <Filtros>
              <form method="get" className="fila-de-filtros">
                <div className="campo">
                  <label htmlFor="piso">Piso</label>
                  <select id="piso" name="piso" defaultValue={parametros.piso ?? ''}>
                    <option value="">Todos</option>
                    {pisosDisponibles.map((piso) => (
                      <option key={piso} value={piso}>
                        {piso === 'PB' ? 'PB' : `Piso ${piso}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="campo">
                  <label htmlFor="division">División</label>
                  <select id="division" name="division" defaultValue={parametros.division ?? ''}>
                    <option value="">Todas</option>
                    {divisionesDisponibles.map((div) => (
                      <option key={div} value={div}>
                        {div}
                      </option>
                    ))}
                  </select>
                </div>

                <button className="boton boton--fantasma" type="submit">
                  Filtrar
                </button>

                {(parametros.piso || parametros.division) && (
                  <Link className="boton boton--fantasma" href={`/consorcios/${activo.id}/pagos`}>
                    Limpiar
                  </Link>
                )}
              </form>
            </Filtros>

            {cuentasFiltradas.length === 0 ? (
              <div className="vacio">
                <Wallet aria-hidden="true" />
                <p>No hay unidades que coincidan con el filtro.</p>
                <div className="fila-acciones">
                  <Link className="boton boton--fantasma" href={`/consorcios/${activo.id}/pagos`}>
                    Limpiar filtros
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <div className="tabla-desplazable">
                  <table>
                    <caption className="ayuda">
                      Estado de cuenta: {plural(cuentasFiltradas.length, 'unidad', 'unidades')} ·
                      página {paginaActual} de {paginas}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Unidad</th>
                        <th scope="col" className="numero">
                          Saldo
                        </th>
                        <th scope="col" className="numero">
                          A favor
                        </th>
                        <th scope="col">Último movimiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuentasEnPagina.map((cuenta) => {
                        const ultimo = cuenta.movimientos.at(-1)
                        return (
                          <tr key={cuenta.unidadId}>
                            <td>
                              <Link
                                href={enlaceUnidad(cuenta.unidadId)}
                                aria-current={
                                  cuenta.unidadId === elegida?.unidadId ? 'true' : undefined
                                }
                              >
                                {cuenta.designacion}
                              </Link>
                            </td>
                            <td className="numero cifra">{importeParaMostrar(cuenta.saldo)}</td>
                            <td className="numero cifra">
                              {cuenta.saldoAFavor === '0.00'
                                ? '—'
                                : importeParaMostrar(cuenta.saldoAFavor)}
                            </td>
                            <td>
                              {ultimo ? (
                                `${fechaParaMostrar(ultimo.fecha)} · ${ultimo.concepto}`
                              ) : (
                                <span className="ayuda">Sin movimientos</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>
                          {parametros.piso || parametros.division ? 'Total del filtro' : 'Total'}
                        </td>
                        <td className="numero cifra">{importeParaMostrar(totalSaldo)}</td>
                        <td className="numero cifra">
                          {totalAFavor === '0.00' ? '—' : importeParaMostrar(totalAFavor)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <Paginacion
                  pagina={paginaActual}
                  paginas={paginas}
                  urlParaPagina={urlParaPagina}
                  etiquetaAria="Paginación de estado de cuenta"
                />
              </>
            )}
          </>
        )}

        {elegida && (
          <section id="movimientos" className="tarjeta">
            <h2>Unidad {elegida.designacion}</h2>
            <p>
              Saldo <strong className="cifra">{importeParaMostrar(elegida.saldo)}</strong>
              {elegida.saldoAFavor !== '0.00' && (
                <>
                  {' · a favor '}
                  <strong className="cifra">{importeParaMostrar(elegida.saldoAFavor)}</strong>
                </>
              )}
            </p>

            {elegida.movimientos.length > 0 ? (
              <div
                className="tabla-desplazable"
                tabIndex={0}
                role="region"
                aria-label={`Movimientos de la unidad ${elegida.designacion}`}
              >
                <table>
                  <caption>Movimientos</caption>
                  <thead>
                    <tr>
                      <th scope="col">Fecha</th>
                      <th scope="col">Concepto</th>
                      <th scope="col" className="numero">
                        Importe
                      </th>
                      <th scope="col" className="numero">
                        Saldo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {elegida.movimientos.map((movimiento, i) => (
                      <tr key={i}>
                        <td>{fechaParaMostrar(movimiento.fecha)}</td>
                        <td>{movimiento.concepto}</td>
                        <td className="numero cifra">{importeParaMostrar(movimiento.importe)}</td>
                        <td className="numero cifra">{importeParaMostrar(movimiento.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="vacio">
                <Wallet aria-hidden="true" />
                <p>Sin movimientos todavía para esta unidad.</p>
              </div>
            )}
          </section>
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
