import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { importeParaMostrar } from '@/compartido/formato'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { verMorosidad } from '@/aplicacion/pagos/estado-de-cuenta'

export const metadata: Metadata = { title: 'Morosidad — Flay' }

/**
 * Morosidad (`FR-029`, regla RN-13 § 7.2). Lo que se muestra es lo que el caso
 * de uso devolvio segun el rol: si no vino nomina, no hay nomina que ocultar.
 */
export default async function MorosidadPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)
  const activo = consorcios.find((c) => c.id === parametros.consorcio) ?? consorcios[0]
  if (!activo) redirect('/consorcios')

  try {
    const morosidad = await verMorosidad(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })

    return (
      <>
        <h1>Morosidad</h1>
        <p className="apagado">De {activo.nombre}.</p>

        <div className="tarjeta">
          <p>
            <strong>{morosidad.agregado.unidadesEnMora}</strong> de{' '}
            {morosidad.agregado.unidadesTotales} unidades con deuda vencida · total{' '}
            <strong className="cifra">{importeParaMostrar(morosidad.agregado.deudaTotal)}</strong>
          </p>
        </div>

        {morosidad.nominada ? (
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
        {error.mensajeParaUsuario}
      </p>
    )
  }
}
