import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, Siren, TriangleAlert, Wallet } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { fechaParaMostrar, importeParaMostrar, plural } from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verMorosidad } from '@/aplicacion/pagos/estado-de-cuenta'

import { conConsorcio } from '../../../con-consorcio'
import { TablaDesplazable } from '../../../tabla-desplazable'

export const metadata: Metadata = { title: 'Morosidad — Flay' }

/**
 * Morosidad (`FR-029`, regla RN-13 § 7.2). Lo que se muestra es lo que el caso
 * de uso devolvio segun el rol: si no vino nomina, no hay nomina que ocultar.
 *
 * Por deudor: a quien llamar, que periodos debe (un `<details>`, sin
 * JavaScript) y el enlace a su estado de cuenta, donde se registra el pago.
 */
export default async function MorosidadPage({
  params,
}: {
  params: Promise<{ consorcio: string }>
}) {
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Morosidad')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  try {
    const morosidad = await verMorosidad(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })

    return (
      <>
        <h1>Morosidad</h1>
        <p className="apagado">Deuda vencida a hoy.</p>

        <div className="fila-kpi">
          <div className="kpi">
            <span className="kpi__icono">
              <TriangleAlert className="icono" aria-hidden="true" />
            </span>
            <div>
              <div className="kpi__rotulo">Unidades con deuda vencida</div>
              <div className="kpi__cifra cifra">
                {morosidad.agregado.unidadesEnMora} de {morosidad.agregado.unidadesTotales}
              </div>
              <div className="kpi__detalle">
                {morosidad.agregado.unidadesTotales > 0
                  ? `${Math.round((morosidad.agregado.unidadesEnMora / morosidad.agregado.unidadesTotales) * 100)} % del consorcio`
                  : 'Sin unidades'}
              </div>
            </div>
          </div>

          <div className="kpi">
            <span className="kpi__icono">
              <Wallet className="icono" aria-hidden="true" />
            </span>
            <div>
              <div className="kpi__rotulo">Deuda total vencida</div>
              <div className="kpi__cifra cifra">
                {importeParaMostrar(morosidad.agregado.deudaTotal)}
              </div>
              <div className="kpi__detalle">Acumulado impago de períodos vencidos</div>
            </div>
          </div>
        </div>

        {morosidad.nominada && morosidad.deudores.length === 0 ? (
          <div className="vacio">
            <BadgeCheck aria-hidden="true" />
            <p>Ninguna unidad con deuda vencida.</p>
          </div>
        ) : morosidad.nominada ? (
          <section className="tarjeta">
            <h2>Nómina de deudores</h2>
            <TablaDesplazable>
              <table>
                <caption className="ayuda">
                  {plural(morosidad.deudores.length, 'unidad deudora', 'unidades deudoras')}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Unidad</th>
                    <th scope="col">Ocupantes</th>
                    <th scope="col">Períodos vencidos</th>
                    <th scope="col" className="numero">
                      Deuda
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {morosidad.deudores.map((deudor) => (
                    <tr key={deudor.unidadId}>
                      <td>
                        <Link
                          href={`/consorcios/${activo.id}/pagos?unidad=${deudor.unidadId}#movimientos`}
                        >
                          {deudor.designacion}
                        </Link>
                      </td>
                      <td>
                        {deudor.ocupantes.length === 0 ? (
                          <span className="ayuda">Sin ocupantes cargados</span>
                        ) : (
                          <ul className="lista-simple lista-simple--apilada">
                            {deudor.ocupantes.map((ocupante) => (
                              <li key={`${ocupante.tipo}-${ocupante.nombre}`}>
                                <span>
                                  {ocupante.nombre}{' '}
                                  <span className="apagado">({ocupante.tipo})</span>
                                </span>
                                <span>
                                  {ocupante.telefono && (
                                    <a href={`tel:${ocupante.telefono}`}>{ocupante.telefono}</a>
                                  )}{' '}
                                  {ocupante.correo && (
                                    <a href={`mailto:${ocupante.correo}`}>{ocupante.correo}</a>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>
                        <details>
                          <summary>
                            {plural(deudor.periodosVencidos, 'período', 'períodos')}
                          </summary>
                          <ul className="lista-simple">
                            {deudor.periodos.map((periodo) => (
                              <li key={periodo.periodo}>
                                <span>
                                  {periodo.periodo}{' '}
                                  <span className="ayuda">
                                    venció {fechaParaMostrar(periodo.vencimiento)}
                                  </span>
                                </span>
                                <span className="cifra">{importeParaMostrar(periodo.saldo)}</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </td>
                      <td className="numero cifra">{importeParaMostrar(deudor.deuda)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Total deuda</td>
                    <td className="numero cifra">
                      {importeParaMostrar(morosidad.agregado.deudaTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </TablaDesplazable>
          </section>
        ) : (
          <p className="ayuda">
            La nómina de deudores la ven el administrador y el consejo de propietarios.
          </p>
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
