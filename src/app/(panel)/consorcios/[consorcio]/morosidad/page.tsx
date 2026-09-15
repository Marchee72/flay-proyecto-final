import type { Metadata } from 'next'
import { BadgeCheck, Siren, TriangleAlert } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { importeParaMostrar } from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verMorosidad } from '@/aplicacion/pagos/estado-de-cuenta'

import { conConsorcio } from '../../../con-consorcio'

export const metadata: Metadata = { title: 'Morosidad — Flay' }

/**
 * Morosidad (`FR-029`, regla RN-13 § 7.2). Lo que se muestra es lo que el caso
 * de uso devolvio segun el rol: si no vino nomina, no hay nomina que ocultar.
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
              Deuda total{' '}
              <span className="cifra">{importeParaMostrar(morosidad.agregado.deudaTotal)}</span>
            </div>
          </div>
        </div>

        {morosidad.nominada && morosidad.deudores.length === 0 ? (
          <div className="vacio">
            <BadgeCheck aria-hidden="true" />
            <p>Ninguna unidad con deuda vencida.</p>
          </div>
        ) : morosidad.nominada ? (
          <div className="tabla-desplazable">
            <table>
              <caption className="ayuda">Nómina de deudores</caption>
              <thead>
                <tr>
                  <th scope="col">Unidad</th>
                  <th scope="col" className="numero">
                    Períodos vencidos
                  </th>
                  <th scope="col" className="numero">
                    Deuda
                  </th>
                </tr>
              </thead>
              <tbody>
                {morosidad.deudores.map((deudor) => (
                  <tr key={deudor.unidadId}>
                    <td>{deudor.designacion}</td>
                    <td className="numero cifra">{deudor.periodosVencidos}</td>
                    <td className="numero cifra">{importeParaMostrar(deudor.deuda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
