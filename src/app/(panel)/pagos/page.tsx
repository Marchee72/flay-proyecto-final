import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { importeParaMostrar } from '@/compartido/formato'
import { misConsorcios, rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { misExpensas } from '@/aplicacion/liquidacion/ver-expensa'
import { verEstadoDeCuenta } from '@/aplicacion/pagos/estado-de-cuenta'

export const metadata: Metadata = { title: 'Pagos — Flay' }

/**
 * Estado de cuenta por unidad (`FR-028`, `CU-04`): liquidaciones, pagos
 * imputados y saldo. El consorcista ve sus unidades; el administrador, todas,
 * y ademas registra pagos.
 */
export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string; registrado?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)
  const activo = consorcios.find((c) => c.id === parametros.consorcio) ?? consorcios[0]
  if (!activo) redirect('/consorcios')

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

    return (
      <>
        <h1>Pagos</h1>
        <p className="apagado">Estado de cuenta por unidad, en {activo.nombre}.</p>

        {parametros.registrado && (
          <p className="aviso aviso--atencion" role="status">
            Pago registrado e imputado a lo más viejo primero.
          </p>
        )}

        {roles.includes('administrador') && (
          <p>
            <Link className="boton boton--primario" href={`/pagos/nuevo?consorcio=${activo.id}`}>
              Registrar un pago
            </Link>
          </p>
        )}

        {cuentas.map((cuenta) => (
          <section key={cuenta.unidadId} className="tarjeta">
            <h2>Unidad {cuenta.designacion}</h2>
            <p>
              Saldo <strong className="cifra">{importeParaMostrar(cuenta.saldo)}</strong>
              {cuenta.saldoAFavor !== '0.00' && (
                <>
                  {' · a favor '}
                  <strong className="cifra">{importeParaMostrar(cuenta.saldoAFavor)}</strong>
                </>
              )}
            </p>

            {cuenta.movimientos.length > 0 && (
              <div className="tabla-desplazable">
                <table>
                  <caption className="ayuda">Movimientos</caption>
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
                    {cuenta.movimientos.map((movimiento, i) => (
                      <tr key={i}>
                        <td>{movimiento.fecha}</td>
                        <td>{movimiento.concepto}</td>
                        <td className="numero cifra">{importeParaMostrar(movimiento.importe)}</td>
                        <td className="numero cifra">{importeParaMostrar(movimiento.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
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
