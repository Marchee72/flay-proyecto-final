import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarDays, Siren } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarPeriodos } from '@/aplicacion/periodos/periodos'

import { fechaParaMostrar, importeParaMostrar } from '@/compartido/formato'

import { BotonAnular, BotonCerrar } from './acciones-de-estado'
import { conConsorcio } from '../../../con-consorcio'
import { EstadoDelPeriodo } from '../../../estado-periodo'
import { EnlaceExportar } from '../../../exportar'
import { TablaDesplazable } from '../../../tabla-desplazable'

export const metadata: Metadata = { title: 'Períodos — Flay' }

export default async function PeriodosPage({ params }: { params: Promise<{ consorcio: string }> }) {
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Períodos')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const [periodos, roles] = await Promise.all([
      listarPeriodos(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id),
    ])

    const administra = roles.includes('administrador')

    return (
      <>
        <h1>Períodos</h1>
        <p className="apagado">Un período por mes; aparece al cargar el primer gasto.</p>
        <div className="fila-acciones">
          {roles.some((r) => r === 'administrador' || r === 'consejo') && (
            <EnlaceExportar consorcioId={activo.id} tabla="liquidaciones" />
          )}
        </div>

        {periodos.length === 0 ? (
          <div className="vacio">
            <CalendarDays aria-hidden="true" />
            <p>Todavía no hay períodos: se crean al cargar el primer gasto del mes.</p>
          </div>
        ) : (
          <TablaDesplazable>
            <table>
              <caption className="ayuda">Períodos del consorcio</caption>
              <thead>
                <tr>
                  <th scope="col">Período</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="numero">
                    Gastos
                  </th>
                  <th scope="col" className="numero">
                    Liquidación
                  </th>
                  {administra && <th scope="col">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {periodos.map((periodo) => {
                  const etiqueta = `${String(periodo.mes).padStart(2, '0')}/${periodo.anio}`
                  return (
                    <tr key={periodo.id}>
                      <td>{etiqueta}</td>
                      <td>
                        <EstadoDelPeriodo estado={periodo.estado} />
                      </td>
                      {/* Los gastos se pueden ver siempre, tambien de un periodo
                          liquidado: la liquidacion no los esconde, solo los
                          congela (regla RN-03). */}
                      <td className="numero cifra">
                        {periodo.gastos > 0 ? (
                          <Link href={`/consorcios/${activo.id}/gastos?periodo=${periodo.id}`}>
                            {periodo.gastos}
                          </Link>
                        ) : (
                          periodo.gastos
                        )}
                      </td>
                      <td className="numero cifra">
                        {periodo.liquidacion ? (
                          <>
                            <Link
                              href={`/consorcios/${activo.id}/liquidaciones/${periodo.liquidacion.id}`}
                            >
                              {importeParaMostrar(periodo.liquidacion.totalGeneral)}
                            </Link>
                            <span className="ayuda">
                              {' '}
                              vence {fechaParaMostrar(periodo.liquidacion.vencimiento)}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      {administra && (
                        <td>
                          {periodo.estado === 'abierto' && (
                            <BotonCerrar consorcioId={activo.id} periodoId={periodo.id} />
                          )}
                          {periodo.estado !== 'anulado' && !periodo.liquidacion && (
                            <Link
                              className="boton boton--primario"
                              href={`/consorcios/${activo.id}/periodos/${periodo.id}`}
                            >
                              Revisar y liquidar
                            </Link>
                          )}
                          {periodo.liquidacion && (
                            <BotonAnular
                              consorcioId={activo.id}
                              liquidacionId={periodo.liquidacion.id}
                              periodoEtiqueta={etiqueta}
                              total={importeParaMostrar(periodo.liquidacion.totalGeneral)}
                              vencimiento={fechaParaMostrar(periodo.liquidacion.vencimiento)}
                            />
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TablaDesplazable>
        )}

        {administra && (
          <p>
            <Link href={`/consorcios/${activo.id}/gastos?abrir=1`}>Cargar un gasto</Link>
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
