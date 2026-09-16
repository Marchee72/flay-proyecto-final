import type { Metadata } from 'next'
import Link from 'next/link'
import { CircleCheck, Siren, Wallet } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { fechaParaMostrar, importeParaMostrar, plural } from '@/compartido/formato'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { misExpensas } from '@/aplicacion/liquidacion/ver-expensa'
import { verEstadoDeCuenta } from '@/aplicacion/pagos/estado-de-cuenta'
import { MEDIOS_DE_PAGO } from '@/aplicacion/pagos/registrar'

import { conConsorcio } from '../../../con-consorcio'
import { EnlaceExportar } from '../../../exportar'
import { ModalPago } from './modal-pago'

export const metadata: Metadata = { title: 'Pagos — Flay' }

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
  searchParams: Promise<{ registrado?: string; unidad?: string; abrir?: string }>
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

        {parametros.registrado && (
          <p className="aviso aviso--exito" role="status">
            <CircleCheck className="icono" aria-hidden="true" />
            <span>Pago registrado e imputado a lo más viejo primero.</span>
          </p>
        )}

        {cuentas.length === 0 ? (
          <div className="vacio">
            <Wallet aria-hidden="true" />
            <p>Sin movimientos todavía. Cuando se emita la primera liquidación, aparece acá.</p>
          </div>
        ) : (
          <div className="tabla-desplazable">
            <table>
              <caption>Estado de cuenta: {plural(cuentas.length, 'unidad', 'unidades')}</caption>
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
                {cuentas.map((cuenta) => {
                  const ultimo = cuenta.movimientos.at(-1)
                  return (
                    <tr key={cuenta.unidadId}>
                      <td>
                        <Link
                          href={`/consorcios/${activo.id}/pagos?unidad=${cuenta.unidadId}#movimientos`}
                          aria-current={cuenta.unidadId === elegida?.unidadId ? 'true' : undefined}
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
            </table>
          </div>
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
